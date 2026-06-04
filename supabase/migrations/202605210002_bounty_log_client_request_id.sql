alter table public.bounty_log
add column if not exists client_request_id text;

create unique index if not exists bounty_log_client_request_id_unique
on public.bounty_log (tournament_id, client_request_id)
where client_request_id is not null;

grant select, insert, update, delete on table public.bounty_log to authenticated, service_role;
