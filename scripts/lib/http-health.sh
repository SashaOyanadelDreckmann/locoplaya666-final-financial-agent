#!/usr/bin/env bash
# Shared HTTP health helpers for deploy scripts.
set -euo pipefail

wait_railway_deployment_success() {
  local railway_bin="${1:?}"
  local service="${2:?}"
  local max_polls="${3:-30}"
  local poll_seconds="${4:-10}"

  for _ in $(seq 1 "$max_polls"); do
    local payload status id
    payload="$("$railway_bin" deployment list --service "$service" --limit 1 --json 2>/dev/null || echo '[]')"
    status="$(echo "$payload" | jq -r '.[0].status // "UNKNOWN"')"
    id="$(echo "$payload" | jq -r '.[0].id // "none"')"
    echo "deployment service=${service} status=${status} id=${id}"

    if [ "$status" = "SUCCESS" ]; then
      return 0
    fi
    if [ "$status" = "FAILED" ] || [ "$status" = "CRASHED" ] || [ "$status" = "REMOVED" ]; then
      return 1
    fi
    sleep "$poll_seconds"
  done

  echo "Timeout waiting for Railway deployment SUCCESS (service=${service})"
  return 1
}

wait_http_2xx() {
  local url="${1:?}"
  local max_attempts="${2:-24}"
  local sleep_seconds="${3:-5}"
  local attempt=1

  while [ "$attempt" -le "$max_attempts" ]; do
    local code body
    code="$(curl -sS -o /tmp/fa-health-body.json -m 20 -w "%{http_code}" "$url" || true)"
    echo "health attempt=${attempt}/${max_attempts} url=${url} code=${code}"

    if [ "$code" -ge 200 ] 2>/dev/null && [ "$code" -lt 300 ] 2>/dev/null; then
      if [ -f /tmp/fa-health-body.json ]; then
        body="$(cat /tmp/fa-health-body.json)"
        echo "health body=${body}"
      fi
      return 0
    fi

    attempt=$((attempt + 1))
    sleep "$sleep_seconds"
  done

  if [ -f /tmp/fa-health-body.json ]; then
    echo "health last_body=$(cat /tmp/fa-health-body.json)"
  fi
  return 1
}

assert_json_field_true() {
  local file="${1:?}"
  local jq_expr="${2:?}"
  jq -e "$jq_expr" "$file" >/dev/null
}

wait_api_ready() {
  local ready_url="${1:?}"
  local max_attempts="${2:-24}"
  local sleep_seconds="${3:-5}"
  local attempt=1

  while [ "$attempt" -le "$max_attempts" ]; do
    local code
    code="$(curl -sS -o /tmp/fa-ready-body.json -m 20 -w "%{http_code}" "$ready_url" || true)"
    echo "ready attempt=${attempt}/${max_attempts} url=${ready_url} code=${code}"

    if [ "$code" = "200" ] && [ -f /tmp/fa-ready-body.json ]; then
      if jq -e '.data.ready == true' /tmp/fa-ready-body.json >/dev/null 2>&1 \
        || jq -e '.ready == true' /tmp/fa-ready-body.json >/dev/null 2>&1; then
        cat /tmp/fa-ready-body.json
        return 0
      fi
      echo "ready body not healthy: $(cat /tmp/fa-ready-body.json)"
    fi

    attempt=$((attempt + 1))
    sleep "$sleep_seconds"
  done

  if [ -f /tmp/fa-ready-body.json ]; then
    echo "ready last_body=$(cat /tmp/fa-ready-body.json)"
  fi
  return 1
}
