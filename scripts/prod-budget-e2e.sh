#!/usr/bin/env bash
# E2E producción: budget-chat → acciones → estado de fila esperado
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
  " "$rows_json" "$action_json" 2>/dev/null || node - <<NODE
const rows = $rows_json;
const action = $action_json;
function merge(existing, action) {
  const id = action.id;
  const rowType = action.type || existing?.type;
  const category = String(action.category ?? existing?.category ?? '').trim();
  const amount = action.amount === undefined ? (existing?.amount ?? 0) : action.amount;
  const cadence = action.cadence ?? existing?.cadence;
  const paymentMethod = action.payment_method ?? action.paymentMethod ?? existing?.paymentMethod;
  const movementType = action.movement_type ?? action.movementType ?? existing?.movementType;
  return { id, category, type: rowType, amount, cadence, paymentMethod, movementType };
}
const existing = rows.find(r => r.id === action.id) ?? null;
const merged = merge(existing, action);
const out = existing ? rows.map(r => r.id === merged.id ? merged : r) : [...rows, merged];
console.log(JSON.stringify(out));
NODE
}

assert_eq() {
  local label="$1" expected="$2" actual="$3"
  if [ "$expected" != "$actual" ]; then
    echo "FAIL [$label] expected=$expected actual=$actual"
    exit 1
  fi
  echo "OK  [$label] = $actual"
}

login
echo "==> Logged in as $EMAIL"

ROWS='[{"id":"expense_food","category":"Alimentación","type":"expense","amount":0}]'
CHAT='[]'

init=$(budget_chat "{\"intent\":\"init\",\"budgetRows\":$ROWS,\"chatAnswers\":$CHAT}")
echo "$init" | jq -e '.ok == true' >/dev/null
Q1=$(echo "$init" | jq -r '.next_question // .data.next_question // empty')
SRC=$(echo "$init" | jq -r '.source // empty')
FOCUS=$(echo "$init" | jq -r '.focus_row_id // empty')
echo "INIT source=$SRC focus=$FOCUS"
echo "Q1: $Q1"
echo "$Q1" | grep -Eiq 'tipo de movimiento|categoría' || { echo "FAIL: init question not movement-type first"; exit 1; }

r1=$(budget_chat "$(jq -nc --arg q "$Q1" '{intent:"reply",answer:"transporte",question:$q,assistantFocusRowId:"expense_food",budgetRows:'"$ROWS"',chatAnswers:'"$CHAT"'}')")
echo "$r1" | jq -e '.ok == true' >/dev/null
echo "$r1" | jq -e '.source == "deterministic_movement_type_update"' >/dev/null
ACTION1=$(echo "$r1" | jq -c '.action')
echo "$ACTION1" | jq -e '.movement_type == "transport"' >/dev/null
ROWS=$(apply_action "$ROWS" "$ACTION1")
assert_eq movementType transport "$(echo "$ROWS" | jq -r '.[0].movementType // empty')"
assert_eq amount_unchanged 0 "$(echo "$ROWS" | jq -r '.[0].amount')"
Q2=$(echo "$r1" | jq -r '.next_question // empty')
echo "Q2: $Q2"
echo "$Q2" | grep -Eiq 'llamar este movimiento' || { echo "FAIL: expected name question"; exit 1; }

CHAT=$(echo "$CHAT" | jq -c --arg q "$Q1" '[{q:$q,a:"transporte"}]')
r2=$(budget_chat "$(jq -nc --arg q "$Q2" '{intent:"reply",answer:"Supermercado",question:$q,assistantFocusRowId:"expense_food",budgetRows:'"$ROWS"',chatAnswers:'"$CHAT"'}')")
echo "$r2" | jq -e '.source == "deterministic_category_update"' >/dev/null
ACTION2=$(echo "$r2" | jq -c '.action')
ROWS=$(apply_action "$ROWS" "$ACTION2")
assert_eq category Supermercado "$(echo "$ROWS" | jq -r '.[0].category')"
assert_eq movementType_preserved transport "$(echo "$ROWS" | jq -r '.[0].movementType')"
Q3=$(echo "$r2" | jq -r '.next_question // empty')
echo "Q3: $Q3"
echo "$Q3" | grep -Eiq 'monto mensual' || { echo "FAIL: expected amount question"; exit 1; }

CHAT=$(echo "$CHAT" | jq -c --arg q "$Q2" '. + [{q:$q,a:"Supermercado"}]')
r3=$(budget_chat "$(jq -nc --arg q "$Q3" '{intent:"reply",answer:"180000",question:$q,assistantFocusRowId:"expense_food",budgetRows:'"$ROWS"',chatAnswers:'"$CHAT"'}')")
echo "$r3" | jq -e '.source == "deterministic_update"' >/dev/null
ACTION3=$(echo "$r3" | jq -c '.action')
ROWS=$(apply_action "$ROWS" "$ACTION3")
assert_eq amount 180000 "$(echo "$ROWS" | jq -r '.[0].amount')"
Q4=$(echo "$r3" | jq -r '.next_question // empty')
echo "Q4: $Q4"
echo "$Q4" | grep -Eiq 'fijo|variable' || { echo "FAIL: expected cadence question"; exit 1; }

CHAT=$(echo "$CHAT" | jq -c --arg q "$Q3" '. + [{q:$q,a:"180000"}]')
r4=$(budget_chat "$(jq -nc --arg q "$Q4" '{intent:"reply",answer:"fijo, pago con débito",question:$q,assistantFocusRowId:"expense_food",budgetRows:'"$ROWS"',chatAnswers:'"$CHAT"'}')")
echo "$r4" | jq -e '.source == "deterministic_field_update"' >/dev/null
ACTION4=$(echo "$r4" | jq -c '.action')
ROWS=$(apply_action "$ROWS" "$ACTION4")
assert_eq cadence fixed "$(echo "$ROWS" | jq -r '.[0].cadence')"
assert_eq paymentMethod debit "$(echo "$ROWS" | jq -r '.[0].paymentMethod')"

echo ""
echo "FINAL ROW:"
echo "$ROWS" | jq .
echo ""
echo "PASS: production budget flow updates all expected table fields in order."
