-- The draw that runs on the big screen.
--
-- The winner is decided on the server and stored here, so every screen in the room
-- shows the same result and no browser can steer it. Written as its own key under one
-- row lock: a draw during the game must not overwrite the roster it was read from.
--
-- Each kind of draw is run once per tournament, so a finished one is also recorded in
-- `raffleHistory` — that is what the second press is refused against, and what the
-- admin's screen reads to show the result after the window is closed.

create or replace function public.set_tournament_raffle(
  p_tournament_id uuid,
  p_raffle jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  extras_row public.tournament_extras%rowtype;
  next_data jsonb;
  history jsonb;
  kind text;
begin
  select * into extras_row
  from public.tournament_extras
  where tournament_id = p_tournament_id
  for update;

  if not found then
    raise exception 'Tournament extras not found' using errcode = 'P0002';
  end if;

  if p_raffle is null or p_raffle = 'null'::jsonb then
    -- Closing the window leaves the history alone: the draw still happened.
    next_data := extras_row.data - 'raffle';
  else
    kind := p_raffle->>'kind';
    history := coalesce(extras_row.data->'raffleHistory', '[]'::jsonb);

    -- A different draw of the same kind is refused; the same one may be written again,
    -- which is how the prize is recorded once it has actually been paid in.
    if exists (
      select 1
      from jsonb_array_elements(history) as item
      where item->>'kind' = kind and item->>'id' <> p_raffle->>'id'
    ) then
      raise exception 'Raffle already held: %', kind using errcode = 'P0001';
    end if;

    select coalesce(jsonb_agg(item), '[]'::jsonb)
    into history
    from jsonb_array_elements(history) as item
    where item->>'id' <> p_raffle->>'id';

    next_data := extras_row.data
      || jsonb_build_object('raffle', p_raffle, 'raffleHistory', history || p_raffle);
  end if;

  update public.tournament_extras
  set data = next_data
  where tournament_id = p_tournament_id;

  return coalesce(next_data->'raffle', 'null'::jsonb);
end;
$$;

revoke all on function public.set_tournament_raffle(uuid, jsonb) from public;
grant execute on function public.set_tournament_raffle(uuid, jsonb) to authenticated, service_role;
