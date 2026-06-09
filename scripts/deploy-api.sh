#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# shellcheck source=scripts/lib/http-health.sh
source "$ROOT_DIR/scripts/lib/http-health.sh"

RAILWAY_BIN="${RAILWAY_BIN:-railway}"
SERVICE="${RAILWAY_API_SERVICE_ID:-203d29a0-15ce-4cad-8014-2ea06d3008ed}"
PROJECT="${RAILWAY_PROJECT_ID:-}"
ENVIRONMENT="${RAILWAY_ENVIRONMENT_ID:-}"
API_HEALTH_URL="${API_HEALTH_URL:-https://locoplaya666-final-financial-agent-production.up.railway.app}"

if [ -z "$PROJECT" ] || [ -z "$ENVIRONMENT" ]; then
  echo "Faltan variables: RAILWAY_PROJECT_ID, RAILWAY_ENVIRONMENT_ID"
  exit 1
fi

echo "==> Generate Prisma client"
pnpm --filter @financial-agent/api db:generate

echo "==> Typecheck API"
pnpm --filter @financial-agent/api typecheck

echo "==> Limpiando cache local innecesario"
rm -rf apps/web/.next apps/api/.next

echo "==> Migraciones"
DATABASE_URL="$("$RAILWAY_BIN" variable list --project "$PROJECT" --environment "$ENVIRONMENT" --service Postgres --json | jq -r '.DATABASE_PUBLIC_URL // empty')" \
  pnpm --filter @financial-agent/api db:migrate

echo "==> Verificar migraciones aplicadas"
DATABASE_URL="$("$RAILWAY_BIN" variable list --project "$PROJECT" --environment "$ENVIRONMENT" --service Postgres --json | jq -r '.DATABASE_PUBLIC_URL // empty')" \
  pnpm --filter @financial-agent/api exec prisma migrate status

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

echo "==> Esperando deployment SUCCESS"
wait_railway_deployment_success "$RAILWAY_BIN" "$SERVICE" 30 20

API_BASE="${API_HEALTH_URL%/}"
echo "==> Healthcheck liveness (${API_BASE}/health/live)"
wait_http_2xx "${API_BASE}/health/live" 24 5

echo "==> Healthcheck readiness (${API_BASE}/health/ready)"
wait_api_ready "${API_BASE}/health/ready" 24 5

echo "==> Deploy API OK"
exit 0
