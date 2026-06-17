import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { createApprovalToken } from '../services/approval.service';

import { runBudgetChatAgent, buildBudgetAgentUnavailableResult } from '../services/budget-chat-agent.service';

vi.mock('../services/budget-chat-agent.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/budget-chat-agent.service')>();
  return {
    ...actual,
    runBudgetChatAgent: vi.fn(),
  };
});

let dataDir: string;

beforeAll(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'financial-agent-budget-flow-'));
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

describe('budget-chat assistant flow smoke', () => {
  async function createAuthedAgent() {
    const { createApp } = await import('../app');
    const app = createApp();
    const agent = request.agent(app);
    const email = `budget-flow-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`;
    const reg = await agent.post('/auth/register').send({ name: 'Flow Tester', email, password: 'Secret123' });
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

  beforeEach(() => {
    process.env.BUDGET_CHAT_AGENT_TEST_MOCKS = 'true';
    vi.mocked(runBudgetChatAgent).mockReset();
    vi.mocked(runBudgetChatAgent).mockImplementation((input) =>
      Promise.resolve(buildBudgetAgentUnavailableResult(input.mode)),
    );
  });

  it('runs init → agent update → delete confirm → reject → confirm apply', async () => {
    const { agent, csrfToken } = await createAuthedAgent();
    const headers = { 'x-csrf-token': csrfToken };

    const init = await agent.post('/api/budget-chat').set(headers).send({
      intent: 'init',
      budgetRows: baseRows(),
      chatAnswers: [],
      products: [],
    });
    expect(init.status).toBe(200);
    expect(init.body.source).toBe('deterministic_init');

    vi.mocked(runBudgetChatAgent).mockResolvedValueOnce({
      assistant_reply: 'Actualizo sueldo.',
      next_question: '¿Qué más quieres hacer con la tabla?',
      focus_row_id: 'income_salary',
      actions: [{ kind: 'update', id: 'income_salary', category: 'Sueldo líquido', type: 'income', amount: 850000 }],
      requires_confirmation: false,
      pending_summary: null,
      source: 'budget_agent',
    });

    const income = await agent.post('/api/budget-chat').set(headers).send({
      intent: 'reply',
      answer: 'mi sueldo es 850 mil',
      question: init.body.next_question,
      assistantFocusRowId: 'income_salary',
      budgetRows: baseRows(),
      chatAnswers: [],
    });
    expect(income.status).toBe(200);
    expect(income.body.requires_confirmation).toBe(true);
    expect(income.body.pending_confirmation?.actions?.[0]?.amount).toBe(850000);

    vi.mocked(runBudgetChatAgent).mockResolvedValueOnce({
      assistant_reply: 'Puedo borrar otros gastos.',
      next_question: '¿Confirmas?',
      focus_row_id: 'expense_other',
      actions: [{ kind: 'delete', id: 'expense_other' }],
      requires_confirmation: true,
      pending_summary: 'Eliminar Otros gastos',
      source: 'budget_agent',
    });

    const deleteAsk = await agent.post('/api/budget-chat').set(headers).send({
      intent: 'reply',
      answer: 'borra otros gastos',
      question: income.body.next_question,
      budgetRows: baseRows(),
    });
    expect(deleteAsk.body.requires_confirmation).toBe(true);
    expect(deleteAsk.body.source).toBe('budget_agent');
    expect(deleteAsk.body.pending_confirmation?.actions?.[0]?.kind).toBe('delete');

    const reject = await agent.post('/api/budget-chat').set(headers).send({
      intent: 'reply',
      answer: 'no',
      question: deleteAsk.body.next_question,
      budgetRows: baseRows(),
      pendingConfirmation: deleteAsk.body.pending_confirmation,
    });
    expect(reject.body.source).toBe('budget_agent_confirm_reject');

    const confirm = await agent.post('/api/budget-chat').set(headers).send({
      intent: 'reply',
      answer: 'sí',
      question: deleteAsk.body.next_question,
      budgetRows: baseRows(),
      pendingConfirmation: deleteAsk.body.pending_confirmation,
    });
    expect(confirm.body.source).toBe('budget_agent_confirm_apply');
    expect(confirm.body.action?.kind).toBe('delete');
  });
});
