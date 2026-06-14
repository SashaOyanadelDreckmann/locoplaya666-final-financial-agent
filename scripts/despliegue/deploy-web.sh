#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

# shellcheck source=scripts/despliegue/lib/http-health.sh
source "$ROOT_DIR/scripts/despliegue/lib/http-health.sh"

RAILWAY_BIN="${RAILWAY_BIN:-railway}"
SERVICE="${RAILWAY_WEB_SERVICE_ID:-304ec087-4411-4ced-a42c-e00d451fcf4e}"
PROJECT="${RAILWAY_PROJECT_ID:-}"
ENVIRONMENT="${RAILWAY_ENVIRONMENT_ID:-}"
WEB_URL="${WEB_URL:-https://financieramente.up.railway.app}"
API_HEALTH_URL="${API_HEALTH_URL:-https://locoplaya666-final-financial-agent-production.up.railway.app}"

if [ -z "$PROJECT" ] || [ -z "$ENVIRONMENT" ]; then
  echo "Faltan variables: RAILWAY_PROJECT_ID, RAILWAY_ENVIRONMENT_ID"
  exit 1
fi

echo "==> Typecheck web"
pnpm --filter @financial-agent/web typecheck

echo "==> Limpiando cache local innecesario"
rm -rf apps/web/.next apps/api/.next

echo "==> Link Railway"
"$RAILWAY_BIN" link --project "$PROJECT" --environment "$ENVIRONMENT" --service "$SERVICE"

attempt=1
max_attempts=2
while [ "$attempt" -le "$max_attempts" ]; do
  echo "==> Deploy web (${attempt}/${max_attempts})"
  set +e
  "$RAILWAY_BIN" up --service "$SERVICE" --detach
  up_exit=$?
  set -e
  if [ "$up_exit" -ne 0 ]; then
    echo "railway up devolvió error/intermitencia; sigo validando el deployment"
  fi

  if wait_railway_deployment_success "$RAILWAY_BIN" "$SERVICE" 30 10; then
    WEB_BASE="${WEB_URL%/}"
    API_BASE="${API_HEALTH_URL%/}"

    echo "==> Healthcheck web liveness (${WEB_BASE}/health)"
    wait_http_2xx "${WEB_BASE}/health" 24 5

    echo "==> Healthcheck web readiness (${WEB_BASE}/health/ready)"
    wait_http_2xx "${WEB_BASE}/health/ready" 24 5

    echo "==> Healthcheck API readiness (${API_BASE}/health/ready)"
    wait_api_ready "${API_BASE}/health/ready" 24 5

    "$RAILWAY_BIN" deployment list --service "$SERVICE" --limit 1 --json
    "$RAILWAY_BIN" status
    echo "==> Deploy web OK"
    exit 0
  fi

  attempt=$((attempt + 1))
done

echo "ERROR: no se logró SUCCESS para el web."
exit 1
