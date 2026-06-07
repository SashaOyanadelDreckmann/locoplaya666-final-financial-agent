import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { createApprovalToken } from '../services/approval.service';

/**
 * Smoke de flujo conversacional completo del asistente de presupuesto.
 * Simula lo que hace el modal: init → respuestas → confirmación → apply.
 */
let dataDir: string;

beforeAll(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'financial-agent-budget-flow-'));
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

describe('budget-chat assistant flow smoke', () => {
  async function createAuthedAgent() {
    const { createApp } = await import('../app');
    const app = createApp();
    const agent = request.agent(app);
    const email = `budget-flow-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`;
    const reg = await agent.post('/auth/register').send({
      name: 'Flow Tester',
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
    await request(app).get(`/auth/approve?token=${encodeURIComponent(token)}`);
    await agent.post('/auth/login').send({ email, password: 'Secret123' });
    const sessionRes = await agent.get('/api/session');
    return { agent, csrfToken: String(sessionRes.headers['x-csrf-token'] ?? '') };
  }

  const baseRows = () => [
    { id: 'income_salary', category: 'Sueldo líquido', type: 'income', amount: 0 },
    { id: 'expense_rent', category: 'Arriendo / vivienda', type: 'expense', amount: 0 },
    { id: 'expense_food', category: 'Alimentación', type: 'expense', amount: 0 },
    { id: 'expense_other', category: 'Otros gastos', type: 'expense', amount: 50000 },
  ];

  it('runs init → income update → delete confirm → reject → confirm apply', async () => {
    const { agent, csrfToken } = await createAuthedAgent();
    const headers = { 'x-csrf-token': csrfToken };

    const init = await agent.post('/api/budget-chat').set(headers).send({
      intent: 'init',
      budgetRows: baseRows(),
      chatAnswers: [],
      products: [],
    });
    expect(init.status).toBe(200);
    expect(init.body.ok).toBe(true);
    expect(String(init.body.next_question)).toMatch(/\?/);
    expect(init.body.requires_confirmation).toBeFalsy();

    const income = await agent.post('/api/budget-chat').set(headers).send({
      intent: 'reply',
      answer: '900000',
      question: init.body.next_question,
      assistantFocusRowId: init.body.focus_row_id,
      budgetRows: baseRows(),
      chatAnswers: [{ q: init.body.next_question, a: '900000' }],
    });
    expect(income.status).toBe(200);
    expect(income.body.action?.id).toBe('income_salary');
    expect(income.body.action?.amount).toBe(900000);
    expect(income.body.requires_confirmation).toBeFalsy();

    const rowsAfterIncome = baseRows().map((row) =>
      row.id === 'income_salary' ? { ...row, amount: 900000 } : row,
    );

    const deleteAsk = await agent.post('/api/budget-chat').set(headers).send({
      intent: 'reply',
      answer: 'elimina otros gastos',
      question: income.body.next_question,
      budgetRows: rowsAfterIncome,
      chatAnswers: [
        { q: init.body.next_question, a: '900000' },
        { q: income.body.next_question, a: 'elimina otros gastos' },
      ],
    });
    expect(deleteAsk.status).toBe(200);
    expect(deleteAsk.body.source).toBe('deterministic_delete_confirm');
    expect(deleteAsk.body.requires_confirmation).toBe(true);
    expect(deleteAsk.body.actions).toEqual([]);
    expect(deleteAsk.body.pending_confirmation?.actions?.[0]?.kind).toBe('delete');

    const reject = await agent.post('/api/budget-chat').set(headers).send({
      intent: 'reply',
      answer: 'no',
      question: deleteAsk.body.next_question,
      budgetRows: rowsAfterIncome,
      pendingConfirmation: deleteAsk.body.pending_confirmation,
      chatAnswers: [
        { q: init.body.next_question, a: '900000' },
        { q: income.body.next_question, a: 'elimina otros gastos' },
        { q: deleteAsk.body.next_question, a: 'no' },
      ],
    });
    expect(reject.status).toBe(200);
    expect(reject.body.source).toBe('deterministic_confirm_reject');
    expect(reject.body.action).toBeNull();
    expect(reject.body.actions).toEqual([]);

    const deleteAsk2 = await agent.post('/api/budget-chat').set(headers).send({
      intent: 'reply',
      answer: 'borrar otros gastos',
      question: reject.body.next_question,
      budgetRows: rowsAfterIncome,
      chatAnswers: [],
    });
    expect(deleteAsk2.body.requires_confirmation).toBe(true);

    const confirm = await agent.post('/api/budget-chat').set(headers).send({
      intent: 'reply',
      answer: 'sí',
      question: deleteAsk2.body.next_question,
      budgetRows: rowsAfterIncome,
      pendingConfirmation: deleteAsk2.body.pending_confirmation,
    });
    expect(confirm.status).toBe(200);
    expect(confirm.body.source).toBe('deterministic_confirm_apply');
    expect(confirm.body.action?.kind).toBe('delete');
    expect(confirm.body.action?.id).toBe('expense_other');
    expect(confirm.body.requires_confirmation).toBeFalsy();
  }, 30000);

  it('returns schema-safe actions without legacy note/product/institution fields', async () => {
    const { agent, csrfToken } = await createAuthedAgent();
    const res = await agent.post('/api/budget-chat').set('x-csrf-token', csrfToken).send({
      intent: 'reply',
      answer: '450000',
      question: '¿Cuánto pagas al mes en vivienda o arriendo?',
      assistantFocusRowId: 'expense_rent',
      budgetRows: baseRows(),
    });

    expect(res.status).toBe(200);
    const action = res.body.action ?? {};
    expect(action).toMatchObject({
      kind: 'update',
      id: 'expense_rent',
      amount: 450000,
    });
    expect(action.note).toBeUndefined();
    expect(action.product).toBeUndefined();
    expect(action.institution).toBeUndefined();
    expect(['fixed', 'variable', undefined]).toContain(action.cadence);
  }, 15000);
});
