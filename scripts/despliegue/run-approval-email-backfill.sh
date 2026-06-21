#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

RAILWAY_BIN="${RAILWAY_BIN:-railway}"
PROJECT="${RAILWAY_PROJECT_ID:-6a535ffc-9224-4db3-b385-adf8f2bf0218}"
ENVIRONMENT="${RAILWAY_ENVIRONMENT_ID:-240cefd8-f924-4b76-a890-771db0a45a91}"
API_SERVICE_ID="${RAILWAY_API_SERVICE_ID:-203d29a0-15ce-4cad-8014-2ea06d3008ed}"
PG_SERVICE_ID="${RAILWAY_POSTGRES_SERVICE_ID:-5d78d65f-87d5-4b06-86c7-19123b9c9877}"
TOKEN="${RAILWAY_API_TOKEN:-${RAILWAY_TOKEN:-}}"

if [ -z "$TOKEN" ]; then
  echo "Missing RAILWAY_API_TOKEN / RAILWAY_TOKEN"
  exit 1
fi

export RAILWAY_TOKEN="$TOKEN"
export RAILWAY_API_TOKEN="$TOKEN"

fetch_vars() {
  local service_id="$1"
  curl -s -X POST https://backboard.railway.com/graphql/v2 \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"query\":\"query(\$projectId: String!, \$environmentId: String!, \$serviceId: String!) { variables(projectId: \$projectId, environmentId: \$environmentId, serviceId: \$serviceId) }\",\"variables\":{\"projectId\":\"$PROJECT\",\"environmentId\":\"$ENVIRONMENT\",\"serviceId\":\"$service_id\"}}"
}

API_VARS="$(fetch_vars "$API_SERVICE_ID")"
DB_URL="$(echo "$API_VARS" | jq -r '.data.variables.DATABASE_PUBLIC_URL // empty')"
if [ -z "$DB_URL" ] || [ "$DB_URL" = "null" ]; then
  PG_VARS="$(fetch_vars "$PG_SERVICE_ID")"
  DB_URL="$(echo "$PG_VARS" | jq -r '.data.variables.DATABASE_PUBLIC_URL // empty')"
fi

RESEND_KEY="$(echo "$API_VARS" | jq -r '.data.variables.RESEND_API_KEY // empty')"
WEB_ORIGIN_VAL="$(echo "$API_VARS" | jq -r '.data.variables.WEB_ORIGIN // "https://financieramente.up.railway.app"')"
EMAIL_FROM="$(echo "$API_VARS" | jq -r '.data.variables.APPROVAL_EMAIL_FROM // "Financieramente <onboarding@financieramente.app>"')"

if [ -z "$DB_URL" ] || [ -z "$RESEND_KEY" ]; then
  echo "Missing DATABASE_PUBLIC_URL or RESEND_API_KEY in Railway"
  exit 1
fi

echo "FROM=$EMAIL_FROM"
DATABASE_URL="$DB_URL" \
RESEND_API_KEY="$RESEND_KEY" \
WEB_ORIGIN="$WEB_ORIGIN_VAL" \
APPROVAL_EMAIL_FROM="$EMAIL_FROM" \
  pnpm exec tsx scripts/qa/resend-approved-account-emails.ts
