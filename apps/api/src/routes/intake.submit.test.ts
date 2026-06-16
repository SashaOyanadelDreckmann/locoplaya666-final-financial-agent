import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createApprovalToken } from '../services/approval.service';
import { replaceIntakeEnvelopeForDev } from '../services/user.service';

let dataDir: string;

beforeAll(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'financial-agent-intake-submit-'));
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

const COMPLETE_INTAKE = {
  employmentStatus: 'employed',
  incomeBand: '600k-1M',
  expensesCoverage: 'tight',
  tracksExpenses: 'sometimes',
  hasSavingsOrInvestments: false,
  hasDebt: false,
  financialKnowledge: {
    interest: false,
    CAE: false,
    inflation: false,
    creditCard: false,
    creditLine: false,
    loanComponents: false,
    interestRate: false,
    liquidity: false,
    returnConcept: false,
    diversification: false,
    assetVsLiability: false,
    financialRisk: false,
    capitalMarkets: false,
    alternativeInvestments: false,
    fintech: false,
  },
  riskReaction: 'hold',
  selfRatedUnderstanding: 4,
  moneyStressLevel: 5,
};

async function createAuthedAgent() {
  const { createApp } = await import('../app');
  const app = createApp();
  const agent = request.agent(app);
  const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const email = `intake-${suffix}@example.com`;

  const registerRes = await agent.post('/auth/register').send({
    name: 'Intake Test',
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

  const csrfRes = await agent.get('/api/session');
  const csrfToken = String(csrfRes.headers['x-csrf-token'] ?? '');

  return { agent, userId, csrfToken };
}

describe('POST /intake/submit', () => {
  it('persists questionnaire once and rejects a second submit', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('openai.com') || url.includes('anthropic.com')) {
        return new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }) as Response;
      }
      return new Response('{}', { status: 404 }) as Response;
    });

    const { agent, csrfToken } = await createAuthedAgent();

    const first = await agent
      .post('/intake/submit')
      .set('X-CSRF-Token', csrfToken)
      .send(COMPLETE_INTAKE);
    expect(first.status).toBe(200);
    expect(first.body?.data?.intake?.employmentStatus).toBe('employed');
    expect(first.body?.data?.wasUpdated).toBeUndefined();

    const second = await agent
      .post('/intake/submit')
      .set('X-CSRF-Token', csrfToken)
      .send({ ...COMPLETE_INTAKE, incomeBand: '1M-2M' });
    expect(second.status).toBe(409);
  });

  it('merge financial context does not overwrite questionnaire answers', async () => {
    const { agent, userId, csrfToken } = await createAuthedAgent();

    await replaceIntakeEnvelopeForDev(userId, {
      intake: COMPLETE_INTAKE,
      intakeContext: 'baseline',
    });

    const merge = await agent
      .post('/api/merge-products-context')
      .set('X-CSRF-Token', csrfToken)
      .send({
        productsContext: { productsCount: 1, activeProductLabel: 'Cuenta RUT' },
        budgetContext: { income: 900000, expenses: 700000, balance: 200000 },
      });
    expect(merge.status).toBe(200);

    const session = await agent.get('/api/session');
    expect(session.body?.data?.injectedIntake?.intake?.incomeBand).toBe('600k-1M');
    expect(session.body?.data?.injectedIntake?.budgetContext?.balance).toBe(200000);
  });
});
