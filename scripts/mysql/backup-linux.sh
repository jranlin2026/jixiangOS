#!/usr/bin/env bash
set -euo pipefail

MYSQL_HOST="${JIXIANG_MYSQL_HOST:-127.0.0.1}"
MYSQL_PORT="${JIXIANG_MYSQL_PORT:-3306}"
MYSQL_DATABASE="${JIXIANG_MYSQL_DATABASE:-jixiang_os}"
MYSQL_USER="${JIXIANG_MYSQL_USER:-jixiang_os}"
MYSQL_PASSWORD="${JIXIANG_MYSQL_PASSWORD:-}"
BACKUP_DIR="${JIXIANG_BACKUP_DIR:-/var/backups/jixiang-os}"
KEEP_DAYS="${JIXIANG_BACKUP_KEEP_DAYS:-14}"

if [[ -z "$MYSQL_PASSWORD" ]]; then
  echo "JIXIANG_MYSQL_PASSWORD is required" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

timestamp="$(date +%Y%m%d-%H%M%S)"
output="$BACKUP_DIR/$MYSQL_DATABASE-$timestamp.sql.gz"

MYSQL_PWD="$MYSQL_PASSWORD" mysqldump \
  --host="$MYSQL_HOST" \
  --port="$MYSQL_PORT" \
  --user="$MYSQL_USER" \
  --default-character-set=utf8mb4 \
  --single-transaction \
  --no-tablespaces \
  --routines \
  --triggers \
  "$MYSQL_DATABASE" | gzip > "$output"

chmod 600 "$output"
find "$BACKUP_DIR" -name "$MYSQL_DATABASE-*.sql.gz" -type f -mtime +"$KEEP_DAYS" -delete

echo "Backup created: $output"
