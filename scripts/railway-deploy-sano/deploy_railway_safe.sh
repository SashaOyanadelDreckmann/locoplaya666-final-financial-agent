#!/usr/bin/env bash
# deploy_railway_safe.sh — Safe Railway deploy: sync → push → deploy → healthcheck
set -euo pipefail

# ── Defaults ────────────────────────────────────────────────────────────────
REMOTE="origin"
TIMEOUT_SEC=900
SERVICE_ID=""
HEALTH_URL=""

# ── Arg parsing ──────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --service)      SERVICE_ID="$2";    shift 2 ;;
    --health-url)   HEALTH_URL="$2";    shift 2 ;;
    --remote)       REMOTE="$2";        shift 2 ;;
    --timeout-sec)  TIMEOUT_SEC="$2";   shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

[[ -z "$SERVICE_ID" ]]  && { echo "ERROR: --service is required" >&2; exit 1; }
[[ -z "$HEALTH_URL" ]]  && { echo "ERROR: --health-url is required" >&2; exit 1; }

# ── Helpers ──────────────────────────────────────────────────────────────────
log()  { echo "[$(date '+%H:%M:%S')] $*"; }
fail() { echo "RESULTADO: ESTADO=FAILED | DEPLOYMENT_ID=${DEPLOY_ID:-unknown} | HEALTHCHECK=skip | SANO=NO"; exit 1; }

DEPLOY_ID="unknown"

# ── 1. Detect branch ─────────────────────────────────────────────────────────
BRANCH=$(git branch --show-current)
[[ -z "$BRANCH" ]] && { echo "ERROR: HEAD desconectado, no hay rama activa." >&2; fail; }
log "Rama actual: $BRANCH"

# ── 2. Fetch ─────────────────────────────────────────────────────────────────
log "Fetching $REMOTE..."
git fetch --all --prune

# ── 3. Pull rebase ───────────────────────────────────────────────────────────
log "Pulling con rebase desde $REMOTE/$BRANCH..."
set +e
PULL_OUT=$(git pull --rebase --autostash "$REMOTE" "$BRANCH" 2>&1)
PULL_RC=$?
set -e

if [[ $PULL_RC -ne 0 ]]; then
  echo "ERROR: pull --rebase falló." >&2
  echo "$PULL_OUT" >&2

  # ── 4. Detect conflicts ──────────────────────────────────────────────────
  CONFLICTS=$(git diff --name-only --diff-filter=U 2>/dev/null || true)
  if [[ -n "$CONFLICTS" ]]; then
    echo "CONFLICTOS detectados en los siguientes archivos:" >&2
    echo "$CONFLICTS" >&2
    echo "Resuelve los conflictos manualmente y vuelve a ejecutar el deploy." >&2
  fi
  git rebase --abort 2>/dev/null || true
  fail
fi
log "Pull OK."

# ── 5. Push ──────────────────────────────────────────────────────────────────
log "Pushing a $REMOTE/$BRANCH..."
git push -u "$REMOTE" "$BRANCH"
log "Push OK."

# ── 6. Railway up ────────────────────────────────────────────────────────────
log "Iniciando deploy en Railway (service: $SERVICE_ID)..."
DEPLOY_OUTPUT=$(railway up --service "$SERVICE_ID" --detach 2>&1)
echo "$DEPLOY_OUTPUT"

# Extract deployment ID from output
DEPLOY_ID=$(echo "$DEPLOY_OUTPUT" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1 || true)
[[ -z "$DEPLOY_ID" ]] && DEPLOY_ID="unknown"
log "Deployment ID: $DEPLOY_ID"

# ── 7. Wait for terminal state ───────────────────────────────────────────────
log "Esperando estado terminal (timeout: ${TIMEOUT_SEC}s)..."
ELAPSED=0
POLL_INTERVAL=10
FINAL_STATUS="TIMEOUT"

while [[ $ELAPSED -lt $TIMEOUT_SEC ]]; do
  sleep $POLL_INTERVAL
  ELAPSED=$((ELAPSED + POLL_INTERVAL))

  STATUS_OUTPUT=$(railway status --service "$SERVICE_ID" 2>&1 || true)
  log "[$ELAPSED s] Status: $STATUS_OUTPUT"

  for terminal in SUCCESS FAILED CRASHED REMOVED; do
    if echo "$STATUS_OUTPUT" | grep -qi "$terminal"; then
      FINAL_STATUS="$terminal"
      break 2
    fi
  done
done

log "Estado terminal: $FINAL_STATUS"

# ── 8. Logs on failure ───────────────────────────────────────────────────────
if [[ "$FINAL_STATUS" != "SUCCESS" ]]; then
  echo "=== BUILD LOGS ===" >&2
  railway logs --build --service "$SERVICE_ID" 2>&1 | tail -80 >&2 || true
  echo "RESULTADO: ESTADO=$FINAL_STATUS | DEPLOYMENT_ID=$DEPLOY_ID | HEALTHCHECK=skip | SANO=NO"
  exit 1
fi

# ── 9. Healthcheck ───────────────────────────────────────────────────────────
log "Ejecutando healthcheck: $HEALTH_URL"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 "$HEALTH_URL" || echo "000")

if [[ "$HTTP_CODE" =~ ^2 ]]; then
  SANO="SI"
else
  SANO="NO"
fi

echo "RESULTADO: ESTADO=$FINAL_STATUS | DEPLOYMENT_ID=$DEPLOY_ID | HEALTHCHECK=$HTTP_CODE | SANO=$SANO"
[[ "$SANO" == "SI" ]] && exit 0 || exit 2
