#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${JIXIANG_APP_DIR:-/var/www/jixiang-os/current}"

cd "$APP_DIR"

if [[ ! -f .env ]]; then
  echo ".env is missing in $APP_DIR" >&2
  exit 1
fi

echo "Loading production environment..."
set -a
# shellcheck disable=SC1091
. ./.env
set +a

BRANCH="${JIXIANG_DEPLOY_BRANCH:-codex/core-crm-polish}"
HEALTH_URL="${JIXIANG_HEALTH_URL:-http://127.0.0.1:3001/api/ready}"
RUN_BACKUP="${JIXIANG_DEPLOY_BACKUP:-true}"

if [[ "$RUN_BACKUP" == "true" && -x scripts/mysql/backup-linux.sh ]]; then
  echo "Creating pre-deploy database backup..."
  scripts/mysql/backup-linux.sh
fi

echo "Fetching latest code for $BRANCH..."
git fetch origin --prune
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

echo "Installing dependencies..."
npm ci

echo "Applying database migrations..."
npm run db:generate
npm run db:deploy

echo "Building frontend..."
npm run build

echo "Starting or reloading API..."
if pm2 describe jixiang-os-api >/dev/null 2>&1; then
  pm2 reload ecosystem.config.cjs --env production
else
  pm2 start ecosystem.config.cjs --env production
fi
pm2 save

echo "Checking local health..."
health="$(curl -fsS "$HEALTH_URL")"
echo "$health" | grep -q '"ok":true'
echo "$health" | grep -q '"database":true'

if [[ -n "${JIXIANG_SMOKE_BASE_URL:-}" && -n "${JIXIANG_SMOKE_PASSWORD:-}" ]]; then
  echo "Running public smoke test..."
  scripts/deploy/smoke-test.sh "$JIXIANG_SMOKE_BASE_URL"
fi

echo "Deployment completed successfully."
