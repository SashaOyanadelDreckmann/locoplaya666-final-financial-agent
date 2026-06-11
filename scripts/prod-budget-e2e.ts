#!/usr/bin/env tsx
/**
 * E2E en producción: valida flujo budget-chat y sincronización acción→tabla.
 */
import { mergeBudgetActionIntoRow, type BudgetRow, type BudgetTableAction } from '@financial-agent/shared';

const API = process.env.API?.trim();
const EMAIL = process.env.EMAIL?.trim();
const PASS = process.env.PASS?.trim();

if (!API || !EMAIL || !PASS) {
  console.error('Set API, EMAIL, and PASS env vars for prod budget E2E.');
  process.exit(1);
}

const jar = new Map<string, string>();

function parseSetCookie(headers: Headers): void {
  const raw = headers.getSetCookie?.() ?? [];
  for (const line of raw) {
    const [pair] = line.split(';');
    const idx = pair.indexOf('=');
    if (idx > 0) jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
  }
}

function cookieHeader(): string {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

async function request(method: string, path: string, body?: unknown, csrf?: string) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookieHeader() ? { Cookie: cookieHeader() } : {}),
      ...(csrf ? { 'x-csrf-token': csrf } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  parseSetCookie(res.headers);
  return res.json() as Promise<Record<string, unknown>>;
}

function applyAction(rows: BudgetRow[], action: BudgetTableAction): BudgetRow[] {
  const existing = rows.find((r) => r.id === action.id) ?? null;
  if (action.kind === 'delete') return rows.filter((r) => r.id !== action.id);
  const merged = mergeBudgetActionIntoRow(existing, action);
  if (!merged) throw new Error(`merge failed for ${action.id}`);
  return existing ? rows.map((r) => (r.id === merged.id ? merged : r)) : [...rows, merged];
}

function assert(label: string, expected: unknown, actual: unknown) {
  if (expected !== actual) {
    throw new Error(`FAIL [${label}] expected=${String(expected)} actual=${String(actual)}`);
  }
  console.log(`OK  [${label}] = ${String(actual)}`);
}

async function main() {
  const login = await request('POST', '/auth/login', { email: EMAIL, password: PASS });
  if (!login.ok) throw new Error(`login failed: ${JSON.stringify(login)}`);
  console.log(`==> Logged in as ${EMAIL}`);

  let csrf = '';
  for (const [k, v] of jar) if (k === 'csrf-token') csrf = v;
  const session = await request('GET', '/api/session');
  csrf = String((session.data as { csrfToken?: string })?.csrfToken ?? csrf);

  let rows: BudgetRow[] = [{ id: 'expense_food', category: 'Alimentación', type: 'expense', amount: 0 }];
  let chatAnswers: Array<{ q: string; a: string }> = [];

  async function chat(intent: 'init' | 'reply', extra: Record<string, unknown>) {
    return request('POST', '/api/budget-chat', { intent, budgetRows: rows, chatAnswers, ...extra }, csrf);
  }

  const init = await chat('init', {});
  const q1 = String(init.next_question ?? '');
  console.log(`INIT source=${init.source} focus=${init.focus_row_id}`);
  console.log(`Q1: ${q1}`);
  if (!/tipo de movimiento|categoría/i.test(q1)) throw new Error('init question not movement-type first');

  const r1 = await chat('reply', { answer: 'transporte', question: q1, assistantFocusRowId: 'expense_food' });
  if (r1.source !== 'deterministic_movement_type_update') throw new Error(`r1 source=${r1.source}`);
  rows = applyAction(rows, r1.action as BudgetTableAction);
  assert('movementType', 'transport', rows[0]?.movementType);
  assert('amount after type', 0, rows[0]?.amount ?? 0);

  const q2 = String(r1.next_question ?? '');
  console.log(`Q2: ${q2}`);
  if (!/llamar este movimiento/i.test(q2)) throw new Error('expected name question');

  chatAnswers = [{ q: q1, a: 'transporte' }];
  const r2 = await chat('reply', { answer: 'Supermercado', question: q2, assistantFocusRowId: 'expense_food' });
  if (r2.source !== 'deterministic_category_update') throw new Error(`r2 source=${r2.source}`);
  rows = applyAction(rows, r2.action as BudgetTableAction);
  assert('category', 'Supermercado', rows[0]?.category);
  assert('movementType preserved', 'transport', rows[0]?.movementType);

  const q3 = String(r2.next_question ?? '');
  console.log(`Q3: ${q3}`);
  if (!/monto mensual/i.test(q3)) throw new Error('expected amount question');

  chatAnswers = [...chatAnswers, { q: q2, a: 'Supermercado' }];
  const r3 = await chat('reply', { answer: '180000', question: q3, assistantFocusRowId: 'expense_food' });
  if (r3.source !== 'deterministic_update') throw new Error(`r3 source=${r3.source}`);
  rows = applyAction(rows, r3.action as BudgetTableAction);
  assert('amount', 180000, rows[0]?.amount);

  const q4 = String(r3.next_question ?? '');
  console.log(`Q4: ${q4}`);
  if (!/fijo|variable/i.test(q4)) throw new Error('expected cadence question');

  chatAnswers = [...chatAnswers, { q: q3, a: '180000' }];
  const r4 = await chat('reply', {
    answer: 'fijo, pago con débito',
    question: q4,
    assistantFocusRowId: 'expense_food',
  });
  if (r4.source !== 'deterministic_field_update') throw new Error(`r4 source=${r4.source}`);
  rows = applyAction(rows, r4.action as BudgetTableAction);
  assert('cadence', 'fixed', rows[0]?.cadence);
  assert('paymentMethod', 'debit', rows[0]?.paymentMethod);

  console.log('\nFINAL ROW:', JSON.stringify(rows[0], null, 2));
  console.log('\nPASS: production budget flow updates all expected table fields in order.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
