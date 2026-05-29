#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

RAILWAY_BIN="/Users/locoplaya666/.nvm/versions/node/v24.12.0/bin/railway"
SERVICE="keen-magic"
WEB_URL="https://financieramente.up.railway.app"
MAX_ATTEMPTS=3
POLL_SECONDS=10
MAX_POLLS=72

attempt=1
while [ "$attempt" -le "$MAX_ATTEMPTS" ]; do
  echo "==> Attempt ${attempt}/${MAX_ATTEMPTS}"
  rm -rf apps/web/.next
  ./node_modules/.bin/pnpm --filter @financial-agent/web typecheck

  set +e
  "$RAILWAY_BIN" up --service "$SERVICE" --detach
  up_exit=$?
  set -e
  if [ "$up_exit" -ne 0 ]; then
    echo "railway up timeout/intermitencia, sigo monitoreando deployment..."
  fi

  deployment_id=""
  status=""
  for _ in $(seq 1 "$MAX_POLLS"); do
    status="$("$RAILWAY_BIN" deployment list --service "$SERVICE" --limit 1 --json | jq -r '.[0].status')"
    deployment_id="$("$RAILWAY_BIN" deployment list --service "$SERVICE" --limit 1 --json | jq -r '.[0].id')"
    echo "status=${status} id=${deployment_id}"

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
    sleep "$POLL_SECONDS"
  done

  attempt=$((attempt + 1))
done

echo "ERROR: No se logró SUCCESS en ${MAX_ATTEMPTS} intentos."
exit 1
