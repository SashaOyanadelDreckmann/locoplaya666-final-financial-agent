#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

RAILWAY_BIN="${RAILWAY_BIN:-railway}"
SERVICE="${RAILWAY_WEB_SERVICE_ID:-304ec087-4411-4ced-a42c-e00d451fcf4e}"
PROJECT="${RAILWAY_PROJECT_ID:-}"
ENVIRONMENT="${RAILWAY_ENVIRONMENT_ID:-}"
WEB_URL="${WEB_URL:-https://financieramente.up.railway.app}"

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

  for _ in $(seq 1 30); do
    payload="$("$RAILWAY_BIN" deployment list --service "$SERVICE" --limit 1 --json 2>/dev/null || echo '[]')"
    status="$(echo "$payload" | jq -r '.[0].status // "UNKNOWN"')"
    id="$(echo "$payload" | jq -r '.[0].id // "none"')"
    echo "status=${status} id=${id}"

    if [ "$status" = "SUCCESS" ]; then
      "$RAILWAY_BIN" deployment list --service "$SERVICE" --limit 1 --json
      "$RAILWAY_BIN" status
      curl -I -m 20 "$WEB_URL"
      echo "==> Deploy OK"
      exit 0
    fi

    if [ "$status" = "FAILED" ] || [ "$status" = "CRASHED" ] || [ "$status" = "REMOVED" ]; then
      break
    fi
    sleep 10
  done

  attempt=$((attempt + 1))
done

echo "ERROR: no se logró SUCCESS para el web."
exit 1
