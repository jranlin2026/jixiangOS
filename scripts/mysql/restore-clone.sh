#!/usr/bin/env bash
set -euo pipefail

MYSQL_HOST="${JIXIANG_MYSQL_HOST:-127.0.0.1}"
MYSQL_PORT="${JIXIANG_MYSQL_PORT:-3306}"
MYSQL_DATABASE="${JIXIANG_MYSQL_DATABASE:-jixiang_os_prod_clone_test}"
MYSQL_USER="${JIXIANG_MYSQL_USER:-jixiang_clone}"
MYSQL_PASSWORD="${JIXIANG_MYSQL_PASSWORD:-}"
RESTORE_FILE="${JIXIANG_RESTORE_FILE:-${1:-}}"
EXPECTED_DATABASE="jixiang_os_prod_clone_test"

if [[ -z "$MYSQL_PASSWORD" ]]; then
  echo "JIXIANG_MYSQL_PASSWORD is required" >&2
  exit 1
fi
if [[ -z "$RESTORE_FILE" || ! -f "$RESTORE_FILE" ]]; then
  echo "Usage: JIXIANG_CONFIRM_RESTORE=YES scripts/mysql/restore-clone.sh /path/to/backup.sql.gz" >&2
  exit 1
fi
if [[ "$MYSQL_HOST" != "127.0.0.1" && "$MYSQL_HOST" != "localhost" ]]; then
  echo "Refusing to restore to a non-loopback MySQL host" >&2
  exit 1
fi
if [[ "$MYSQL_DATABASE" != "$EXPECTED_DATABASE" ]]; then
  echo "Refusing to restore: target database must be $EXPECTED_DATABASE" >&2
  exit 1
fi
if [[ "$MYSQL_USER" == "root" ]]; then
  echo "Refusing to restore with the MySQL root account" >&2
  exit 1
fi

CHECKSUM_FILE="${RESTORE_FILE}.sha256"
if [[ ! -f "$CHECKSUM_FILE" ]]; then
  echo "Missing checksum file: $CHECKSUM_FILE" >&2
  exit 1
fi
(cd "$(dirname "$RESTORE_FILE")" && sha256sum -c "$(basename "$CHECKSUM_FILE")")
if [[ "$RESTORE_FILE" == *.gz ]]; then
  gzip -t "$RESTORE_FILE"
fi
if [[ "${JIXIANG_CONFIRM_RESTORE:-}" != "YES" ]]; then
  echo "Refusing to restore without JIXIANG_CONFIRM_RESTORE=YES" >&2
  exit 1
fi

export MYSQL_PWD="$MYSQL_PASSWORD"
trap 'unset MYSQL_PWD' EXIT
TABLE_COUNT="$(mysql --batch --skip-column-names --host="$MYSQL_HOST" --port="$MYSQL_PORT" --user="$MYSQL_USER" \
  -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${MYSQL_DATABASE}'")"
if [[ "$TABLE_COUNT" != "0" ]]; then
  echo "Refusing to restore into a non-empty database" >&2
  exit 1
fi

echo "Restoring verified backup to isolated local clone database..."
if [[ "$RESTORE_FILE" == *.gz ]]; then
  gunzip -c "$RESTORE_FILE" | mysql --host="$MYSQL_HOST" --port="$MYSQL_PORT" --user="$MYSQL_USER" --default-character-set=utf8mb4 "$MYSQL_DATABASE"
else
  mysql --host="$MYSQL_HOST" --port="$MYSQL_PORT" --user="$MYSQL_USER" --default-character-set=utf8mb4 "$MYSQL_DATABASE" < "$RESTORE_FILE"
fi
echo "Clone restore completed."
