#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${JIXIANG_SMOKE_BASE_URL:-${1:-}}"
ACCOUNT="${JIXIANG_SMOKE_ACCOUNT:-admin}"
PASSWORD="${JIXIANG_SMOKE_PASSWORD:-}"

if [[ -z "$BASE_URL" ]]; then
  echo "Usage: JIXIANG_SMOKE_PASSWORD='password' scripts/deploy/smoke-test.sh https://crm.example.com" >&2
  exit 1
fi

if [[ -z "$PASSWORD" ]]; then
  echo "JIXIANG_SMOKE_PASSWORD is required" >&2
  exit 1
fi

BASE_URL="${BASE_URL%/}"

echo "Checking readiness..."
health="$(curl -fsS "$BASE_URL/api/ready")"
echo "$health" | grep -q '"ok":true'
echo "$health" | grep -q '"database":true'

echo "Checking unauthenticated protection..."
status="$(curl -sS -o /tmp/jixiang-smoke-users.json -w '%{http_code}' "$BASE_URL/api/settings/users")"
if [[ "$status" != "401" ]]; then
  echo "Expected /api/settings/users without token to return 401, got $status" >&2
  cat /tmp/jixiang-smoke-users.json >&2
  exit 1
fi

echo "Logging in..."
login_payload="$(printf '{"account":"%s","password":"%s","remember":true}' "$ACCOUNT" "$PASSWORD")"
login="$(curl -fsS -H 'Content-Type: application/json' -d "$login_payload" "$BASE_URL/api/auth/login")"
token="$(node -e "const payload=JSON.parse(process.argv[1]); process.stdout.write(payload?.data?.token || '')" "$login")"
if [[ -z "$token" ]]; then
  echo "Login did not return a token" >&2
  exit 1
fi

echo "Checking authenticated settings access..."
authed_status="$(curl -sS -o /tmp/jixiang-smoke-users-authed.json -w '%{http_code}' -H "Authorization: Bearer $token" "$BASE_URL/api/settings/users")"
if [[ "$authed_status" != "200" ]]; then
  echo "Expected authenticated /api/settings/users to return 200, got $authed_status" >&2
  cat /tmp/jixiang-smoke-users-authed.json >&2
  exit 1
fi

echo "Smoke test passed for $BASE_URL"
