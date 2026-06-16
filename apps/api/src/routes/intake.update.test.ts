import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createApprovalToken } from '../services/approval.service';
import { replaceIntakeEnvelopeForDev } from '../services/user.service';

let dataDir: string;

beforeAll(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'financial-agent-intake-update-'));
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
  const email = `intake-update-${suffix}@example.com`;

  const registerRes = await agent.post('/auth/register').send({
    name: 'Intake Update Test',
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

describe('PATCH /intake/update', () => {
  it('updates questionnaire after onboarding without charging fincoins', async () => {
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

    const { agent, userId, csrfToken } = await createAuthedAgent();

    await replaceIntakeEnvelopeForDev(userId, {
      intake: COMPLETE_INTAKE,
      intakeContext: 'baseline',
      budgetContext: { income: 900000, expenses: 700000, balance: 200000 },
      productsContext: { productsCount: 1, activeProductLabel: 'Cuenta' },
    });

    const response = await agent
      .patch('/intake/update')
      .set('X-CSRF-Token', csrfToken)
      .send({ ...COMPLETE_INTAKE, incomeBand: '1M-2M', hasDebt: true });

    expect(response.status).toBe(200);
    expect(response.body?.data?.updated).toBe(true);
    expect(response.body?.data?.fincoinCharge).toBe(false);
    expect(response.body?.data?.intake?.incomeBand).toBe('1M-2M');
    expect(response.body?.data?.intake?.hasDebt).toBe(true);

    const session = await agent.get('/api/session');
    expect(session.body?.data?.injectedIntake?.intake?.incomeBand).toBe('1M-2M');
    expect(session.body?.data?.injectedIntake?.budgetContext?.balance).toBe(200000);
    expect(session.body?.data?.injectedIntake?.productsContext?.activeProductLabel).toBe('Cuenta');
  });

  it('rejects update when questionnaire was never completed', async () => {
    const { agent, csrfToken } = await createAuthedAgent();

    const response = await agent
      .patch('/intake/update')
      .set('X-CSRF-Token', csrfToken)
      .send(COMPLETE_INTAKE);

    expect(response.status).toBe(400);
  });
});
