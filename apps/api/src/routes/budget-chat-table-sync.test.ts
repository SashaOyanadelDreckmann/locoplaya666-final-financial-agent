/**
 * Verifica que las acciones del agente, al aplicarse con mergeBudgetActionIntoRow
 * (misma lógica del modal), modifican las celdas esperadas de la tabla.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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

import { runBudgetChatAgent } from '../services/budget-chat-agent.service';

vi.mock('../services/budget-chat-agent.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/budget-chat-agent.service')>();
  return {
    ...actual,
    runBudgetChatAgent: vi.fn(),
  };
});

let dataDir: string;

beforeAll(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'financial-agent-budget-table-sync-'));
  process.env.DATA_DIR = dataDir;
  process.env.NODE_ENV = 'test';
  process.env.WEB_ORIGIN = 'http://localhost:3001';
  process.env.OPENAI_API_KEY = 'test-key';
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
    const reg = await agent.post('/auth/register').send({ name: 'Sync Tester', email, password: 'Secret123' });
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

  const foodRow = (): BudgetRow[] => [
    { id: 'expense_food', category: 'Alimentación', type: 'expense', amount: 0 },
  ];

  beforeEach(() => {
    runBudgetChatAgent.mockReset();
  });

  it('syncs agent actions into movementType, name, amount and metadata columns', async () => {
    const { agent, csrfToken } = await createAuthedAgent();
    const headers = { 'x-csrf-token': csrfToken };
    let rows = foodRow();

    runBudgetChatAgent
      .mockResolvedValueOnce({
        assistant_reply: 'Hola.',
        next_question: '¿Qué cambiamos?',
        focus_row_id: 'expense_food',
        actions: [],
        requires_confirmation: false,
        pending_summary: null,
        source: 'budget_agent_init',
      })
      .mockResolvedValueOnce({
        assistant_reply: 'Tipo transporte.',
        next_question: '¿Nombre y monto?',
        focus_row_id: 'expense_food',
        actions: [{ kind: 'update', id: 'expense_food', category: 'Alimentación', type: 'expense', amount: 0, movement_type: 'transport' }],
        requires_confirmation: false,
        pending_summary: null,
        source: 'budget_agent',
      })
      .mockResolvedValueOnce({
        assistant_reply: 'Renombro y monto.',
        next_question: '¿Recurrencia?',
        focus_row_id: 'expense_food',
        actions: [{ kind: 'update', id: 'expense_food', category: 'Supermercado', type: 'expense', amount: 180000, movement_type: 'transport' }],
        requires_confirmation: false,
        pending_summary: null,
        source: 'budget_agent',
      })
      .mockResolvedValueOnce({
        assistant_reply: 'Metadatos listos.',
        next_question: '¿Qué más?',
        focus_row_id: 'expense_food',
        actions: [{ kind: 'update', id: 'expense_food', category: 'Supermercado', type: 'expense', amount: 180000, movement_type: 'transport', cadence: 'fixed', payment_method: 'debit' }],
        requires_confirmation: false,
        pending_summary: null,
        source: 'budget_agent',
      });

    await agent.post('/api/budget-chat').set(headers).send({ intent: 'init', budgetRows: rows, chatAnswers: [] });

    const r1 = await agent.post('/api/budget-chat').set(headers).send({
      intent: 'reply',
      answer: 'es transporte',
      question: '¿Qué cambiamos?',
      budgetRows: rows,
    });
    rows = applyAction(rows, r1.body.action as BudgetTableAction);
    expect(rows[0]?.movementType).toBe('transport');

    const r2 = await agent.post('/api/budget-chat').set(headers).send({
      intent: 'reply',
      answer: 'supermercado 180 mil',
      question: r1.body.next_question,
      budgetRows: rows,
    });
    rows = applyAction(rows, r2.body.action as BudgetTableAction);
    expect(rows[0]?.category).toBe('Supermercado');
    expect(rows[0]?.amount).toBe(180000);

    const r3 = await agent.post('/api/budget-chat').set(headers).send({
      intent: 'reply',
      answer: 'fijo con débito',
      question: r2.body.next_question,
      budgetRows: rows,
    });
    rows = applyAction(rows, r3.body.action as BudgetTableAction);
    expect(rows[0]?.cadence).toBe('fixed');
    expect(rows[0]?.paymentMethod).toBe('debit');
  });

  it('syncs bulk add actions from agent into new rows', async () => {
    const { agent, csrfToken } = await createAuthedAgent();
    const headers = { 'x-csrf-token': csrfToken };
    const rows: BudgetRow[] = [{ id: 'income_salary', category: 'Sueldo', type: 'income', amount: 900000 }];

    runBudgetChatAgent.mockResolvedValueOnce({
      assistant_reply: 'Agrego 3 filas.',
      next_question: '¿Les pongo montos?',
      focus_row_id: 'expense-custom-gym',
      actions: [
        { kind: 'add', id: 'expense-custom-gym', category: 'Gym', type: 'expense', amount: 30000 },
        { kind: 'add', id: 'expense-custom-streaming', category: 'Streaming', type: 'expense', amount: 15000 },
        { kind: 'add', id: 'expense-custom-pets', category: 'Mascotas', type: 'expense', amount: 25000 },
      ],
      requires_confirmation: false,
      pending_summary: null,
      source: 'budget_agent',
    });

    const res = await agent.post('/api/budget-chat').set(headers).send({
      intent: 'reply',
      answer: 'agrega gym 30k, streaming 15k y mascotas 25k',
      question: '¿Qué quieres hacer?',
      budgetRows: rows,
    });

    expect(res.body.actions?.length).toBe(3);
    let nextRows = rows;
    for (const action of res.body.actions as BudgetTableAction[]) {
      nextRows = applyAction(nextRows, action);
    }
    expect(nextRows).toHaveLength(4);
    expect(nextRows.find((row) => row.id === 'expense-custom-gym')?.amount).toBe(30000);
  });
});
