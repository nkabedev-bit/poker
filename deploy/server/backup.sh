#!/usr/bin/env bash
# Nightly backup of the club's data on its own server.
#
# The database is dumped in the same three files dump.sh takes from the cloud (roles,
# schema, data), so the rehearsed deploy/migrate/restore.sh brings a backup back the same
# way; the stored files go along as a tarball. Kept 3 nights on the server and 14 on
# Yandex Disk (rclone remote "yadisk", WebDAV with an app password).
#
#   crontab (deploy): 0 4 * * * bash ~/backup.sh >> ~/backups/backup.log 2>&1
set -euo pipefail

STAMP=$(date +%Y%m%d-%H%M)
LOCAL=~/backups
WORK="$LOCAL/$STAMP"
SUPABASE=~/bin/supabase

PASSWORD=$(sudo grep '^POSTGRES_PASSWORD=' /opt/supabase/.env | cut -d= -f2-)
DB_IP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' supabase-db)
DB_URL="postgresql://postgres:${PASSWORD}@${DB_IP}:5432/postgres"

mkdir -p "$WORK"
# The CLI echoes the connection string on failure; keep the password out of the log.
{
  "$SUPABASE" db dump --db-url "$DB_URL" -f "$WORK/roles.sql" --role-only
  "$SUPABASE" db dump --db-url "$DB_URL" -f "$WORK/schema.sql"
  "$SUPABASE" db dump --db-url "$DB_URL" -f "$WORK/data.sql" --use-copy --data-only
} 2>&1 | sed "s#${PASSWORD}#***#g" | { grep -v "new version of Supabase CLI\|recommend updating" || true; }

docker exec supabase-db psql -h localhost -U postgres -At -F $'\t' \
  -c "select jobname, schedule, command from cron.job" > "$WORK/cron-jobs.tsv"
sudo tar -C /opt/supabase/volumes -czf "$WORK/storage.tar.gz" storage

ARCHIVE="$LOCAL/club-$STAMP.tar.gz"
tar -C "$LOCAL" -czf "$ARCHIVE" "$STAMP"
rm -rf "$WORK"
find "$LOCAL" -name 'club-*.tar.gz' -mtime +3 -delete

rclone copy "$ARCHIVE" yadisk:club-backups/
rclone delete yadisk:club-backups/ --min-age 14d

echo "$(date '+%F %T') backup $(basename "$ARCHIVE") $(du -h "$ARCHIVE" | cut -f1) done"
