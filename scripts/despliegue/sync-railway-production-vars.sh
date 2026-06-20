#!/usr/bin/env bash
# Sync production behavior variables to Railway (API + Web).
# Source of truth: .env.example (local dev profile).
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
API_SERVICE_NAME="${RAILWAY_API_SERVICE_NAME:-locoplaya666-final-financial-agent}"
WEB_SERVICE_NAME="${RAILWAY_WEB_SERVICE_NAME:-keen-magic}"

if [ -z "$TOKEN" ]; then
  echo "Skip sync-railway-production-vars: no Railway token"
  exit 0
fi

export RAILWAY_TOKEN="$TOKEN"
export RAILWAY_API_TOKEN="$TOKEN"

link_service() {
  local service_name="$1"
  "$RAILWAY_BIN" link --project "$PROJECT" --environment "$ENVIRONMENT" --service "$service_name" >/dev/null
}

upsert() {
  local _service_name="$1"
  local key="$2"
  local value="$3"
  "$RAILWAY_BIN" variables --set "${key}=${value}" >/dev/null
  echo "  ✓ ${key}"
}

echo "==> Sync API variables (local dev profile → Railway prod)"
link_service "$API_SERVICE_NAME"

upsert "$API_SERVICE_NAME" WEB_ORIGIN "https://financieramente.up.railway.app"
upsert "$API_SERVICE_NAME" APPROVAL_LINK_BASE_URL "https://locoplaya666-final-financial-agent-production.up.railway.app"
upsert "$API_SERVICE_NAME" SESSION_COOKIE_SAME_SITE "none"
upsert "$API_SERVICE_NAME" DATA_DIR "/app/data"
upsert "$API_SERVICE_NAME" LOG_LEVEL "info"
upsert "$API_SERVICE_NAME" ENABLE_DEV_INJECTION "false"

# Upload limits — 120 MB raw files; Express JSON headroom for base64
upsert "$API_SERVICE_NAME" EXPRESS_JSON_LIMIT "170mb"
upsert "$API_SERVICE_NAME" DOCUMENT_PARSE_MAX_FILE_BYTES "125829120"
upsert "$API_SERVICE_NAME" DOCUMENT_PARSE_MAX_TOTAL_BYTES "125829120"

# LLM — cartolas: mini primero, gpt-4.1 solo en retry OCR
upsert "$API_SERVICE_NAME" OPENAI_MODEL "gpt-5.2"
upsert "$API_SERVICE_NAME" OPENAI_MODEL_FAST "gpt-4.1-mini"
upsert "$API_SERVICE_NAME" ANTHROPIC_MODEL "claude-sonnet-4-6"
upsert "$API_SERVICE_NAME" ANTHROPIC_MODEL_FAST "claude-haiku-4-5"
upsert "$API_SERVICE_NAME" TRANSACTIONS_VISION_MODEL "gpt-4.1-mini"
upsert "$API_SERVICE_NAME" TRANSACTIONS_VISION_FALLBACK_MODEL "gpt-4.1"
upsert "$API_SERVICE_NAME" TRANSACTIONS_PROFILE_MODEL "gpt-4.1-mini"
upsert "$API_SERVICE_NAME" TRANSACTIONS_RECONCILE_MODEL "gpt-4.1-mini"
upsert "$API_SERVICE_NAME" TRANSACTIONS_VISION_DETAIL "high"
upsert "$API_SERVICE_NAME" TRANSACTIONS_SUMMARY_MODEL "gpt-4.1-mini"
upsert "$API_SERVICE_NAME" TRANSACTIONS_CHAT_MODEL "gpt-4.1-mini"
upsert "$API_SERVICE_NAME" BUDGET_CHAT_REACT_ENABLED "true"

# Context fabric — same as NODE_ENV=development defaults
upsert "$API_SERVICE_NAME" FINANCIAL_CONTEXT_MCP_ENABLED "true"
upsert "$API_SERVICE_NAME" CORE_CONTEXT_PACK_ENABLED "true"
upsert "$API_SERVICE_NAME" BUDGET_CONTEXT_PACK_ENABLED "true"
upsert "$API_SERVICE_NAME" TRANSACTIONS_CONTEXT_PUBLISH_ENABLED "true"
upsert "$API_SERVICE_NAME" DIAGNOSTIC_CONTEXT_PACK_ENABLED "true"
upsert "$API_SERVICE_NAME" CONTEXT_CONSISTENCY_ENABLED "true"
upsert "$API_SERVICE_NAME" CONTEXT_CONFLICT_UI_ENABLED "true"
upsert "$API_SERVICE_NAME" FINANCIAL_CONTEXT_SHADOW_MODE "false"

upsert "$API_SERVICE_NAME" APPROVAL_ADMIN_EMAIL "sasha.oyanadel@ug.uchile.cl"
upsert "$API_SERVICE_NAME" ENABLE_BOOTSTRAP_ADMIN_LOGIN "true"
upsert "$API_SERVICE_NAME" BOOTSTRAP_ADMIN_EMAIL "admin@financieramente.local"
upsert "$API_SERVICE_NAME" BOOTSTRAP_ADMIN_PASSWORD "Financieramente123!"
upsert "$API_SERVICE_NAME" BOOTSTRAP_ADMIN_NAME "Administrador"

echo "==> Sync WEB variables"
link_service "$WEB_SERVICE_NAME"

upsert "$WEB_SERVICE_NAME" NEXT_PUBLIC_API_URL "https://locoplaya666-final-financial-agent-production.up.railway.app"
upsert "$WEB_SERVICE_NAME" NEXT_PUBLIC_API_ORIGIN "https://locoplaya666-final-financial-agent-production.up.railway.app"
upsert "$WEB_SERVICE_NAME" NEXT_PUBLIC_APP_ORIGIN "https://financieramente.up.railway.app"
upsert "$WEB_SERVICE_NAME" TRANSACTIONS_CHAT_MODEL "gpt-4.1-mini"
upsert "$WEB_SERVICE_NAME" DATA_DIR "/app/data"

echo "==> Railway production vars synced from local profile"
