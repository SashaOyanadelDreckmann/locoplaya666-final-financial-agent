import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createApprovalToken } from '../services/approval.service';
import { getUserById, patchUserRecord } from '../persistencia/repos';
import {
  FINCOIN_MAX_USD_SPEND,
  FINCOIN_OPERATION_COST_USD,
} from '@financial-agent/shared';
import { chargeFincoinOperation } from '../services/fincoin.service';
import { replaceIntakeEnvelopeForDev } from '../services/user.service';

const runCoreAgentMock = vi.fn();

vi.mock('../agents/core.agent/core-agent-orchestrator', () => ({
  runCoreAgent: (...args: unknown[]) => runCoreAgentMock(...args),
}));

vi.mock('../services/llm.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/llm.service')>();
  return {
    ...actual,
    runWithLLMCostTracking: vi.fn(async <T>(fn: () => Promise<T>) => ({
      result: await fn(),
      costUsd: FINCOIN_OPERATION_COST_USD['agent.chat'],
    })),
  };
});

let dataDir: string;

beforeAll(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'financial-agent-fincoin-guard-'));
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

describe('fincoin spend guards', () => {
  async function createAuthedAgent() {
    const { createApp } = await import('../app');
    const app = createApp();
    const agent = request.agent(app);
    const email = `fincoin-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`;
    const reg = await agent.post('/auth/register').send({
      name: 'Fincoin Tester',
      email,
      password: 'Secret123',
    });
    const userId = String(reg.body?.data?.user?.id ?? '');
    const token = createApprovalToken({ userId, adminEmail: 'sasha.oyanadel@ug.uchile.cl' });
    await request(app).get(`/auth/approve?token=${encodeURIComponent(token)}`);
    await agent.post('/auth/login').send({ email, password: 'Secret123' });
    const sessionRes = await agent.get('/api/session');
    return {
      agent,
      app,
      csrfToken: String(sessionRes.headers['x-csrf-token'] ?? ''),
      userId,
    };
  }

  it('blocks transactions-chat when fincoins are depleted', async () => {
    const { agent, csrfToken, userId } = await createAuthedAgent();
    await patchUserRecord(userId, {
      usdSpentTotal: FINCOIN_MAX_USD_SPEND,
      fincoinDepletedAt: new Date().toISOString(),
      fincoinDepletionHandled: true,
    });

    const res = await agent.post('/api/transactions-chat').set('x-csrf-token', csrfToken).send({
      mode: 'summary',
      product: { bank: 'Banco' },
      parsedDocuments: [],
    });

    expect(res.status).toBe(403);
    expect(String(res.body?.code ?? res.body?.error?.code ?? '')).toMatch(/fincoins_depleted/i);
  }, 15000);

  it('blocks budget-chat when fincoins are depleted', async () => {
    const { agent, csrfToken, userId } = await createAuthedAgent();
    await patchUserRecord(userId, {
      usdSpentTotal: FINCOIN_MAX_USD_SPEND,
      fincoinDepletedAt: new Date().toISOString(),
      fincoinDepletionHandled: true,
    });

    const res = await agent.post('/api/budget-chat').set('x-csrf-token', csrfToken).send({
      intent: 'init',
      budgetRows: [{ id: 'income_salary', category: 'Sueldo', type: 'income', amount: 850000 }],
      chatAnswers: [],
    });

    expect(res.status).toBe(403);
    expect(String(res.body?.code ?? res.body?.error?.code ?? '')).toMatch(/fincoins_depleted/i);
  }, 15000);

  it('blocks agent chat when fincoins are depleted without invoking the core agent', async () => {
    runCoreAgentMock.mockReset();
    const { agent, csrfToken, userId } = await createAuthedAgent();
    await replaceIntakeEnvelopeForDev(userId, {
      intake: { profession: 'Analista' },
      intakeContext: 'test',
    });
    await patchUserRecord(userId, {
      usdSpentTotal: FINCOIN_MAX_USD_SPEND,
      fincoinDepletedAt: new Date().toISOString(),
      fincoinDepletionHandled: true,
    });

    const res = await agent
      .post('/api/agent')
      .set('x-csrf-token', csrfToken)
      .send({
        user_message: 'Hola',
        history: [],
        ui_state: { active_chat: { id: 'chat-1' } },
      });

    expect(res.status).toBe(200);
    expect(res.body?.data?.compliance?.blocked?.reason).toBe('FINCOINS_DEPLETED');
    expect(runCoreAgentMock).not.toHaveBeenCalled();
  }, 15000);

  it('allows agent chat to run when the user still has remaining spend headroom', async () => {
    runCoreAgentMock.mockReset();
    runCoreAgentMock.mockImplementation(async () => {
      throw new Error('agent should not run without charge');
    });

    const { agent, csrfToken, userId } = await createAuthedAgent();
    await replaceIntakeEnvelopeForDev(userId, {
      intake: { profession: 'Analista' },
      intakeContext: 'test',
    });
    const initialSpent = FINCOIN_MAX_USD_SPEND - FINCOIN_OPERATION_COST_USD['agent.chat'];
    await patchUserRecord(userId, {
      usdSpentTotal: initialSpent,
      fincoinDepletedAt: undefined,
      fincoinDepletionHandled: false,
    });

    const res = await agent
      .post('/api/agent')
      .set('x-csrf-token', csrfToken)
      .send({
        user_message: 'Hola',
        history: [],
        ui_state: { active_chat: { id: 'chat-1' } },
      });

    expect(res.status).toBe(200);
    expect(runCoreAgentMock).toHaveBeenCalledTimes(1);
    const user = await getUserById(userId);
    expect(Number(user?.usdSpentTotal ?? 0)).toBeGreaterThanOrEqual(initialSpent - 1e-6);
    expect(Number(user?.usdSpentTotal ?? 0)).toBeLessThanOrEqual(FINCOIN_MAX_USD_SPEND + 1e-6);
    expect(res.body?.data?.meta?.fincoin_usage).toBeDefined();
  }, 15000);

  it('allows only one concurrent charge when the remaining budget fits a single operation', async () => {
    const { userId } = await createAuthedAgent();
    const headroom = FINCOIN_OPERATION_COST_USD['agent.chat'] + 0.001;
    await patchUserRecord(userId, {
      usdSpentTotal: FINCOIN_MAX_USD_SPEND - headroom,
      fincoinDepletedAt: undefined,
      fincoinDepletionHandled: false,
    });

    const [first, second] = await Promise.all([
      chargeFincoinOperation(userId, 'agent.chat'),
      chargeFincoinOperation(userId, 'agent.chat'),
    ]);

    const chargedCount = [first, second].filter((result) => result.charged).length;
    expect(chargedCount).toBe(1);

    const user = await getUserById(userId);
    expect(Number(user?.usdSpentTotal ?? 0)).toBeLessThanOrEqual(FINCOIN_MAX_USD_SPEND + 1e-6);
  }, 15000);

  it('exposes fincoin usage in session payload', async () => {
    const { agent } = await createAuthedAgent();
    const sessionRes = await agent.get('/api/session');
    expect(sessionRes.status).toBe(200);
    expect(sessionRes.body?.data?.fincoinUsage?.initial_fincoins).toBe(250);
    expect(sessionRes.body?.data?.fincoinUsage?.depleted).toBe(false);
  }, 15000);

  it('keeps fincoin wallets isolated between users', async () => {
    const userA = await createAuthedAgent();
    const userB = await createAuthedAgent();

    await patchUserRecord(userA.userId, {
      usdSpentTotal: FINCOIN_MAX_USD_SPEND,
      fincoinDepletedAt: new Date().toISOString(),
      fincoinDepletionHandled: true,
    });

    const [sessionA, sessionB, usageA, usageB] = await Promise.all([
      userA.agent.get('/api/session'),
      userB.agent.get('/api/session'),
      userA.agent.get('/api/usage'),
      userB.agent.get('/api/usage'),
    ]);

    expect(sessionA.body?.data?.fincoinUsage?.depleted).toBe(true);
    expect(sessionA.body?.data?.fincoinUsage?.remaining_fincoins).toBe(0);
    expect(sessionB.body?.data?.fincoinUsage?.depleted).toBe(false);
    expect(sessionB.body?.data?.fincoinUsage?.remaining_fincoins).toBe(250);

    expect(usageA.body?.data?.usage?.depleted).toBe(true);
    expect(usageB.body?.data?.usage?.depleted).toBe(false);
    expect(usageB.body?.data?.usage?.remaining_fincoins).toBe(250);

    const chargeB = await chargeFincoinOperation(userB.userId, 'agent.chat');
    expect(chargeB.charged).toBe(true);
    expect(chargeB.usage.usdSpent).toBeCloseTo(FINCOIN_OPERATION_COST_USD['agent.chat'], 5);

    const recordA = await getUserById(userA.userId);
    const recordB = await getUserById(userB.userId);
    expect(Number(recordA?.usdSpentTotal ?? 0)).toBeGreaterThanOrEqual(FINCOIN_MAX_USD_SPEND - 1e-6);
    expect(Number(recordB?.usdSpentTotal ?? 0)).toBeCloseTo(
      FINCOIN_OPERATION_COST_USD['agent.chat'],
      5,
    );
  }, 20000);
});
