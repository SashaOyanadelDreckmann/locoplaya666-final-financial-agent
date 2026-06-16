import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { replaceIntakeEnvelopeForDev, saveUserMemoryBlob } from '../services/user.service';
import { createApprovalToken } from '../services/approval.service';

let dataDir: string;

beforeAll(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'financial-agent-session-context-'));
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
  const email = `session-${suffix}@example.com`;

  const registerRes = await agent.post('/auth/register').send({
    name: 'Session Test',
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

describe('session context hydration', () => {
  it('returns merged interview products/budget context and voice snapshot', async () => {
    const { agent, userId, csrfToken } = await createAuthedAgent();

    const intakeOk = await replaceIntakeEnvelopeForDev(userId, {
      intake: { profession: 'Ingeniera', hasDebt: true, hasSavingsOrInvestments: true },
      intakeContext: { financialLiteracy: 'high' },
      productsContext: {
        productsCount: 2,
        activeProductLabel: 'Cuenta corriente',
      },
      budgetContext: {
        income: 2500000,
        expenses: 1800000,
        balance: 700000,
      },
    });
    expect(intakeOk).toBe(true);

    const voiceOk = await saveUserMemoryBlob(userId, {
      interviewVoice: {
        callId: 'call_test_1',
        activeCallId: 'call_test_1',
        status: 'paused',
        callSeconds: 52,
        remainingTotalSec: 248,
      },
    });
    expect(voiceOk).toBe(true);

    const mergeRes = await agent
      .post('/api/merge-products-context')
      .set('x-csrf-token', csrfToken)
      .send({
        productsContext: {
          productsCount: 3,
          activeProductLabel: 'Tarjeta principal',
        },
        budgetContext: {
          income: 3100000,
          expenses: 1900000,
          balance: 1200000,
        },
      });

    expect(mergeRes.status).toBe(200);
    expect(mergeRes.body.ok).toBe(true);

    const sessionRes = await agent.get('/api/session');
    expect(sessionRes.status).toBe(200);
    expect(sessionRes.body.data.injectedIntake.productsContext.activeProductLabel).toBe('Tarjeta principal');
    expect(sessionRes.body.data.injectedIntake.budgetContext.balance).toBe(1200000);
    expect(sessionRes.body.data.interviewVoice.callId).toBe('call_test_1');
    expect(sessionRes.body.data.interviewVoice.status).toBe('paused');
  }, 15000);
});
