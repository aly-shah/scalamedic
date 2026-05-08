#!/bin/bash
# MediCore DB Backup Script
# Usage: ./scripts/backup-db.sh
# Recommended: crontab -e → 0 2 * * * /var/www/medicore/scripts/backup-db.sh

set -euo pipefail

BACKUP_DIR="/var/backups/medicore"
DB_NAME="medicore"
DB_USER="medicore_user"
DB_HOST="localhost"
DB_PORT="5432"
RETENTION_DAYS=30
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting backup: ${DB_NAME} → ${BACKUP_FILE}"

PGPASSWORD="${DB_PASSWORD:-clinic_erp_dev}" pg_dump \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --format=custom \
  --no-owner \
  --no-privileges \
  | gzip > "$BACKUP_FILE"

SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "[$(date)] Backup complete: ${BACKUP_FILE} (${SIZE})"

# Cleanup old backups
DELETED=$(find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -mtime +${RETENTION_DAYS} -delete -print | wc -l)
if [ "$DELETED" -gt 0 ]; then
  echo "[$(date)] Cleaned up ${DELETED} backups older than ${RETENTION_DAYS} days"
fi

echo "[$(date)] Done. Active backups: $(ls -1 ${BACKUP_DIR}/${DB_NAME}_*.sql.gz 2>/dev/null | wc -l)"
