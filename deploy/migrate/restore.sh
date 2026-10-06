#!/usr/bin/env bash
# Restores a dump taken by dump.sh into the self-hosted Supabase on this server, the way
# Supabase's "restore from platform" guide does it, with the club's addresses swapped in.
#
#   bash deploy/migrate/restore.sh ~/migration/<UTC time>
#
# The target database must be fresh (see the runbook for resetting it). pg_cron jobs are
# left unscheduled: on a rehearsal copy they would message real players. cron.sh turns
# them on at the switch.
set -euo pipefail

DUMP=${1:?usage: restore.sh <dump folder>}
WORK="$DUMP/restore"
CLOUD_ORIGIN="https://nqflqsipvqxuubboslak.supabase.co"
OWN_API_ORIGIN="https://api.pokerptz.ru"
OLD_APP_ORIGIN="https://poker-two-liart.vercel.app"
# pg_net in the database container reaches the app over the Docker network.
INTERNAL_APP_ORIGIN="http://club-app:3000"

mkdir -p "$WORK"

echo "== rewriting addresses" >&2
# Stored file URLs (avatars, logos, posters, sounds) point at the cloud project.
sed "s#${CLOUD_ORIGIN}#${OWN_API_ORIGIN}#g; s#${OLD_APP_ORIGIN}#${INTERNAL_APP_ORIGIN}#g" \
  "$DUMP/data.sql" > "$WORK/data.sql"
# The functions pg_cron calls post to the app on Vercel.
sed "s#${OLD_APP_ORIGIN}#${INTERNAL_APP_ORIGIN}#g" "$DUMP/schema.sql" > "$WORK/schema.sql"
cp "$DUMP/roles.sql" "$WORK/roles.sql"
for file in schema.sql data.sql; do
  echo "  $file: $(grep -c "$CLOUD_ORIGIN\|$OLD_APP_ORIGIN" "$WORK/$file" || true) old addresses left" >&2
done

echo "== cron secret baked into the functions" >&2
# The cron functions carry the old CRON_SECRET in their source; the app must accept it.
grep -ohE "Bearer [A-Za-z0-9_-]{16,}" "$DUMP/schema.sql" "$DUMP/cron-jobs.tsv" 2>/dev/null \
  | sort -u | sed 's/Bearer //' > "$WORK/cron-secrets.txt" || true
echo "  distinct secrets found: $(wc -l < "$WORK/cron-secrets.txt")" >&2
if [ "$(wc -l < "$WORK/cron-secrets.txt")" -eq 1 ]; then
  sed -i "s|^CRON_SECRET=.*|CRON_SECRET=$(cat "$WORK/cron-secrets.txt")|" /opt/club/.env
  echo "  CRON_SECRET in /opt/club/.env now matches; restart the app to pick it up" >&2
else
  echo "  set CRON_SECRET in /opt/club/.env by hand (see $WORK/cron-secrets.txt)" >&2
fi

echo "== restoring" >&2
docker exec supabase-db mkdir -p /tmp/restore
for file in roles.sql schema.sql data.sql; do
  docker cp "$WORK/$file" "supabase-db:/tmp/restore/$file"
done
docker exec supabase-db psql -h localhost -U postgres -d postgres \
  --single-transaction --variable ON_ERROR_STOP=1 \
  --file /tmp/restore/roles.sql \
  --file /tmp/restore/schema.sql \
  --command 'SET session_replication_role = replica' \
  --file /tmp/restore/data.sql > "$WORK/psql.log" 2>&1 \
  || { tail -20 "$WORK/psql.log" >&2; exit 1; }
docker exec supabase-db rm -rf /tmp/restore

echo "== pg_cron: everything off until the switch" >&2
docker exec supabase-db psql -h localhost -U postgres -d postgres -At \
  -c "select count(cron.unschedule(jobid)) from cron.job" 2>&1 | sed 's/^/  unscheduled: /' >&2

echo "done: $WORK" >&2
