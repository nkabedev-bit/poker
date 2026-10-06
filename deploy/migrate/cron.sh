#!/usr/bin/env bash
# Turns the club's pg_cron jobs on in the self-hosted database — a switch-day step, never
# on a rehearsal copy (the jobs message real players). Mirrors the cloud jobs listed in
# the dump's cron-jobs.tsv, with the app reached over the Docker network.
#
#   bash deploy/migrate/cron.sh
set -euo pipefail

SECRET=$(grep '^CRON_SECRET=' /opt/club/.env | cut -d= -f2-)
[ -n "$SECRET" ] || { echo "CRON_SECRET is empty in /opt/club/.env" >&2; exit 1; }

docker exec -i supabase-db psql -h localhost -U postgres -d postgres \
  --variable ON_ERROR_STOP=1 --variable secret="$SECRET" <<'SQL'
select cron.schedule('dispatch-broadcasts', '*/5 * * * *',
  $$ select public.dispatch_due_club_work(); $$);
select cron.schedule('waitlist-offers', '*/5 * * * *',
  $$ select public.dispatch_expired_waitlist_offers(); $$);
select cron.schedule('birthday-notify', '0 21 * * *', format(
  $cmd$ select net.http_post(
    url := 'http://club-app:3000/api/cron/birthday-notify',
    headers := jsonb_build_object('Authorization', 'Bearer %s', 'Content-Type', 'application/json')
  ); $cmd$, :'secret'));
select cron.schedule('cleanup-cron-run-details', '30 3 * * *',
  $$ delete from cron.job_run_details where end_time < now() - interval '7 days' $$);
select jobname, schedule from cron.job order by jobname;
SQL
