import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { replaceIntakeEnvelopeForDev } from '../services/user.service';
import { createApprovalToken } from '../services/approval.service';

const runCoreAgentMock = vi.fn();

vi.mock('../agents/core.agent/core-agent-orchestrator', () => ({
  runCoreAgent: (...args: unknown[]) => runCoreAgentMock(...args),
}));

let dataDir: string;

beforeAll(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'financial-agent-budget-injection-'));
  process.env.DATA_DIR = dataDir;
  process.env.NODE_ENV = 'test';
  process.env.WEB_ORIGIN = 'http://localhost:3001';
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.ANTHROPIC_API_KEY = 'test-key';
  process.env.LOG_LEVEL = 'error';
});

afterAll(() => {
  try {
    fs.rmSync(dataDir, { recursive: true, force: true });
  } catch {}
});

async function createAuthedAgent() {
  const { createApp } = await import('../app');
  const app = createApp();
  const agent = request.agent(app);
  const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const email = `budget-${suffix}@example.com`;

  const registerRes = await agent.post('/auth/register').send({
    name: 'Budget Injection Test',
    email,
    password: 'Secret123',
  });
  expect(registerRes.status).toBe(200);
  const userId = String(registerRes.body?.data?.user?.id ?? '');
  const token = createApprovalToken({
    userId,
    adminEmail: 'sasha.oyanadel@ug.uchile.cl',
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
  return {
    agent,
    userId,
    csrfToken: String(sessionRes.headers['x-csrf-token'] ?? ''),
  };
}

describe('/api/agent budget_summary → injected_budget', () => {
  it('hydrates context.injected_budget from ui_state.budget_summary before runCoreAgent', async () => {
    runCoreAgentMock.mockReset();
    runCoreAgentMock.mockResolvedValue({
      message: 'ok',
      mode: 'information',
      tool_calls: [],
      agent_blocks: [],
      artifacts: [],
      citations: [],
      compliance: {
        mode: 'information',
        no_auto_execution: true,
        includes_recommendation: false,
        includes_simulation: false,
        includes_regulation: false,
        missing_information: [],
        disclaimers_shown: [],
        risk_score: 0,
        blocked: { is_blocked: false },
      },
      state_updates: {},
      suggested_replies: [],
      budget_updates: [],
      knowledge_score: 0,
      knowledge_event_detected: false,
      meta: {},
    });

    const { agent, userId, csrfToken } = await createAuthedAgent();
    const intakeOk = await replaceIntakeEnvelopeForDev(userId, {
      intake: { profession: 'Ingeniera' },
      intakeContext: { financialLiteracy: 'high' },
    });
    expect(intakeOk).toBe(true);

    const res = await agent
      .post('/api/agent')
      .set('x-csrf-token', csrfToken)
      .send({
        user_message: 'Dame una lectura rápida de mi presupuesto',
        history: [],
        context: {
          injected_budget: { income: 1, expenses: 1, balance: 0 },
        },
        ui_state: {
          active_chat: { id: 'chat-1' },
          budget_summary: {
            income: '3100000',
            expenses: 1900000,
            balance: null,
          },
        },
      });

    expect(res.status).toBe(200);
    expect(runCoreAgentMock).toHaveBeenCalledTimes(1);
    const input = runCoreAgentMock.mock.calls[0]?.[0] as {
      context?: { injected_budget?: { income: number; expenses: number; balance: number } };
    };

    expect(input?.context?.injected_budget).toEqual({
      income: 3100000,
      expenses: 1900000,
      balance: 1200000,
    });
  }, 15000);

  it('rehydrates persisted products context so the agent sees parsed cartolas without UI payload', async () => {
    runCoreAgentMock.mockReset();
    runCoreAgentMock.mockResolvedValue({
      message: 'ok',
      mode: 'information',
      tool_calls: [],
      agent_blocks: [],
      artifacts: [],
      citations: [],
      compliance: {
        mode: 'information',
        no_auto_execution: true,
        includes_recommendation: false,
        includes_simulation: false,
        includes_regulation: false,
        missing_information: [],
        disclaimers_shown: [],
        risk_score: 0,
        blocked: { is_blocked: false },
      },
      state_updates: {},
      suggested_replies: [],
      budget_updates: [],
      knowledge_score: 0,
      knowledge_event_detected: false,
      meta: {},
    });

    const { agent, userId, csrfToken } = await createAuthedAgent();
    const intakeOk = await replaceIntakeEnvelopeForDev(userId, {
      intake: { profession: 'Ingeniera' },
      intakeContext: { financialLiteracy: 'high' },
      productsContext: {
        scope: 'all_products',
        productsCount: 1,
        uploadedFiles: ['cartola.csv'],
        activeProductLabel: 'Cuenta corriente',
        activeProduct: {
          id: 'prod-1',
          label: 'Cuenta corriente',
          bank: 'Banco Demo',
          productType: 'checking_account',
          connected: true,
          keyMetrics: { movement_count: 2, inflows_total: 950000, outflows_total: 12900 },
          parsedDocuments: [
            {
              documentId: 'doc-1',
              name: 'cartola.csv',
              text: 'Fecha;Detalle;Cargo;Abono;Saldo\n2026-05-01;SUPERMERCADO;12900;;150000',
            },
          ],
        },
        transactionSummary: { movementCount: 2, netFlow: 937100 },
      },
      budgetContext: { income: 2100000, expenses: 1500000, balance: 600000 },
    });
    expect(intakeOk).toBe(true);

    const res = await agent
      .post('/api/agent')
      .set('x-csrf-token', csrfToken)
      .send({
        user_message: 'Analiza mis movimientos',
        history: [],
        context: {},
        ui_state: {
          active_chat: { id: 'chat-1' },
        },
      });

    expect(res.status).toBe(200);
    expect(runCoreAgentMock).toHaveBeenCalledTimes(1);
    const input = runCoreAgentMock.mock.calls[0]?.[0] as {
      context?: Record<string, unknown>;
    };
    expect(Array.isArray(input?.context?.uploaded_documents)).toBe(true);
    expect((input?.context?.uploaded_documents as Array<Record<string, unknown>>)[0]?.name).toBe('cartola.csv');
    expect(
      ((input?.context?.consolidated_context as Record<string, unknown>)?.transactions as Record<string, unknown>)
        ?.activeProductLabel
    ).toBe('Cuenta corriente');
    expect(input?.context?.injected_budget).toEqual({
      income: 2100000,
      expenses: 1500000,
      balance: 600000,
    });
  }, 15000);

  it('returns a contextual fallback when cartola data already exists', async () => {
    runCoreAgentMock.mockReset();
    runCoreAgentMock.mockRejectedValueOnce(new Error('LLM down'));

    const { agent, userId, csrfToken } = await createAuthedAgent();
    const intakeOk = await replaceIntakeEnvelopeForDev(userId, {
      intake: { profession: 'Ingeniera' },
      intakeContext: { financialLiteracy: 'high' },
      productsContext: {
        scope: 'all_products',
        productsCount: 1,
        uploadedFiles: ['cartola.csv'],
        activeProductLabel: 'Cuenta corriente',
        activeProduct: {
          id: 'prod-1',
          label: 'Cuenta corriente',
          bank: 'Banco Demo',
          productType: 'checking_account',
          connected: true,
          keyMetrics: { movement_count: 2 },
          parsedDocuments: [
            {
              documentId: 'doc-1',
              name: 'cartola.csv',
              text: 'Fecha;Detalle;Cargo;Abono;Saldo\n2026-05-01;SUPERMERCADO;12900;;150000',
            },
          ],
        },
        transactionSummary: { movementCount: 2 },
      },
      budgetContext: { income: 2100000, expenses: 1500000, balance: 600000 },
    });
    expect(intakeOk).toBe(true);

    const res = await agent
      .post('/api/agent')
      .set('x-csrf-token', csrfToken)
      .send({
        user_message: '¿y mi cartola?',
        history: [],
        context: {},
        ui_state: {
          active_chat: { id: 'chat-1' },
        },
      });

    expect(res.status).toBe(200);
    const message = String(res.body?.data?.message ?? res.body?.message ?? '');
    expect(message).toContain('Ya tengo tus movimientos/cartolas integrados');
  }, 15000);

  it('persists and rehydrates the full chat turn history', async () => {
    runCoreAgentMock.mockReset();
    runCoreAgentMock.mockResolvedValue({
      message: 'respuesta persistida',
      mode: 'information',
      tool_calls: [],
      agent_blocks: [],
      artifacts: [],
      citations: [],
      compliance: {
        mode: 'information',
        no_auto_execution: true,
        includes_recommendation: false,
        includes_simulation: false,
        includes_regulation: false,
        missing_information: [],
        disclaimers_shown: [],
        risk_score: 0,
        blocked: { is_blocked: false },
      },
      state_updates: {},
      suggested_replies: [],
      budget_updates: [],
      knowledge_score: 0,
      knowledge_event_detected: false,
      meta: {},
    });

    const { agent, userId, csrfToken } = await createAuthedAgent();
    const intakeOk = await replaceIntakeEnvelopeForDev(userId, {
      intake: { profession: 'Ingeniera' },
      intakeContext: { financialLiteracy: 'high' },
    });
    expect(intakeOk).toBe(true);

    const sessionId = 'session-persist-1';
    const clientMessageId = 'client-msg-1';
    const sendRes = await agent
      .post('/api/agent')
      .set('x-csrf-token', csrfToken)
      .send({
        user_message: 'Hola agente',
        session_id: sessionId,
        client_message_id: clientMessageId,
        history: [{ role: 'user', content: 'Hola agente' }],
        context: {},
        ui_state: {
          active_chat: { id: 'chat-1' },
        },
      });

    expect(sendRes.status).toBe(200);

    const historyRes = await agent
      .get('/api/agent/history')
      .query({ chatId: 'chat-1', sessionId, limit: 10 })
      .set('x-csrf-token', csrfToken);

    expect(historyRes.status).toBe(200);
    expect(historyRes.body.ok).toBe(true);
    const turns = historyRes.body.data.turns as Array<{ userMessage?: string; assistantMessage?: string }>;
    expect(turns).toHaveLength(1);
    expect(turns[0]?.userMessage).toBe('Hola agente');
    expect(turns[0]?.assistantMessage).toBe('respuesta persistida');
  }, 15000);
});
