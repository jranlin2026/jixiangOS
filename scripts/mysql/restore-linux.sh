#!/usr/bin/env bash
set -euo pipefail

MYSQL_HOST="${JIXIANG_MYSQL_HOST:-127.0.0.1}"
MYSQL_PORT="${JIXIANG_MYSQL_PORT:-3306}"
MYSQL_DATABASE="${JIXIANG_MYSQL_DATABASE:-jixiang_os}"
MYSQL_USER="${JIXIANG_MYSQL_USER:-jixiang_os}"
MYSQL_PASSWORD="${JIXIANG_MYSQL_PASSWORD:-}"
RESTORE_FILE="${JIXIANG_RESTORE_FILE:-${1:-}}"

if [[ -z "$MYSQL_PASSWORD" ]]; then
  echo "JIXIANG_MYSQL_PASSWORD is required" >&2
  exit 1
fi

if [[ -z "$RESTORE_FILE" || ! -f "$RESTORE_FILE" ]]; then
  echo "Usage: JIXIANG_CONFIRM_RESTORE=YES scripts/mysql/restore-linux.sh /path/to/backup.sql.gz" >&2
  exit 1
fi

if [[ "${JIXIANG_CONFIRM_RESTORE:-}" != "YES" ]]; then
  echo "Refusing to restore without JIXIANG_CONFIRM_RESTORE=YES" >&2
  echo "Target database: $MYSQL_DATABASE on $MYSQL_HOST:$MYSQL_PORT" >&2
  exit 1
fi

echo "Restoring $RESTORE_FILE to $MYSQL_DATABASE on $MYSQL_HOST:$MYSQL_PORT..."

export MYSQL_PWD="$MYSQL_PASSWORD"
trap 'unset MYSQL_PWD' EXIT

if [[ "$RESTORE_FILE" == *.gz ]]; then
  gunzip -c "$RESTORE_FILE" | mysql \
    --host="$MYSQL_HOST" \
    --port="$MYSQL_PORT" \
    --user="$MYSQL_USER" \
    --default-character-set=utf8mb4 \
    "$MYSQL_DATABASE"
else
  mysql \
    --host="$MYSQL_HOST" \
    --port="$MYSQL_PORT" \
    --user="$MYSQL_USER" \
    --default-character-set=utf8mb4 \
    "$MYSQL_DATABASE" < "$RESTORE_FILE"
fi

echo "Restore completed."
