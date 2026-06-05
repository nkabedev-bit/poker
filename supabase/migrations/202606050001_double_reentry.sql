-- Fix #3: "double" re-entry.
-- A blind level can be marked as allowing a double re-entry (admin checkbox).
-- When an admin records a re-entry on such a level, they may choose "double":
-- the player buys back in for 2x the starting stack instead of 1x. A double
-- still counts as a single re-entry event (rebuys += 1) for the player's limit
-- and the ticket badge, but contributes one extra starting stack to the bank,
-- tracked via the per-player "doubleRebuys" counter.

alter table public.blind_levels
  add column if not exists double_reentry_available boolean not null default false;

alter table public.bounty_log
  add column if not exists reentry_double boolean not null default false;

-- Expose reentry_closes + double_reentry_available to the admin editor so the
-- per-level checkboxes reflect their saved state on reload.
create or replace function public.get_admin_state()
returns jsonb
language sql
stable
set search_path = public
as $$
  with selected_tournament as (
    select
      id,
      name,
      logo_url,
      starting_stack,
      registration_minutes,
      registration_status,
      public_token
    from public.tournaments
    order by created_at asc
    limit 1
  )
  select case
    when not exists (select 1 from selected_tournament) then null
    else jsonb_build_object(
      'tournament',
      (
        select to_jsonb(tournament_row)
        from selected_tournament tournament_row
      ),
      'timerState',
      (
        select to_jsonb(timer_row)
        from (
          select
            status,
            current_level_index,
            level_started_at,
            paused_remaining_seconds,
            registration_closes_at,
            finished_at
          from public.timer_state
          where tournament_id = (select id from selected_tournament)
          limit 1
        ) timer_row
      ),
      'blindLevels',
      coalesce(
        (
          select jsonb_agg(to_jsonb(level_row) order by level_row.level_order)
          from (
            select
              id,
              level_order,
              small_blind,
              big_blind,
              ante,
              reentry_closes,
              double_reentry_available,
              duration_seconds,
              is_break,
              break_duration_seconds
            from public.blind_levels
            where tournament_id = (select id from selected_tournament)
            order by level_order asc
          ) level_row
        ),
        '[]'::jsonb
      ),
      'extras',
      coalesce(
        (
          select data
          from public.tournament_extras
          where tournament_id = (select id from selected_tournament)
          limit 1
        ),
        '{}'::jsonb
      )
    )
  end;
$$;

revoke all on function public.get_admin_state() from public;
grant execute on function public.get_admin_state() to authenticated;

-- Recreate record_player_elimination with the new p_reentry_double argument.
drop function if exists public.record_player_elimination(uuid, text, jsonb, numeric, numeric, boolean, boolean);

create or replace function public.record_player_elimination(
  p_tournament_id uuid,
  p_eliminated_id text,
  p_killers jsonb,
  p_bounty_chip_award numeric,
  p_mystery_points numeric,
  p_uses_reentry boolean,
  p_is_bounty boolean,
  p_reentry_double boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  extras_row public.tournament_extras%rowtype;
  players_list jsonb;
  updated_players jsonb := '[]'::jsonb;
  active_count integer := 0;
  total_players integer := 0;
  occupied_finish_places integer[] := array[]::integer[];
  finish_place integer := null;
  candidate_place integer;
  tournament_finished boolean := false;
  survivor_id text := null;
  item jsonb;
  item_finish_place integer;
  pid text;
  bounty_share numeric;
  bounty_chips numeric;
  mystery_share numeric;
  new_rebuys integer;
  save_players jsonb;
begin
  select * into extras_row
  from public.tournament_extras
  where tournament_id = p_tournament_id
  for update;

  if not found then
    raise exception 'Tournament extras not found' using errcode = 'P0002';
  end if;

  players_list := coalesce(extras_row.data->'players', '[]'::jsonb);

  for item in select * from jsonb_array_elements(players_list) loop
    total_players := total_players + 1;

    if coalesce(item->>'status', '') = 'active' then
      active_count := active_count + 1;
    end if;

    if coalesce(item->>'finishPlace', '') ~ '^[0-9]+$' then
      item_finish_place := (item->>'finishPlace')::integer;
      if item_finish_place > 1 then
        occupied_finish_places := array_append(occupied_finish_places, item_finish_place);
      end if;
    end if;
  end loop;

  if not p_uses_reentry then
    finish_place := active_count;
    candidate_place := active_count;

    while candidate_place <= greatest(active_count, total_players) loop
      if not candidate_place = any(occupied_finish_places) then
        finish_place := candidate_place;
        exit;
      end if;

      candidate_place := candidate_place + 1;
    end loop;

    if active_count = 2 then
      tournament_finished := true;
      for item in select * from jsonb_array_elements(players_list) loop
        if coalesce(item->>'status', '') = 'active' and item->>'id' != p_eliminated_id then
          survivor_id := item->>'id';
        end if;
      end loop;
    end if;
  end if;

  for item in select * from jsonb_array_elements(players_list) loop
    pid := item->>'id';

    if pid = p_eliminated_id then
      if p_uses_reentry then
        new_rebuys := coalesce((item->>'rebuys')::integer, 0) + 1;
        item := item || jsonb_build_object('rebuys', new_rebuys);
        if p_reentry_double then
          item := item || jsonb_build_object(
            'doubleRebuys', coalesce((item->>'doubleRebuys')::integer, 0) + 1
          );
        end if;
      else
        item := item || jsonb_build_object(
          'status', 'eliminated',
          'finishPlace', finish_place
        );
      end if;
    end if;

    if tournament_finished and pid = survivor_id then
      item := item || jsonb_build_object('finishPlace', 1);
    end if;

    bounty_share := 0;
    bounty_chips := 0;
    mystery_share := 0;

    if p_killers is not null and jsonb_typeof(p_killers) = 'array' then
      select
        coalesce(sum((k->>'share')::numeric), 0),
        coalesce(sum((k->>'share')::numeric * coalesce(p_bounty_chip_award, 0)), 0),
        coalesce(sum((k->>'share')::numeric * coalesce(p_mystery_points, 0)), 0)
      into bounty_share, bounty_chips, mystery_share
      from jsonb_array_elements(p_killers) as k
      where k->>'id' = pid;
    end if;

    if bounty_share > 0 and p_is_bounty then
      item := item || jsonb_build_object(
        'bountyChipsTotal', round(coalesce((item->>'bountyChipsTotal')::numeric, 0) + bounty_chips, 6),
        'bountyCount', round(coalesce((item->>'bountyCount')::numeric, 0) + bounty_share, 6),
        'stack', round(coalesce((item->>'stack')::numeric, 0) + bounty_chips, 6)
      );
    end if;

    if mystery_share > 0 then
      item := item || jsonb_build_object(
        'mysteryBountyPoints', round(coalesce((item->>'mysteryBountyPoints')::numeric, 0) + mystery_share, 2)
      );
    end if;

    updated_players := updated_players || item;
  end loop;

  save_players := updated_players;

  update public.tournament_extras
  set data = extras_row.data || jsonb_build_object('players', save_players)
  where tournament_id = p_tournament_id;

  return jsonb_build_object(
    'players', updated_players,
    'finishPlace', finish_place,
    'tournamentFinished', tournament_finished
  );
end;
$$;

revoke all on function public.record_player_elimination(uuid, text, jsonb, numeric, numeric, boolean, boolean, boolean) from public;
grant execute on function public.record_player_elimination(uuid, text, jsonb, numeric, numeric, boolean, boolean, boolean) to authenticated, service_role;

-- Recreate cancel_player_elimination with the new p_reentry_double argument so
-- undoing a double re-entry also rolls back the extra doubleRebuys counter.
drop function if exists public.cancel_player_elimination(uuid, text, integer, jsonb, numeric, boolean, jsonb);

create or replace function public.cancel_player_elimination(
  p_tournament_id uuid,
  p_eliminated_id text,
  p_finish_place integer,
  p_killers jsonb,
  p_mystery_points numeric,
  p_uses_reentry boolean,
  p_players_before jsonb,
  p_reentry_double boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  extras_row public.tournament_extras%rowtype;
  players_list jsonb;
  updated_players jsonb := '[]'::jsonb;
  item jsonb;
  pid text;
  bounty_share numeric;
  bounty_chips numeric;
  mystery_share numeric;
  restored_finish_place integer;
  new_count integer;
begin
  select * into extras_row
  from public.tournament_extras
  where tournament_id = p_tournament_id
  for update;

  if not found then
    return '[]'::jsonb;
  end if;

  players_list := coalesce(extras_row.data->'players', '[]'::jsonb);
  restored_finish_place := p_finish_place;

  if p_players_before is not null and jsonb_typeof(p_players_before) = 'array' then
    updated_players := p_players_before;
    for item in select * from jsonb_array_elements(players_list) loop
      select count(*) into new_count
      from jsonb_array_elements(p_players_before) as pb
      where pb->>'id' = item->>'id';

      if new_count = 0 then
        updated_players := updated_players || item;
      end if;
    end loop;
  else
    for item in select * from jsonb_array_elements(players_list) loop
      pid := item->>'id';

      if pid = p_eliminated_id then
        if p_uses_reentry then
          item := item || jsonb_build_object(
            'rebuys', greatest(0, coalesce((item->>'rebuys')::integer, 0) - 1)
          );
          if p_reentry_double then
            item := item || jsonb_build_object(
              'doubleRebuys', greatest(0, coalesce((item->>'doubleRebuys')::integer, 0) - 1)
            );
          end if;
        else
          item := item || jsonb_build_object(
            'finishPlace', null,
            'status', 'active'
          );
        end if;
      end if;

      if not p_uses_reentry and restored_finish_place is not null and restored_finish_place > 0 then
        if coalesce(item->>'status', '') = 'eliminated'
           and item->>'finishPlace' is not null
           and (item->>'finishPlace')::integer > 0
           and (item->>'finishPlace')::integer < restored_finish_place then
          item := item || jsonb_build_object(
            'finishPlace', (item->>'finishPlace')::integer + 1
          );
        end if;
      end if;

      if not p_uses_reentry and restored_finish_place = 2 then
        if coalesce((item->>'finishPlace')::integer, 0) = 1 then
          item := item || jsonb_build_object('finishPlace', null);
        end if;
      end if;

      bounty_share := 0;
      bounty_chips := 0;
      mystery_share := 0;

      if p_killers is not null and jsonb_typeof(p_killers) = 'array' then
        select
          coalesce(sum((k->>'share')::numeric), 0),
          coalesce(sum(coalesce((k->>'bountyChips')::numeric, 0)), 0),
          coalesce(sum((k->>'share')::numeric * coalesce(p_mystery_points, 0)), 0)
        into bounty_share, bounty_chips, mystery_share
        from jsonb_array_elements(p_killers) as k
        where k->>'id' = pid;
      end if;

      if bounty_share > 0 then
        item := item || jsonb_build_object(
          'bountyChipsTotal', greatest(0, round(coalesce((item->>'bountyChipsTotal')::numeric, 0) - bounty_chips, 6)),
          'bountyCount', greatest(0, round(coalesce((item->>'bountyCount')::numeric, 0) - bounty_share, 6)),
          'stack', greatest(0, round(coalesce((item->>'stack')::numeric, 0) - bounty_chips, 6))
        );
      end if;

      if mystery_share > 0 then
        item := item || jsonb_build_object(
          'mysteryBountyPoints', greatest(0, round(coalesce((item->>'mysteryBountyPoints')::numeric, 0) - mystery_share, 2))
        );
      end if;

      updated_players := updated_players || item;
    end loop;
  end if;

  update public.tournament_extras
  set data = extras_row.data || jsonb_build_object('players', updated_players)
  where tournament_id = p_tournament_id;

  return updated_players;
end;
$$;

revoke all on function public.cancel_player_elimination(uuid, text, integer, jsonb, numeric, boolean, jsonb, boolean) from public;
grant execute on function public.cancel_player_elimination(uuid, text, integer, jsonb, numeric, boolean, jsonb, boolean) to authenticated, service_role;
