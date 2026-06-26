#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

# shellcheck source=scripts/despliegue/lib/http-health.sh
source "$ROOT_DIR/scripts/despliegue/lib/http-health.sh"

RAILWAY_BIN="${RAILWAY_BIN:-railway}"
SERVICE="${RAILWAY_API_SERVICE_ID:-2d7f897f-3b0d-4a79-8ca1-ff760b7bcb53}"
PROJECT="${RAILWAY_PROJECT_ID:-}"
ENVIRONMENT="${RAILWAY_ENVIRONMENT_ID:-}"
API_HEALTH_URL="${API_HEALTH_URL:-https://locoplaya666-final-financial-agent-production.up.railway.app}"

if [ -z "$PROJECT" ] || [ -z "$ENVIRONMENT" ]; then
  echo "Faltan variables: RAILWAY_PROJECT_ID, RAILWAY_ENVIRONMENT_ID"
  exit 1
fi

if [ -n "${RAILWAY_API_TOKEN:-}" ]; then
  export RAILWAY_TOKEN="$RAILWAY_API_TOKEN"
fi

if [ -f "$ROOT_DIR/scripts/despliegue/sync-railway-production-vars.sh" ]; then
  bash "$ROOT_DIR/scripts/despliegue/sync-railway-production-vars.sh" || {
    echo "WARN: sync-railway-production-vars falló; continúo deploy"
  }
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

API_SERVICE_NAME="${RAILWAY_API_SERVICE_NAME:-locoplaya666-final-financial-agent}"
if [ -n "${RAILWAY_API_TOKEN:-${RAILWAY_TOKEN:-}}" ]; then
  export RAILWAY_TOKEN="${RAILWAY_API_TOKEN:-${RAILWAY_TOKEN:-}}"
  export RAILWAY_API_TOKEN="$RAILWAY_TOKEN"
  echo "==> Ensure transactional email vars on API service"
  "$RAILWAY_BIN" link --project "$PROJECT" --environment "$ENVIRONMENT" --service "$API_SERVICE_NAME" >/dev/null
  "$RAILWAY_BIN" variables --set "APPROVAL_ADMIN_EMAIL_FROM=Financieramente <onboarding@resend.dev>" >/dev/null || true
  "$RAILWAY_BIN" variables --set "APPROVAL_EMAIL_FROM=Financieramente <onboarding@updates.ug.uchile.cl>" >/dev/null || true
  "$RAILWAY_BIN" variables --set "WEB_ORIGIN=https://financieramente.up.railway.app" >/dev/null || true
  "$RAILWAY_BIN" link --project "$PROJECT" --environment "$ENVIRONMENT" --service "$SERVICE" >/dev/null
fi

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

API_SERVICE_NAME="${RAILWAY_API_SERVICE_NAME:-locoplaya666-final-financial-agent}"
echo "==> Backfill approval confirmation emails (idempotent)"
API_VARS="$("$RAILWAY_BIN" variable list --project "$PROJECT" --environment "$ENVIRONMENT" --service "$API_SERVICE_NAME" --json 2>/dev/null || echo '{}')"
DB_URL="$("$RAILWAY_BIN" variable list --project "$PROJECT" --environment "$ENVIRONMENT" --service Postgres --json 2>/dev/null | jq -r '.DATABASE_PUBLIC_URL // empty')"
RESEND_KEY="$(echo "$API_VARS" | jq -r '.RESEND_API_KEY // empty')"
WEB_ORIGIN_VAL="$(echo "$API_VARS" | jq -r '.WEB_ORIGIN // "https://financieramente.up.railway.app"')"
EMAIL_FROM="$(echo "$API_VARS" | jq -r '.APPROVAL_EMAIL_FROM // "Financieramente <onboarding@financieramente.app>"')"

if [ -n "$DB_URL" ] && [ -n "$RESEND_KEY" ]; then
  DATABASE_URL="$DB_URL" \
  RESEND_API_KEY="$RESEND_KEY" \
  WEB_ORIGIN="$WEB_ORIGIN_VAL" \
  APPROVAL_EMAIL_FROM="$EMAIL_FROM" \
    pnpm exec tsx scripts/qa/resend-approved-account-emails.ts || {
      echo "WARN: approval confirmation email backfill reported failures"
    }
else
  echo "WARN: skip approval email backfill (missing DATABASE_URL or RESEND_API_KEY)"
fi

echo "==> Deploy API OK"
exit 0
