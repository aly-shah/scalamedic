#!/usr/bin/env bash
# MediCore — daily Postgres backup
# =================================
# Runs from cron at 03:30 PKT each night. Custom-format dump (the
# only Postgres backup format that supports parallel restore +
# selective table extraction) into /root/backups/postgres/, with
# rotation:
#
#   - daily/  YYYY-MM-DD.dump (keep 14)
#   - weekly/ YYYY-WW.dump    (keep 8)  — copy of every Monday's
#   - monthly/YYYY-MM.dump    (keep 12) — copy of every 1st-of-month
#
# Why custom format: pg_dump with -Fc compresses with zlib, can be
# restored to any newer Postgres, supports `pg_restore -t table` if
# the team needs to recover one row, and is verifiable via
# `pg_restore --list` without executing it.
#
# Why three tiers of rotation: catastrophic ransomware (or a bad
# migration) might not be caught for weeks. Daily-only retention
# means after 14 days you can't roll back; weekly + monthly extends
# the recovery window to about a year at modest disk cost.
#
# This script does NOT push off-box. Off-box replication (B2 / R2 /
# AWS S3 / SFTP) is the second half of the backup story; add it
# when the deployment serves more than one clinic. Until then a
# disk failure = data loss.
#
# Failure modes:
#   - pg_dump fails  → exit non-zero, cron writes to /var/log
#   - disk full       → df check at the top, exit early with a
#                        loud message
#   - cron silently   → see scripts/backup-postgres-doctor.sh which
#     stopped running     a separate cron pings a heartbeat URL
#                        (future: dead-man's switch)
set -euo pipefail

BACKUP_ROOT="/root/backups/postgres"
APP_ENV="/var/www/medicore/.env"
TODAY="$(date +%F)"          # YYYY-MM-DD
WEEK="$(date +%G-%V)"        # ISO week (YYYY-WW)
MONTH="$(date +%Y-%m)"       # YYYY-MM

DAILY_KEEP=14
WEEKLY_KEEP=8
MONTHLY_KEEP=12

mkdir -p "$BACKUP_ROOT/daily" "$BACKUP_ROOT/weekly" "$BACKUP_ROOT/monthly"

# Disk-space guard. Refuse to start if <2 GB free; better to alert
# loudly than to fill the disk and crash pm2.
free_kb=$(df -k --output=avail "$BACKUP_ROOT" | tail -1)
if [ "$free_kb" -lt 2097152 ]; then
  echo "[backup] FATAL: <2 GB free in $BACKUP_ROOT — aborting." >&2
  exit 2
fi

# Pull DATABASE_URL from the app env. The cron's environment is
# minimal so we read from the .env directly.
DATABASE_URL="$(grep -E '^DATABASE_URL=' "$APP_ENV" | head -1 | cut -d= -f2- | tr -d '"' | sed 's/?schema=public//')"
if [ -z "$DATABASE_URL" ]; then
  echo "[backup] FATAL: DATABASE_URL not found in $APP_ENV" >&2
  exit 3
fi

DAILY_FILE="$BACKUP_ROOT/daily/$TODAY.dump"
TMP_FILE="$DAILY_FILE.partial"

echo "[backup] $TODAY → $DAILY_FILE"
PGPASSWORD="" pg_dump -Fc --no-owner --no-acl "$DATABASE_URL" > "$TMP_FILE"

# Verify the dump is restorable (header parses + file isn't 0 bytes).
# pg_restore --list exits non-zero on a corrupt dump.
if ! pg_restore --list "$TMP_FILE" > /dev/null 2>&1; then
  echo "[backup] FATAL: pg_restore --list rejects $TMP_FILE — aborting" >&2
  rm -f "$TMP_FILE"
  exit 4
fi

mv "$TMP_FILE" "$DAILY_FILE"

# Promote to weekly on Mondays + monthly on the 1st. Use cp (not mv)
# so the daily copy still rotates on its own cycle.
if [ "$(date +%u)" = "1" ]; then
  cp "$DAILY_FILE" "$BACKUP_ROOT/weekly/$WEEK.dump"
fi
if [ "$(date +%d)" = "01" ]; then
  cp "$DAILY_FILE" "$BACKUP_ROOT/monthly/$MONTH.dump"
fi

# Rotate by tier.
prune () {
  local dir="$1"
  local keep="$2"
  ls -1t "$dir" 2>/dev/null | tail -n +"$((keep + 1))" | while read -r old; do
    rm -f "$dir/$old"
  done
}
prune "$BACKUP_ROOT/daily"   "$DAILY_KEEP"
prune "$BACKUP_ROOT/weekly"  "$WEEKLY_KEEP"
prune "$BACKUP_ROOT/monthly" "$MONTHLY_KEEP"

size=$(du -sh "$DAILY_FILE" | awk '{print $1}')
echo "[backup] OK ($size) — daily=$(ls "$BACKUP_ROOT/daily" | wc -l) weekly=$(ls "$BACKUP_ROOT/weekly" | wc -l) monthly=$(ls "$BACKUP_ROOT/monthly" | wc -l)"
