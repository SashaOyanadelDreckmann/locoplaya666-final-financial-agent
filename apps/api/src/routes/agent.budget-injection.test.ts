import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { attachIntakeToUser } from '../services/user.service';
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
    const intakeOk = await attachIntakeToUser(userId, {
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
});

