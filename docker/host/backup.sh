#!/usr/bin/env bash
# Nightly backup of the real instance's database (never the preview). Run by
# mirador-backup.timer; see docs/hosting-oracle.md for restoring.
#
# The database holds encrypted records, but also readable sign-in data such as usernames
# (see docs/what-the-server-sees.md),
# so a backup is encrypted with age before it leaves the server (BACKUP_AGE_RECIPIENT),
# and is only copied off the server when it is (BACKUP_RCLONE_REMOTE).
set -euo pipefail

cd /opt/mirador
set -a
# shellcheck source=/dev/null
. ./.env
set +a

keep_days=${BACKUP_KEEP_DAYS:-14}
stamp=$(date -u +%Y-%m-%dT%H%M%SZ)
umask 077
mkdir -p backups

dump() {
  docker compose exec -T db pg_dump --username=mirador --dbname=mirador --no-owner | gzip
}

if [ -n "${BACKUP_AGE_RECIPIENT:-}" ]; then
  file="backups/mirador-$stamp.sql.gz.age"
  dump | age --recipient "$BACKUP_AGE_RECIPIENT" >"$file.partial"
else
  file="backups/mirador-$stamp.sql.gz"
  dump >"$file.partial"
fi
mv "$file.partial" "$file"
echo "Wrote $file ($(du -h "$file" | cut -f1))"

find backups -name 'mirador-*' -type f -mtime "+$keep_days" -delete

if [ -n "${BACKUP_RCLONE_REMOTE:-}" ]; then
  if [ -z "${BACKUP_AGE_RECIPIENT:-}" ]; then
    echo "Not copying an unencrypted backup off the server. Set BACKUP_AGE_RECIPIENT." >&2
    exit 1
  fi
  rclone --config /opt/mirador/rclone.conf copy "$file" "$BACKUP_RCLONE_REMOTE"
  rclone --config /opt/mirador/rclone.conf delete --min-age "${keep_days}d" "$BACKUP_RCLONE_REMOTE"
  echo "Copied $file to $BACKUP_RCLONE_REMOTE"
fi
