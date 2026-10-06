#!/usr/bin/env bash
# Counts the rows of every table in the public, auth and storage schemas in the cloud and
# here, side by side, and flags the tables that differ. Read-only on both sides.
#
#   bash deploy/migrate/compare.sh
set -euo pipefail

SOURCE_URL=$(cat ~/secrets/source-db-url)

COUNT_SQL=$(cat <<'SQL'
select format('select %L, count(*) from %I.%I union all ', schemaname || '.' || tablename, schemaname, tablename)
from pg_tables
where schemaname in ('public', 'auth', 'storage')
order by schemaname, tablename
SQL
)

count_rows() { # psql connection args...
  local union
  union=$(docker exec -i supabase-db psql "$@" -At -c "$COUNT_SQL" | tr -d '\n')
  docker exec -i supabase-db psql "$@" -At -F $'\t' -c "${union% union all } order by 1"
}

count_rows "$SOURCE_URL" | LC_ALL=C sort > /tmp/rows-cloud.tsv
count_rows -h localhost -U postgres -d postgres | LC_ALL=C sort > /tmp/rows-here.tsv

LC_ALL=C join -t $'\t' -a 1 -a 2 -e MISSING -o 0,1.2,2.2 /tmp/rows-cloud.tsv /tmp/rows-here.tsv \
  | awk -F'\t' 'BEGIN { printf "%-45s %10s %10s\n", "table", "cloud", "here" }
      { mark = ($2 == $3) ? "" : "  <-- differs"; printf "%-45s %10s %10s%s\n", $1, $2, $3, mark }'
