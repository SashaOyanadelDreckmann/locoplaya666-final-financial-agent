/**
 * Verifica que cada respuesta del asistente produzca acciones que,
 * al aplicarse con mergeBudgetActionIntoRow (misma lógica del modal),
 * modifican exactamente las celdas esperadas de la tabla.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { createApprovalToken } from '../services/approval.service';
import {
  mergeBudgetActionIntoRow,
  type BudgetRow,
  type BudgetTableAction,
} from '@financial-agent/shared';

let dataDir: string;

beforeAll(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'financial-agent-budget-table-sync-'));
  process.env.DATA_DIR = dataDir;
  process.env.NODE_ENV = 'test';
  process.env.WEB_ORIGIN = 'http://localhost:3001';
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.ANTHROPIC_API_KEY = 'test-key';
  process.env.LOG_LEVEL = 'error';
  process.env.APPROVAL_LINK_SECRET = 'test-approval-link-secret-abcdefghijklmnopqrstuvwxyz';
  process.env.PASSWORD_RESET_LINK_SECRET = 'test-password-reset-link-secret-abcdefghijklmnopqrstuvwxyz';
  process.env.APPROVAL_LINK_BASE_URL = 'http://localhost:3001';
  process.env.APPROVAL_ADMIN_EMAIL = 'sasha.oyanadel@ug.uchile.cl';
  process.env.APPROVAL_LINK_TTL_HOURS = '24';
});

afterAll(() => {
  try {
    fs.rmSync(dataDir, { recursive: true, force: true });
  } catch {}
});

function applyAction(rows: BudgetRow[], action: BudgetTableAction): BudgetRow[] {
  const existing = rows.find((row) => row.id === action.id) ?? null;
  if (action.kind === 'delete') {
    return rows.filter((row) => row.id !== action.id);
  }
  const merged = mergeBudgetActionIntoRow(existing, action);
  if (!merged) return rows;
  if (existing) {
    return rows.map((row) => (row.id === merged.id ? merged : row));
  }
  return [...rows, merged];
}

describe('budget-chat table sync', () => {
  async function createAuthedAgent() {
    const { createApp } = await import('../app');
    const app = createApp();
    const agent = request.agent(app);
    const email = `budget-sync-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`;
    const reg = await agent.post('/auth/register').send({
      name: 'Sync Tester',
      email,
      password: 'Secret123',
    });
    expect(reg.status).toBe(200);
    const userId = String(reg.body?.data?.user?.id ?? '');
    const token = createApprovalToken({
      userId,
      adminEmail: 'sasha.oyanadel@ug.uchile.cl',
      action: 'approve',
    });
    const approved = await request(app).get(`/auth/approve?token=${encodeURIComponent(token)}`);
    expect(approved.status).toBe(200);
    const loginRes = await agent.post('/auth/login').send({
      email,
      password: 'Secret123',
    });
    expect(loginRes.status).toBe(200);
    const sessionRes = await agent.get('/api/session');
    expect(sessionRes.status).toBe(200);
    return { agent, csrfToken: String(sessionRes.headers['x-csrf-token'] ?? '') };
  }

  const foodRow = (): BudgetRow[] => [
    { id: 'expense_food', category: 'Alimentación', type: 'expense', amount: 0 },
  ];

  it('writes movementType, name, amount, cadence and payment to the exact columns in order', async () => {
    const { agent, csrfToken } = await createAuthedAgent();
    const headers = { 'x-csrf-token': csrfToken };
    let rows = foodRow();
    let chatAnswers: Array<{ q: string; a: string }> = [];

    const init = await agent.post('/api/budget-chat').set(headers).send({
      intent: 'init',
      budgetRows: rows,
      chatAnswers,
    });
    expect(init.status).toBe(200);
    expect(init.body.focus_row_id).toBe('expense_food');
    const q1 = String(init.body.next_question);
    expect(q1).toMatch(/tipo de movimiento|categoría/i);

    const r1 = await agent.post('/api/budget-chat').set(headers).send({
      intent: 'reply',
      answer: 'transporte',
      question: q1,
      assistantFocusRowId: 'expense_food',
      budgetRows: rows,
      chatAnswers,
    });
    expect(r1.body.source).toBe('deterministic_movement_type_update');
    expect(r1.body.action?.movement_type).toBe('transport');
    rows = applyAction(rows, r1.body.action as BudgetTableAction);
    expect(rows.find((r) => r.id === 'expense_food')?.movementType).toBe('transport');
    expect(rows.find((r) => r.id === 'expense_food')?.amount).toBe(0);
    expect(rows.find((r) => r.id === 'expense_food')?.category).toBe('Alimentación');

    chatAnswers = [{ q: q1, a: 'transporte' }];
    const q2 = String(r1.body.next_question);
    expect(q2).toMatch(/llamar este movimiento/i);

    const r2 = await agent.post('/api/budget-chat').set(headers).send({
      intent: 'reply',
      answer: 'Supermercado',
      question: q2,
      assistantFocusRowId: 'expense_food',
      budgetRows: rows,
      chatAnswers,
    });
    expect(r2.body.source).toBe('deterministic_category_update');
    expect(r2.body.action?.category).toBe('Supermercado');
    rows = applyAction(rows, r2.body.action as BudgetTableAction);
    expect(rows.find((r) => r.id === 'expense_food')?.category).toBe('Supermercado');
    expect(rows.find((r) => r.id === 'expense_food')?.movementType).toBe('transport');

    chatAnswers = [...chatAnswers, { q: q2, a: 'Supermercado' }];
    const q3 = String(r2.body.next_question);
    expect(q3).toMatch(/monto mensual/i);

    const r3 = await agent.post('/api/budget-chat').set(headers).send({
      intent: 'reply',
      answer: '180000',
      question: q3,
      assistantFocusRowId: 'expense_food',
      budgetRows: rows,
      chatAnswers,
    });
    expect(r3.body.source).toBe('deterministic_update');
    expect(r3.body.action?.amount).toBe(180000);
    rows = applyAction(rows, r3.body.action as BudgetTableAction);
    const food = rows.find((r) => r.id === 'expense_food')!;
    expect(food.amount).toBe(180000);
    expect(food.category).toBe('Supermercado');
    expect(food.movementType).toBe('transport');

    chatAnswers = [...chatAnswers, { q: q3, a: '180000' }];
    const q4 = String(r3.body.next_question);
    expect(q4).toMatch(/fijo|variable/i);

    const r4 = await agent.post('/api/budget-chat').set(headers).send({
      intent: 'reply',
      answer: 'fijo, pago con débito',
      question: q4,
      assistantFocusRowId: 'expense_food',
      budgetRows: rows,
      chatAnswers,
    });
    expect(r4.body.source).toBe('deterministic_field_update');
    expect(r4.body.action?.cadence).toBe('fixed');
    expect(r4.body.action?.payment_method).toBe('debit');
    rows = applyAction(rows, r4.body.action as BudgetTableAction);
    const finalRow = rows.find((r) => r.id === 'expense_food')!;
    expect(finalRow).toMatchObject({
      category: 'Supermercado',
      movementType: 'transport',
      amount: 180000,
      cadence: 'fixed',
      paymentMethod: 'debit',
    });
  }, 30000);

  it('rejects bare amount while movement type is still pending', async () => {
    const { agent, csrfToken } = await createAuthedAgent();
    const rows = foodRow();
    const init = await agent.post('/api/budget-chat').set('x-csrf-token', csrfToken).send({
      intent: 'init',
      budgetRows: rows,
      chatAnswers: [],
    });
    const res = await agent.post('/api/budget-chat').set('x-csrf-token', csrfToken).send({
      intent: 'reply',
      answer: '900000',
      question: init.body.next_question,
      assistantFocusRowId: init.body.focus_row_id,
      budgetRows: rows,
      chatAnswers: [],
    });
    expect(res.status).toBe(200);
    expect(res.body.source).not.toBe('deterministic_update');
    expect(res.body.action?.amount).not.toBe(900000);
  }, 15000);
});
