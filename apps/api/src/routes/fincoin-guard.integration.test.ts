import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createApprovalToken } from '../services/approval.service';
import { patchUserRecord } from '../persistencia/repos';
import { FINCOIN_MAX_USD_SPEND } from '@financial-agent/shared';

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

  it('exposes fincoin usage in session payload', async () => {
    const { agent } = await createAuthedAgent();
    const sessionRes = await agent.get('/api/session');
    expect(sessionRes.status).toBe(200);
    expect(sessionRes.body?.data?.fincoinUsage?.initial_fincoins).toBe(250);
    expect(sessionRes.body?.data?.fincoinUsage?.depleted).toBe(false);
  }, 15000);
});
