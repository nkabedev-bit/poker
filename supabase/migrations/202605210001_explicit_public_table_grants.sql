grant usage on schema public to authenticated, service_role;

grant select, insert, update, delete on table public.tournaments to authenticated, service_role;
grant select, insert, update, delete on table public.blind_levels to authenticated, service_role;
grant select, insert, update, delete on table public.timer_state to authenticated, service_role;
grant select, insert, update, delete on table public.tournament_extras to authenticated, service_role;
grant select, insert, update, delete on table public.tma_admins to authenticated, service_role;
grant select, insert, update, delete on table public.bounty_log to authenticated, service_role;
grant select, insert, update, delete on table public.client_bot_users to authenticated, service_role;
