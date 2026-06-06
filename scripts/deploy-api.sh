#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

RAILWAY_BIN="${RAILWAY_BIN:-railway}"
SERVICE="${RAILWAY_API_SERVICE_ID:-203d29a0-15ce-4cad-8014-2ea06d3008ed}"
PROJECT="${RAILWAY_PROJECT_ID:-}"
ENVIRONMENT="${RAILWAY_ENVIRONMENT_ID:-}"

if [ -z "$PROJECT" ] || [ -z "$ENVIRONMENT" ]; then
  echo "Faltan variables: RAILWAY_PROJECT_ID, RAILWAY_ENVIRONMENT_ID"
  exit 1
fi

echo "==> Typecheck API"
pnpm --filter @financial-agent/api typecheck

echo "==> Limpiando cache local innecesario"
rm -rf apps/web/.next apps/api/.next

echo "==> Migraciones"
DATABASE_URL="$("$RAILWAY_BIN" variable list --project "$PROJECT" --environment "$ENVIRONMENT" --service Postgres --json | jq -r '.DATABASE_PUBLIC_URL // empty')" \
  pnpm --filter @financial-agent/api db:migrate

echo "==> Link Railway"
"$RAILWAY_BIN" link --project "$PROJECT" --environment "$ENVIRONMENT" --service "$SERVICE"

echo "==> Deploy API"
set +e
"$RAILWAY_BIN" up --service "$SERVICE" --detach
up_exit=$?
set -e
if [ "$up_exit" -ne 0 ]; then
  echo "railway up devolvió error/intermitencia; sigo validando el deployment"
fi

echo "==> Esperando health"
for _ in $(seq 1 30); do
  STATUS="$("$RAILWAY_BIN" deployment list --service "$SERVICE" --limit 1 --json 2>/dev/null | jq -r '.[0].status // "UNKNOWN"')"
  echo "status=${STATUS}"
  if [ "$STATUS" = "SUCCESS" ]; then
    exit 0
  fi
  if [ "$STATUS" = "FAILED" ] || [ "$STATUS" = "CRASHED" ] || [ "$STATUS" = "REMOVED" ]; then
    exit 1
  fi
  sleep 20
done

echo "Timeout esperando deploy del API"
exit 1
