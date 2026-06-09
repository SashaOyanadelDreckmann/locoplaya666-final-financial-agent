#!/usr/bin/env bash
# E2E producción: agente de presupuesto con herramientas de tabla
set -euo pipefail

API="${API:-https://locoplaya666-final-financial-agent-production.up.railway.app}"
EMAIL="${EMAIL:-cursor.modal.1781008149@ug.uchile.cl}"
PASS="${PASS:-CursorModal2026!}"
COOKIE_JAR="${COOKIE_JAR:-/tmp/fa-prod-budget-e2e.txt}"

rm -f "$COOKIE_JAR"

login() {
  curl -sS -c "$COOKIE_JAR" -b "$COOKIE_JAR" -X POST "$API/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" | jq -e '.ok == true' >/dev/null
  CSRF="$(curl -sS -c "$COOKIE_JAR" -b "$COOKIE_JAR" "$API/api/session" | jq -r '.data.csrfToken // empty')"
  if [ -z "$CSRF" ]; then
    CSRF="$(awk '$6=="csrf-token"{print $7}' "$COOKIE_JAR" | tail -1)"
  fi
  [ -n "$CSRF" ] || { echo "FAIL: no CSRF"; exit 1; }
}

budget_chat() {
  local payload="$1"
  curl -sS -c "$COOKIE_JAR" -b "$COOKIE_JAR" -X POST "$API/api/budget-chat" \
    -H "Content-Type: application/json" \
    -H "x-csrf-token: $CSRF" \
    -d "$payload"
}

apply_action() {
  local rows_json="$1"
  local action_json="$2"
  node -e "
    const rows = JSON.parse(process.argv[1]);
    const action = JSON.parse(process.argv[2]);
    const { mergeBudgetActionIntoRow } = require('./packages/shared/dist/budget-table-schema.js');
    const existing = rows.find(r => r.id === action.id) ?? null;
    if (action.kind === 'delete') {
      console.log(JSON.stringify(rows.filter(r => r.id !== action.id)));
      process.exit(0);
    }
    const merged = mergeBudgetActionIntoRow(existing, action);
    if (!merged) { console.error('merge failed'); process.exit(1); }
    const out = existing ? rows.map(r => r.id === merged.id ? merged : r) : [...rows, merged];
    console.log(JSON.stringify(out));
  " "$rows_json" "$action_json"
}

login
echo "==> Logged in as $EMAIL"

ROWS='[{"id":"income_salary","category":"Sueldo líquido","type":"income","amount":900000}]'
CHAT='[]'

init=$(budget_chat "{\"intent\":\"init\",\"budgetRows\":$ROWS,\"chatAnswers\":$CHAT}")
echo "$init" | jq -e '.ok == true' >/dev/null
echo "$init" | jq -e '.source | test("budget_agent")' >/dev/null
Q1=$(echo "$init" | jq -r '.next_question // empty')
echo "INIT source=$(echo "$init" | jq -r '.source')"
echo "Q1: $Q1"
echo "$Q1" | grep -Eiq '\?' || { echo "FAIL: init without question"; exit 1; }

r1=$(budget_chat "$(jq -nc --arg q "$Q1" '{intent:"reply",answer:"agrega gym, streaming, mascotas y colegio como gastos",question:$q,budgetRows:'"$ROWS"',chatAnswers:'"$CHAT"'}')")
echo "$r1" | jq -e '.ok == true' >/dev/null
echo "$r1" | jq -e '.source | test("budget_agent")' >/dev/null

if [ "$(echo "$r1" | jq -r '.requires_confirmation // false')" = "true" ]; then
  ACTIONS=$(echo "$r1" | jq -c '.pending_confirmation.actions // []')
  echo "Bulk add requires confirmation ($(echo "$ACTIONS" | jq 'length') actions)"
  r1=$(budget_chat "$(jq -nc --arg q "$(echo "$r1" | jq -r '.next_question')" --argjson pending "$(echo "$r1" | jq -c '.pending_confirmation')" '{intent:"reply",answer:"sí",question:$q,budgetRows:'"$ROWS"',chatAnswers:'"$CHAT"',pendingConfirmation:$pending}')")
  echo "$r1" | jq -e '.source == "budget_agent_confirm_apply"' >/dev/null
  ACTIONS=$(echo "$r1" | jq -c '.actions // []')
else
  ACTIONS=$(echo "$r1" | jq -c '.actions // (.action // null | if . == null then [] else [.] end)')
fi

COUNT=$(echo "$ACTIONS" | jq 'length')
echo "ACTIONS count: $COUNT"
[ "$COUNT" -ge 3 ] || { echo "FAIL: expected at least 3 add actions"; echo "$ACTIONS" | jq .; exit 1; }

for row in $(echo "$ACTIONS" | jq -r '.[].id'); do
  action=$(echo "$ACTIONS" | jq -c --arg id "$row" '.[] | select(.id == $id)')
  ROWS=$(apply_action "$ROWS" "$action")
done

FINAL_COUNT=$(echo "$ROWS" | jq 'length')
[ "$FINAL_COUNT" -ge 4 ] || { echo "FAIL: expected >=4 rows after bulk add, got $FINAL_COUNT"; exit 1; }

echo ""
echo "FINAL TABLE ($FINAL_COUNT rows):"
echo "$ROWS" | jq .
echo ""
echo "PASS: production budget agent applies bulk table changes."
