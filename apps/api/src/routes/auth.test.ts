import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createApprovalToken } from '../services/approval.service';

let dataDir: string;

beforeAll(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'financial-agent-api-'));
  process.env.DATA_DIR = dataDir;
  process.env.NODE_ENV = 'test';
  process.env.WEB_ORIGIN = 'http://localhost:3001';
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.ANTHROPIC_API_KEY = 'test-key';
  process.env.LOG_LEVEL = 'error';
  process.env.APPROVAL_LINK_SECRET = 'test-approval-link-secret-abcdefghijklmnopqrstuvwxyz';
  process.env.APPROVAL_LINK_BASE_URL = 'http://localhost:3001';
  process.env.APPROVAL_ADMIN_EMAIL = 'sasha.oyanadel@ug.uchile.cl';
  process.env.APPROVAL_LINK_TTL_HOURS = '24';
});

afterAll(() => {
  try {
    fs.rmSync(dataDir, { recursive: true, force: true });
  } catch {}
  delete process.env.OPENAI_API_KEY;
});

describe('auth + session', () => {
  it('register creates pending approval account (no session)', async () => {
    const { createApp } = await import('../app');
    const app = createApp();

    const agent = request.agent(app);

    const reg = await agent.post('/auth/register').send({
      name: 'Test User',
      email: 'test@example.com',
      password: 'Secret123',
    });

    expect(reg.status).toBe(200);
    expect(reg.body.ok).toBe(true);
    expect(reg.body.data?.user?.email).toBe('test@example.com');
    expect(reg.body.data?.approvalStatus).toBe('PENDING_APPROVAL');
    expect(reg.body.data?.requiresApproval).toBe(true);
    const sc = reg.headers['set-cookie'];
    const cookieStr = Array.isArray(sc) ? sc.join(' ') : sc ?? '';
    expect(cookieStr).not.toContain('session=');

    const session = await agent.get('/api/session');
    expect(session.status).toBe(401);
  });

  it('login fails with wrong password after account approval', async () => {
    const { createApp } = await import('../app');
    const app = createApp();
    const agent = request.agent(app);

    const reg = await agent.post('/auth/register').send({
      name: 'Test User 2',
      email: 'test2@example.com',
      password: 'Secret123',
    });
    const userId = String(reg.body?.data?.user?.id ?? '');
    const token = createApprovalToken({
      userId,
      adminEmail: 'sasha.oyanadel@ug.uchile.cl',
    });
    const approved = await request(app).get(`/auth/approve?token=${encodeURIComponent(token)}`);
    expect(approved.status).toBe(200);

    const bad = await request(app).post('/auth/login').send({
      email: 'test2@example.com',
      password: 'nope',
    });

    expect(bad.status).toBe(401);
    expect(bad.headers['content-type']).toContain('application/problem+json');
    expect(bad.body.code).toBe('UNAUTHORIZED');
    expect(typeof bad.body.detail).toBe('string');
  });

  it('blocks login until approval and allows login after approval link', async () => {
    const { createApp } = await import('../app');
    const app = createApp();
    const email = `pending-${Date.now()}@example.com`;

    const reg = await request(app).post('/auth/register').send({
      name: 'Pending User',
      email,
      password: 'Secret123',
    });
    expect(reg.status).toBe(200);
    const userId = String(reg.body?.data?.user?.id ?? '');
    expect(userId.length).toBeGreaterThan(0);

    const blocked = await request(app).post('/auth/login').send({
      email,
      password: 'Secret123',
    });
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('ACCOUNT_PENDING_APPROVAL');

    const token = createApprovalToken({
      userId,
      adminEmail: 'sasha.oyanadel@ug.uchile.cl',
    });
    const approved = await request(app).get(`/auth/approve?token=${encodeURIComponent(token)}`);
    expect(approved.status).toBe(200);
    expect(approved.body.data?.approved).toBe(true);

    const ok = await request(app).post('/auth/login').send({
      email,
      password: 'Secret123',
    });
    expect(ok.status).toBe(200);
    expect(ok.body.ok).toBe(true);
  });
});
