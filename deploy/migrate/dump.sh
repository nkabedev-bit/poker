#!/usr/bin/env bash
# Takes the three dumps Supabase's "restore from platform" guide asks for — roles, schema,
# data — from the cloud project into ~/migration/<UTC time>/ on the club's server.
# Read-only on the cloud side.
#
#   ~/bin/supabase must exist; the cloud connection string (Session pooler, with the
#   password) lives in ~/secrets/source-db-url.
#
#   bash deploy/migrate/dump.sh        # prints the folder it wrote
set -euo pipefail

SOURCE_URL=$(cat ~/secrets/source-db-url)
OUT=~/migration/$(date -u +%Y%m%dT%H%M%SZ)
SUPABASE=~/bin/supabase

mkdir -p "$OUT"
"$SUPABASE" db dump --db-url "$SOURCE_URL" -f "$OUT/roles.sql" --role-only
"$SUPABASE" db dump --db-url "$SOURCE_URL" -f "$OUT/schema.sql"
"$SUPABASE" db dump --db-url "$SOURCE_URL" -f "$OUT/data.sql" --use-copy --data-only

# The jobs pg_cron runs in the cloud, for re-creating them here (the dump may not carry them).
docker exec -i supabase-db psql "$SOURCE_URL" -At -F $'\t' \
  -c "select jobname, schedule, command from cron.job order by jobname" > "$OUT/cron-jobs.tsv"

ls -la "$OUT" >&2
echo "$OUT"
