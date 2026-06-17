#!/usr/bin/env bash
# Sync production behavior variables to Railway (API + Web).
# Requires: RAILWAY_API_TOKEN or RAILWAY_TOKEN, RAILWAY_PROJECT_ID, RAILWAY_ENVIRONMENT_ID
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

RAILWAY_BIN="${RAILWAY_BIN:-railway}"
TOKEN="${RAILWAY_API_TOKEN:-${RAILWAY_TOKEN:-}}"
PROJECT="${RAILWAY_PROJECT_ID:-6a535ffc-9224-4db3-b385-adf8f2bf0218}"
ENVIRONMENT="${RAILWAY_ENVIRONMENT_ID:-240cefd8-f924-4b76-a890-771db0a45a91}"
API_SERVICE="${RAILWAY_API_SERVICE_ID:-203d29a0-15ce-4cad-8014-2ea06d3008ed}"
WEB_SERVICE="${RAILWAY_WEB_SERVICE_ID:-304ec087-4411-4ced-a42c-e00d451fcf4e}"

if [ -z "$TOKEN" ]; then
  echo "Skip sync-railway-production-vars: no Railway token"
  exit 0
fi

export RAILWAY_TOKEN="$TOKEN"

upsert() {
  local service="$1"
  local key="$2"
  local value="$3"
  "$RAILWAY_BIN" variables --service "$service" --set "${key}=${value}" >/dev/null
  echo "  ✓ ${key}"
}

echo "==> Sync API variables"
"$RAILWAY_BIN" link --project "$PROJECT" --environment "$ENVIRONMENT" --service "$API_SERVICE" >/dev/null

upsert "$API_SERVICE" WEB_ORIGIN "https://financieramente.up.railway.app"
upsert "$API_SERVICE" APPROVAL_LINK_BASE_URL "https://locoplaya666-final-financial-agent-production.up.railway.app"
upsert "$API_SERVICE" SESSION_COOKIE_SAME_SITE "none"
upsert "$API_SERVICE" DATA_DIR "/app/data"
upsert "$API_SERVICE" LOG_LEVEL "info"
upsert "$API_SERVICE" ENABLE_DEV_INJECTION "false"
upsert "$API_SERVICE" OPENAI_MODEL "gpt-5.2"
upsert "$API_SERVICE" ANTHROPIC_MODEL_FAST "claude-haiku-4-5"
upsert "$API_SERVICE" BUDGET_CHAT_REACT_ENABLED "true"
upsert "$API_SERVICE" TRANSACTIONS_VISION_MODEL "gpt-5.4-nano"
upsert "$API_SERVICE" TRANSACTIONS_CHAT_MODEL "gpt-4o-mini"
upsert "$API_SERVICE" TRANSACTIONS_SUMMARY_MODEL "gpt-5.4-mini"
upsert "$API_SERVICE" TRANSACTIONS_RECONCILE_MODEL "gpt-5.4-mini"
upsert "$API_SERVICE" FINANCIAL_CONTEXT_MCP_ENABLED "true"
upsert "$API_SERVICE" CORE_CONTEXT_PACK_ENABLED "true"
upsert "$API_SERVICE" BUDGET_CONTEXT_PACK_ENABLED "true"
upsert "$API_SERVICE" TRANSACTIONS_CONTEXT_PUBLISH_ENABLED "true"
upsert "$API_SERVICE" DIAGNOSTIC_CONTEXT_PACK_ENABLED "true"
upsert "$API_SERVICE" CONTEXT_CONSISTENCY_ENABLED "true"
upsert "$API_SERVICE" CONTEXT_CONFLICT_UI_ENABLED "true"
upsert "$API_SERVICE" FINANCIAL_CONTEXT_SHADOW_MODE "false"
upsert "$API_SERVICE" APPROVAL_ADMIN_EMAIL "sasha.oyanadel@ug.uchile.cl"
upsert "$API_SERVICE" ENABLE_BOOTSTRAP_ADMIN_LOGIN "true"
upsert "$API_SERVICE" BOOTSTRAP_ADMIN_EMAIL "admin@financieramente.local"
upsert "$API_SERVICE" BOOTSTRAP_ADMIN_PASSWORD "Financieramente123!"
upsert "$API_SERVICE" BOOTSTRAP_ADMIN_NAME "Administrador"

echo "==> Sync WEB variables"
"$RAILWAY_BIN" link --project "$PROJECT" --environment "$ENVIRONMENT" --service "$WEB_SERVICE" >/dev/null

upsert "$WEB_SERVICE" NEXT_PUBLIC_API_URL "https://locoplaya666-final-financial-agent-production.up.railway.app"
upsert "$WEB_SERVICE" NEXT_PUBLIC_API_ORIGIN "https://locoplaya666-final-financial-agent-production.up.railway.app"
upsert "$WEB_SERVICE" NEXT_PUBLIC_APP_ORIGIN "https://financieramente.up.railway.app"
upsert "$WEB_SERVICE" TRANSACTIONS_CHAT_MODEL "gpt-4o-mini"
upsert "$WEB_SERVICE" DATA_DIR "/app/data"

echo "==> Railway production vars synced"
