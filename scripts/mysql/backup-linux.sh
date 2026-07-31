#!/usr/bin/env bash
set -euo pipefail

MYSQL_HOST="${JIXIANG_MYSQL_HOST:-127.0.0.1}"
MYSQL_PORT="${JIXIANG_MYSQL_PORT:-3306}"
MYSQL_DATABASE="${JIXIANG_MYSQL_DATABASE:-jixiang_os}"
MYSQL_USER="${JIXIANG_MYSQL_USER:-jixiang_os}"
MYSQL_PASSWORD="${JIXIANG_MYSQL_PASSWORD:-}"
BACKUP_DIR="${JIXIANG_BACKUP_DIR:-/var/backups/jixiang-os}"
KEEP_DAYS="${JIXIANG_BACKUP_KEEP_DAYS:-14}"
PRUNE_BACKUPS="${JIXIANG_BACKUP_PRUNE:-YES}"
WRITES_PAUSED="${JIXIANG_BACKUP_WRITES_PAUSED:-NO}"

if [[ -z "$MYSQL_PASSWORD" ]]; then
  echo "JIXIANG_MYSQL_PASSWORD is required" >&2
  exit 1
fi
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required to verify the backup target" >&2
  exit 1
fi

DATABASE_TARGET="$(
  python3 - "$DATABASE_URL" <<'PY'
import sys
from urllib.parse import unquote, urlparse

parsed = urlparse(sys.argv[1])
if parsed.scheme != "mysql" or not parsed.hostname or not parsed.path:
    raise SystemExit("DATABASE_URL must be a valid mysql URL")
host = "127.0.0.1" if parsed.hostname in {"localhost", "127.0.0.1"} else parsed.hostname
print(f"{host}\t{parsed.port or 3306}\t{unquote(parsed.path.lstrip('/'))}")
PY
)"
IFS=$'\t' read -r DATABASE_URL_HOST DATABASE_URL_PORT DATABASE_URL_DATABASE <<< "$DATABASE_TARGET"

NORMALIZED_MYSQL_HOST="$MYSQL_HOST"
if [[ "$NORMALIZED_MYSQL_HOST" == "localhost" ]]; then
  NORMALIZED_MYSQL_HOST="127.0.0.1"
fi
if [[ "$NORMALIZED_MYSQL_HOST" != "$DATABASE_URL_HOST" || "$MYSQL_PORT" != "$DATABASE_URL_PORT" || "$MYSQL_DATABASE" != "$DATABASE_URL_DATABASE" ]]; then
  echo "backup target does not match DATABASE_URL" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
umask 077

timestamp="$(date +%Y%m%d-%H%M%S)"
output="$BACKUP_DIR/$MYSQL_DATABASE-$timestamp.sql.gz"
partial_output="$output.partial"
checksum="$output.sha256"
partial_checksum="$checksum.partial"
manifest="$output.manifest"
partial_manifest="$manifest.partial"
manifest_checksum="$manifest.sha256"
partial_manifest_checksum="$manifest_checksum.partial"
completed=0

cleanup_partial_backup() {
  if [[ "$completed" != "1" ]]; then
    rm -f "$partial_output" "$output" "$partial_checksum" "$checksum" "$partial_manifest" "$manifest" "$partial_manifest_checksum" "$manifest_checksum"
  fi
}
trap cleanup_partial_backup EXIT

mysql_scalar() {
  MYSQL_PWD="$MYSQL_PASSWORD" mysql --batch --skip-column-names \
    --host="$MYSQL_HOST" --port="$MYSQL_PORT" --user="$MYSQL_USER" "$MYSQL_DATABASE" -e "$1"
}

TABLE_COUNT="$(mysql_scalar "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${MYSQL_DATABASE}'")"
USER_COUNT="$(mysql_scalar "SELECT COUNT(*) FROM users")"
POSITION_COUNT="$(mysql_scalar "SELECT COUNT(*) FROM positions")"
MIGRATION_COUNT="$(mysql_scalar "SELECT COUNT(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL")"
FAILED_MIGRATION_COUNT="$(mysql_scalar "SELECT COUNT(*) FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL")"
ROLLED_BACK_MIGRATION_COUNT="$(mysql_scalar "SELECT COUNT(*) FROM _prisma_migrations WHERE rolled_back_at IS NOT NULL")"

MYSQL_PWD="$MYSQL_PASSWORD" mysqldump \
  --host="$MYSQL_HOST" \
  --port="$MYSQL_PORT" \
  --user="$MYSQL_USER" \
  --default-character-set=utf8mb4 \
  --single-transaction \
  --no-tablespaces \
  --routines \
  --triggers \
  "$MYSQL_DATABASE" | gzip > "$partial_output"

gzip -t "$partial_output"
mv "$partial_output" "$output"
sha256sum "$output" > "$partial_checksum"
chmod 600 "$output" "$partial_checksum"
mv "$partial_checksum" "$checksum"
COUNT_CONSISTENCY="UNVERIFIED"
if [[ "$WRITES_PAUSED" == "YES" ]]; then
  COUNT_CONSISTENCY="WRITE_PAUSED"
fi
printf 'DATABASE=%s\nCREATED_AT=%s\nCOUNT_CONSISTENCY=%s\nTABLE_COUNT=%s\nUSER_COUNT=%s\nPOSITION_COUNT=%s\nMIGRATION_COUNT=%s\nFAILED_MIGRATION_COUNT=%s\nROLLED_BACK_MIGRATION_COUNT=%s\n' \
  "$MYSQL_DATABASE" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$COUNT_CONSISTENCY" "$TABLE_COUNT" "$USER_COUNT" "$POSITION_COUNT" \
  "$MIGRATION_COUNT" "$FAILED_MIGRATION_COUNT" "$ROLLED_BACK_MIGRATION_COUNT" > "$partial_manifest"
mv "$partial_manifest" "$manifest"
sha256sum "$manifest" > "$partial_manifest_checksum"
chmod 600 "$manifest" "$partial_manifest_checksum"
mv "$partial_manifest_checksum" "$manifest_checksum"
completed=1
trap - EXIT
if [[ "$PRUNE_BACKUPS" == "YES" ]]; then
  find "$BACKUP_DIR" -name "$MYSQL_DATABASE-*.sql.gz" -type f -mtime +"$KEEP_DAYS" -delete
  find "$BACKUP_DIR" -name "$MYSQL_DATABASE-*.sql.gz.sha256" -type f -mtime +"$KEEP_DAYS" -delete
  find "$BACKUP_DIR" -name "$MYSQL_DATABASE-*.sql.gz.manifest" -type f -mtime +"$KEEP_DAYS" -delete
  find "$BACKUP_DIR" -name "$MYSQL_DATABASE-*.sql.gz.manifest.sha256" -type f -mtime +"$KEEP_DAYS" -delete
fi

echo "Backup created: $output"
