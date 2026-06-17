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
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'financial-agent-budget-chat-'));
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

describe('budget-chat routes (agent-first)', () => {
  async function createAuthedAgent() {
    const { createApp } = await import('../app');
    const app = createApp();
    const agent = request.agent(app);
    const email = `budget-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`;
    const reg = await agent.post('/auth/register').send({
      name: 'Budget Tester',
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

  beforeEach(() => {
    process.env.BUDGET_CHAT_AGENT_TEST_MOCKS = 'true';
    vi.mocked(runBudgetChatAgent).mockReset();
    vi.mocked(runBudgetChatAgent).mockImplementation((input) =>
      Promise.resolve(buildBudgetAgentUnavailableResult(input.mode)),
    );
  });

  it('returns agent init when LLM responds', async () => {
    runBudgetChatAgent.mockResolvedValueOnce({
      assistant_reply: 'Hola, tu tabla tiene 2 filas.',
      next_question: '¿Qué quieres cambiar primero?',
      focus_row_id: 'income_salary',
      actions: [],
      requires_confirmation: false,
      pending_summary: null,
      source: 'budget_agent_init',
    });

    const { agent, csrfToken } = await createAuthedAgent();
    const res = await agent.post('/api/budget-chat').set('x-csrf-token', csrfToken).send({
      intent: 'init',
      budgetRows: [
        { id: 'income_salary', category: 'Ingreso principal', type: 'income', amount: 0 },
        { id: 'expense_rent', category: 'Gasto principal', type: 'expense', amount: 0 },
        { id: 'expense_other', category: 'Otro gasto', type: 'expense', amount: 0 },
      ],
      chatAnswers: [],
    });

    expect(res.status).toBe(200);
    expect(res.body.source).toBe('budget_agent_init');
    expect(String(res.body.assistant_reply)).toMatch(/Hola, tu tabla tiene 2 filas/i);
    expect(String(res.body.next_question)).toMatch(/\?/);
    expect(runBudgetChatAgent).toHaveBeenCalledWith(expect.objectContaining({ mode: 'init' }));
  });

  it('requests confirmation for an agent amount update on explicit reply', async () => {
    runBudgetChatAgent.mockResolvedValueOnce({
      assistant_reply: 'Actualizo alimentación.',
      next_question: '¿Confirmas el cambio?',
      focus_row_id: 'expense_food',
      actions: [{ kind: 'update', id: 'expense_food', category: 'Alimentación', type: 'expense', amount: 200000 }],
      requires_confirmation: true,
      pending_summary: 'Actualizar Alimentación a $200.000.',
      source: 'budget_agent',
    });

    const { agent, csrfToken } = await createAuthedAgent();
    const res = await agent.post('/api/budget-chat').set('x-csrf-token', csrfToken).send({
      intent: 'reply',
      answer: 'en comida gasto 200 mil',
      question: '¿Qué quieres cambiar?',
      budgetRows: [
        { id: 'income_salary', category: 'Sueldo líquido', type: 'income', amount: 900000 },
        { id: 'expense_food', category: 'Alimentación', type: 'expense', amount: 0 },
      ],
    });

    expect(res.status).toBe(200);
    expect(res.body.source).toBe('budget_agent');
    expect(res.body.requires_confirmation).toBe(true);
    expect(res.body.pending_confirmation?.actions?.[0]?.amount).toBe(200000);
    expect(res.body.action).toBeNull();
    expect(runBudgetChatAgent).toHaveBeenCalled();
  });

  it('requests confirmation for bulk agent actions', async () => {
    runBudgetChatAgent.mockResolvedValueOnce({
      assistant_reply: 'Puedo agregar esas filas.',
      next_question: '¿Confirmas que las agregue?',
      focus_row_id: 'expense-custom-gym',
      actions: [
        { kind: 'add', id: 'expense-custom-gym', category: 'Gym', type: 'expense' },
        { kind: 'add', id: 'expense-custom-streaming', category: 'Streaming', type: 'expense' },
        { kind: 'add', id: 'expense-custom-pets', category: 'Mascotas', type: 'expense' },
      ],
      requires_confirmation: true,
      pending_summary: 'Agregar gym, streaming y mascotas.',
      source: 'budget_agent',
    });

    const { agent, csrfToken } = await createAuthedAgent();
    const res = await agent.post('/api/budget-chat').set('x-csrf-token', csrfToken).send({
      intent: 'reply',
      answer: 'agrega gym, streaming y mascotas',
      question: '¿Qué quieres cambiar?',
      budgetRows: [{ id: 'income_salary', category: 'Sueldo', type: 'income', amount: 900000 }],
    });

    expect(res.status).toBe(200);
    expect(res.body.requires_confirmation).toBe(true);
    expect(res.body.pending_confirmation?.actions?.length).toBe(3);
    expect(res.body.action).toBeNull();
  });

  it('applies pending actions after confirmation', async () => {
    const { agent, csrfToken } = await createAuthedAgent();
    const budgetRows = [
      { id: 'income_salary', category: 'Sueldo', type: 'income', amount: 900000 },
      { id: 'expense_food', category: 'Alimentación', type: 'expense', amount: 200000 },
    ];
    const res = await agent.post('/api/budget-chat').set('x-csrf-token', csrfToken).send({
      intent: 'reply',
      answer: 'sí',
      question: '¿Confirmas?',
      budgetRows,
      pendingConfirmation: {
        summary: 'Eliminar Alimentación',
        actions: [{ kind: 'delete', id: 'expense_food' }],
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.source).toBe('budget_agent_confirm_apply');
    expect(res.body.action?.kind).toBe('delete');
    expect(runBudgetChatAgent).not.toHaveBeenCalled();
  });

  it('applies dependent pending batches after confirmation in one turn', async () => {
    const { agent, csrfToken } = await createAuthedAgent();
    const budgetRows = [{ id: 'income_salary', category: 'Sueldo', type: 'income', amount: 900000 }];
    const res = await agent.post('/api/budget-chat').set('x-csrf-token', csrfToken).send({
      intent: 'reply',
      answer: 'sí',
      question: '¿Confirmas?',
      budgetRows,
      pendingConfirmation: {
        summary: 'Agregar gym con monto',
        actions: [
          { kind: 'add', id: 'expense-custom-gym', category: 'Gym', type: 'expense', amount: 0 },
          { kind: 'update', id: 'expense-custom-gym', category: 'Gym', type: 'expense', amount: 30000 },
        ],
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.source).toBe('budget_agent_confirm_apply');
    expect(res.body.actions).toHaveLength(2);
    expect(res.body.actions?.[1]?.amount).toBe(30000);
    expect(runBudgetChatAgent).not.toHaveBeenCalled();
  });

  it('prefers nextQuestion over assistant reply in question field', async () => {
    runBudgetChatAgent.mockResolvedValueOnce({
      assistant_reply: 'Puedo agregar esas filas.',
      next_question: '¿Qué más quieres hacer con la tabla?',
      focus_row_id: 'expense-custom-gym',
      actions: [
        { kind: 'add', id: 'expense-custom-gym', category: 'Gym', type: 'expense', amount: 30000 },
        { kind: 'add', id: 'expense-custom-streaming', category: 'Streaming', type: 'expense', amount: 15000 },
      ],
      requires_confirmation: true,
      pending_summary: 'Agregar gym y streaming.',
      source: 'budget_agent',
    });

    const { agent, csrfToken } = await createAuthedAgent();
    const res = await agent.post('/api/budget-chat').set('x-csrf-token', csrfToken).send({
      intent: 'reply',
      answer: 'agrega gym 30k y streaming 15k',
      question: 'Listo, actualicé alimentación.',
      nextQuestion: '¿Cuánto destinas a alimentación?',
      budgetRows: [
        { id: 'income_salary', category: 'Sueldo líquido', type: 'income', amount: 900000 },
        { id: 'expense_food', category: 'Alimentación', type: 'expense', amount: 0 },
      ],
      assistantFocusRowId: 'expense_food',
    });

    expect(res.status).toBe(200);
    expect(runBudgetChatAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        currentQuestion: '¿Cuánto destinas a alimentación?',
        userAnswer: 'agrega gym 30k y streaming 15k',
      }),
    );
  });

  it('falls back to deterministic amount update only when the agent is unavailable', async () => {
    runBudgetChatAgent.mockResolvedValueOnce({
      assistant_reply: 'No pude procesar tu mensaje ahora. Intenta de nuevo en unos segundos.',
      next_question: '¿Quieres reintentar con tu pedido sobre la tabla?',
      focus_row_id: null,
      actions: [],
      requires_confirmation: false,
      pending_summary: null,
      source: 'budget_agent_unavailable',
    });

    const { agent, csrfToken } = await createAuthedAgent();
    const res = await agent.post('/api/budget-chat').set('x-csrf-token', csrfToken).send({
      intent: 'reply',
      answer: 'en comida gasto 200 mil',
      question: '¿Cuánto destinas a alimentación?',
      nextQuestion: '¿Cuánto destinas a alimentación?',
      budgetRows: [
        { id: 'income_salary', category: 'Sueldo líquido', type: 'income', amount: 900000 },
        { id: 'expense_food', category: 'Alimentación', type: 'expense', amount: 0 },
      ],
      assistantFocusRowId: 'expense_food',
    });

    expect(res.status).toBe(200);
    expect(res.body.source).toBe('deterministic_update');
    expect(res.body.requires_confirmation).toBe(true);
    expect(res.body.pending_confirmation?.actions?.[0]?.amount).toBe(200000);
    expect(res.body.action).toBeNull();
  });
});
