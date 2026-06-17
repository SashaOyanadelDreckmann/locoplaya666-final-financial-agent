#!/usr/bin/env tsx
/**
 * Auditoría local del agente presupuesto contra API real.
 * Con BUDGET_CHAT_REACT_ENABLED=false usa rutas determinísticas (rápido, estable).
 */
import { createApprovalToken } from '../../apps/api/src/services/approval.service';
import {
  mergeBudgetActionIntoRow,
  type BudgetRow,
  type BudgetTableAction,
} from '@financial-agent/shared';

const API = process.env.API?.trim() || 'http://127.0.0.1:3001';

type AuditCase = { name: string; pass: boolean; detail: string };
const results: AuditCase[] = [];
const jar = new Map<string, string>();

function record(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? '✓' : '✗'} ${name}: ${detail}`);
}

function parseSetCookie(headers: Headers): void {
  for (const line of headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(';');
    const idx = pair.indexOf('=');
    if (idx > 0) jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
  }
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
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

function cookieHeader(): string {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

function applyAction(rows: BudgetRow[], action: BudgetTableAction): BudgetRow[] {
  const existing = rows.find((r) => r.id === action.id) ?? null;
  if (action.kind === 'delete') return rows.filter((r) => r.id !== action.id);
  const merged = mergeBudgetActionIntoRow(existing, action);
  if (!merged) throw new Error(`merge failed for ${action.id}`);
  return existing ? rows.map((r) => (r.id === merged.id ? { ...r, ...merged } : r)) : [...rows, merged];
}

async function main() {
  const email = `budget-audit-${Date.now()}@test.local`;
  const password = 'Secret123!';

  const reg = await request('POST', '/auth/register', { name: 'Budget Audit', email, password });
  record('auth register', reg.status === 200, `status=${reg.status}`);
  const userId = String((reg.body.data as { user?: { id?: string } })?.user?.id ?? '');
  if (!userId) throw new Error('no user id');

  const token = createApprovalToken({
    userId,
    adminEmail: process.env.APPROVAL_ADMIN_EMAIL || 'sasha.oyanadel@ug.uchile.cl',
    action: 'approve',
  });
  await request('GET', `/auth/approve?token=${encodeURIComponent(token)}`);
  const login = await request('POST', '/auth/login', { email, password });
  record('auth login', login.status === 200, `status=${login.status}`);

  const session = await request('GET', '/api/session');
  const csrf = String(
    (session.body.data as { csrfToken?: string })?.csrfToken ??
      [...jar.entries()].find(([k]) => k === 'csrf-token')?.[1] ??
      '',
  );
  record('session csrf', Boolean(csrf), csrf ? 'token ok' : 'missing csrf');

  let rows: BudgetRow[] = [
    { id: 'income_salary', category: 'Sueldo líquido', type: 'income', amount: 0 },
    { id: 'expense_rent', category: 'Arriendo / vivienda', type: 'expense', amount: 0 },
    { id: 'expense_food', category: 'Alimentación', type: 'expense', amount: 0 },
    { id: 'expense_other', category: 'Otros gastos', type: 'expense', amount: 50000 },
  ];
  let chatAnswers: Array<{ q: string; a: string }> = [];

  async function chat(intent: 'init' | 'reply', extra: Record<string, unknown>) {
    return request(
      'POST',
      '/api/budget-chat',
      { intent, budgetRows: rows, chatAnswers, products: [], ...extra },
      csrf,
    );
  }

  const init = await chat('init', {});
  const initQuestion = String(init.body.next_question ?? '');
  record(
    'init responde',
    init.status === 200 && initQuestion.includes('?'),
    `source=${init.body.source}`,
  );

  const income = await chat('reply', {
    answer: 'mi sueldo es 850 mil',
    question: initQuestion,
    assistantFocusRowId: 'income_salary',
  });
  const incomePending = income.body.pending_confirmation as { actions?: BudgetTableAction[] } | null;
  record(
    'update sueldo pide confirmación',
    income.status === 200 &&
      Boolean(income.body.requires_confirmation) &&
      (incomePending?.actions?.[0]?.amount === 850000 ||
        income.body.source === 'deterministic_update' ||
        income.body.source === 'deterministic_field_update'),
    `source=${income.body.source} requires_confirmation=${income.body.requires_confirmation}`,
  );

  const add = await chat('reply', {
    answer: 'agrega gimnasio 35000',
    question: String(income.body.next_question ?? initQuestion),
  });
  const addPending = add.body.pending_confirmation as { actions?: BudgetTableAction[] } | null;
  record(
    'add gimnasio pide confirmación',
    add.status === 200 && Boolean(add.body.requires_confirmation) && (addPending?.actions?.length ?? 0) > 0,
    `source=${add.body.source} actions=${addPending?.actions?.length ?? 0}`,
  );

  const reject = await chat('reply', {
    answer: 'no',
    question: String(add.body.next_question ?? ''),
    pendingConfirmation: addPending,
  });
  record(
    'rechazar propuesta',
    reject.status === 200 && String(reject.body.source).includes('reject'),
    `source=${reject.body.source}`,
  );

  const add2 = await chat('reply', {
    answer: 'agrega gimnasio 35000',
    question: String(reject.body.next_question ?? ''),
  });
  const pending2 = add2.body.pending_confirmation as { actions?: BudgetTableAction[] } | null;
  const confirm = await chat('reply', {
    answer: 'sí',
    question: String(add2.body.next_question ?? ''),
    pendingConfirmation: pending2,
  });
  record(
    'confirmar propuesta',
    confirm.status === 200 && String(confirm.body.source).includes('confirm_apply'),
    `source=${confirm.body.source}`,
  );
  if (confirm.body.action) {
    rows = applyAction(rows, confirm.body.action as BudgetTableAction);
  } else if (Array.isArray(confirm.body.actions)) {
    for (const action of confirm.body.actions as BudgetTableAction[]) {
      rows = applyAction(rows, action);
    }
  }

  const gymRow = rows.find((r) => /gimnasio/i.test(r.category));
  record(
    'fila gimnasio aplicada',
    Boolean(gymRow && gymRow.amount === 35000),
    gymRow ? `${gymRow.category} $${gymRow.amount}` : 'no encontrada',
  );

  rows = [{ id: 'expense_food', category: 'Alimentación', type: 'expense', amount: 0 }];
  chatAnswers = [];
  const wInit = await chat('init', { budgetRows: rows });
  const wq1 = String(wInit.body.next_question ?? '');
  const wr1 = await chat('reply', {
    answer: 'transporte',
    question: wq1,
    assistantFocusRowId: 'expense_food',
    budgetRows: rows,
  });
  record(
    'wizard tipo movimiento',
    String(wr1.body.source) === 'deterministic_movement_type_update' && Boolean(wr1.body.requires_confirmation),
    `source=${wr1.body.source}`,
  );

  const meta = await chat('reply', {
    answer: 'si, como cual podria agregar?',
    question: initQuestion,
    budgetRows: baseRows(),
  });
  record(
    'meta-pregunta sin fila basura',
    meta.status === 200 && meta.body.source === 'deterministic_help_add' && !meta.body.pending_confirmation,
    `source=${meta.body.source}`,
  );

  const delAsk = await chat('reply', {
    answer: 'borra otros gastos',
    question: String(wr1.body.next_question ?? ''),
    budgetRows: [
      { id: 'income_salary', category: 'Sueldo', type: 'income', amount: 850000 },
      { id: 'expense_other', category: 'Otros gastos', type: 'expense', amount: 50000 },
    ],
  });
  record(
    'delete pide confirmación',
    Boolean(delAsk.body.requires_confirmation) &&
      (delAsk.body.source === 'deterministic_delete_confirm' ||
        String(
          (delAsk.body.pending_confirmation as { actions?: Array<{ kind?: string }> } | null)?.actions?.[0]
            ?.kind ?? '',
        ) === 'delete'),
    `source=${delAsk.body.source}`,
  );

  const passed = results.filter((r) => r.pass).length;
  const total = results.length;
  console.log(`\n── Resumen ──\nCasos: ${passed}/${total} OK`);
  if (passed < total) {
    results.filter((r) => !r.pass).forEach((r) => console.log(`  - ${r.name}: ${r.detail}`));
    process.exit(1);
  }
}

function baseRows(): BudgetRow[] {
  return [
    { id: 'income_salary', category: 'Sueldo líquido', type: 'income', amount: 0 },
    { id: 'expense_rent', category: 'Arriendo / vivienda', type: 'expense', amount: 0 },
    { id: 'expense_food', category: 'Alimentación', type: 'expense', amount: 0 },
  ];
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
