#!/usr/bin/env bash
set -euo pipefail

MYSQL_HOST="${JIXIANG_MYSQL_HOST:-127.0.0.1}"
MYSQL_PORT="${JIXIANG_MYSQL_PORT:-3306}"
MYSQL_DATABASE="${JIXIANG_MYSQL_DATABASE:-jixiang_os_prod_clone_test}"
MYSQL_USER="${JIXIANG_MYSQL_USER:-jixiang_clone}"
MYSQL_PASSWORD="${JIXIANG_MYSQL_PASSWORD:-}"
RESTORE_FILE="${JIXIANG_RESTORE_FILE:-${1:-}}"
VERIFICATION_ACTOR="${JIXIANG_VERIFICATION_ACTOR:-}"
EXPECTED_DATABASE="jixiang_os_prod_clone_test"

if [[ -z "$MYSQL_PASSWORD" ]]; then
  echo "JIXIANG_MYSQL_PASSWORD is required" >&2
  exit 1
fi
if [[ -z "$RESTORE_FILE" || ! -f "$RESTORE_FILE" ]]; then
  echo "Usage: JIXIANG_VERIFICATION_ACTOR=name scripts/mysql/verify-clone-restore.sh /path/to/backup.sql.gz" >&2
  exit 1
fi
if [[ -z "$VERIFICATION_ACTOR" ]]; then
  echo "JIXIANG_VERIFICATION_ACTOR is required for the verification record" >&2
  exit 1
fi
if [[ "$MYSQL_HOST" != "127.0.0.1" && "$MYSQL_HOST" != "localhost" ]]; then
  echo "Refusing to verify a non-loopback MySQL host" >&2
  exit 1
fi
if [[ "$MYSQL_DATABASE" != "$EXPECTED_DATABASE" ]]; then
  echo "Refusing to verify: target database must be $EXPECTED_DATABASE" >&2
  exit 1
fi
if [[ "$MYSQL_USER" == "root" ]]; then
  echo "Refusing to verify with the MySQL root account" >&2
  exit 1
fi

MANIFEST_FILE="${RESTORE_FILE}.manifest"
MANIFEST_CHECKSUM_FILE="${MANIFEST_FILE}.sha256"
if [[ ! -f "$MANIFEST_FILE" || ! -f "$MANIFEST_CHECKSUM_FILE" ]]; then
  echo "Clone restore verification failed: backup manifest or checksum is missing" >&2
  exit 1
fi
(cd "$(dirname "$MANIFEST_FILE")" && sha256sum -c "$(basename "$MANIFEST_CHECKSUM_FILE")")
manifest_value() {
  awk -F= -v key="$1" '$1 == key { print substr($0, length(key) + 2); exit }' "$MANIFEST_FILE"
}
EXPECTED_TABLE_COUNT="$(manifest_value TABLE_COUNT)"
COUNT_CONSISTENCY="$(manifest_value COUNT_CONSISTENCY)"
EXPECTED_USER_COUNT="$(manifest_value USER_COUNT)"
EXPECTED_POSITION_COUNT="$(manifest_value POSITION_COUNT)"
EXPECTED_MIGRATION_COUNT="$(manifest_value MIGRATION_COUNT)"
if [[ "$COUNT_CONSISTENCY" != "WRITE_PAUSED" ]]; then
  echo "Clone restore verification failed: backup counts were not captured during an approved write pause" >&2
  exit 1
fi

export MYSQL_PWD="$MYSQL_PASSWORD"
trap 'unset MYSQL_PWD' EXIT
mysql_read() {
  mysql --batch --skip-column-names --host="$MYSQL_HOST" --port="$MYSQL_PORT" --user="$MYSQL_USER" "$MYSQL_DATABASE" -e "$1"
}

TABLE_COUNT="$(mysql_read "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${MYSQL_DATABASE}'")"
if [[ "$TABLE_COUNT" == "0" ]]; then
  echo "Clone restore verification failed: database is empty" >&2
  exit 1
fi

MIGRATION_TABLE_COUNT="$(mysql_read "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${MYSQL_DATABASE}' AND table_name='_prisma_migrations'")"
if [[ "$MIGRATION_TABLE_COUNT" != "1" ]]; then
  echo "Clone restore verification failed: _prisma_migrations is missing" >&2
  exit 1
fi

MIGRATION_COUNT="$(mysql_read "SELECT COUNT(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL")"
FAILED_MIGRATION_COUNT="$(mysql_read "SELECT COUNT(*) FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL")"
ROLLED_BACK_MIGRATION_COUNT="$(mysql_read "SELECT COUNT(*) FROM _prisma_migrations WHERE rolled_back_at IS NOT NULL")"
USER_COUNT="$(mysql_read "SELECT COUNT(*) FROM users")"
POSITION_COUNT="$(mysql_read "SELECT COUNT(*) FROM positions")"
if [[ "$MIGRATION_COUNT" == "0" || "$FAILED_MIGRATION_COUNT" != "0" || "$ROLLED_BACK_MIGRATION_COUNT" != "0" ]]; then
  echo "Clone restore verification failed: migration history is incomplete" >&2
  exit 1
fi
if [[ "$TABLE_COUNT" != "$EXPECTED_TABLE_COUNT" || "$USER_COUNT" != "$EXPECTED_USER_COUNT" || "$POSITION_COUNT" != "$EXPECTED_POSITION_COUNT" || "$MIGRATION_COUNT" != "$EXPECTED_MIGRATION_COUNT" ]]; then
  echo "Clone restore verification failed: restored counts do not match the signed backup manifest" >&2
  exit 1
fi

printf 'Clone restore verification passed: verified_at=%s actor=%s database=%s tables=%s users=%s positions=%s migrations=%s failed_migrations=%s rolled_back_migrations=%s\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$VERIFICATION_ACTOR" "$MYSQL_DATABASE" "$TABLE_COUNT" "$USER_COUNT" "$POSITION_COUNT" \
  "$MIGRATION_COUNT" "$FAILED_MIGRATION_COUNT" "$ROLLED_BACK_MIGRATION_COUNT"
