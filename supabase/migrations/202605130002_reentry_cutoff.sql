alter table public.blind_levels
add column if not exists reentry_closes boolean not null default false;

alter table public.blind_levels
drop constraint if exists blind_levels_reentry_not_break;

alter table public.blind_levels
add constraint blind_levels_reentry_not_break
check (reentry_closes = false or is_break = false);

create unique index if not exists blind_levels_one_reentry_cutoff
on public.blind_levels (tournament_id)
where reentry_closes = true;

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
