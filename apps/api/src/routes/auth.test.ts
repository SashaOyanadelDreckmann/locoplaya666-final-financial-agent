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
  beforeAll(() => {
    process.env.AUTH_RATE_LIMIT_MAX = '200';
  });
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
  }, 15000);

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
      action: 'approve',
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
      action: 'approve',
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

  it('reject link marks account as rejected and keeps login blocked', async () => {
    const { createApp } = await import('../app');
    const app = createApp();
    const email = `reject-${Date.now()}@example.com`;

    const reg = await request(app).post('/auth/register').send({
      name: 'Rejected User',
      email,
      password: 'Secret123',
    });
    expect(reg.status).toBe(200);
    const userId = String(reg.body?.data?.user?.id ?? '');
    const token = createApprovalToken({
      userId,
      adminEmail: 'sasha.oyanadel@ug.uchile.cl',
      action: 'reject',
    });

    const rejected = await request(app).get(`/auth/reject?token=${encodeURIComponent(token)}`);
    expect(rejected.status).toBe(200);
    expect(rejected.body.data?.rejected).toBe(true);

    const login = await request(app).post('/auth/login').send({
      email,
      password: 'Secret123',
    });
    expect(login.status).toBe(403);
    expect(login.body.code).toBe('ACCOUNT_REJECTED');
  });

  it('approve endpoint is idempotent', async () => {
    const { createApp } = await import('../app');
    const app = createApp();
    const email = `idempotent-${Date.now()}@example.com`;

    const reg = await request(app).post('/auth/register').send({
      name: 'Idempotent User',
      email,
      password: 'Secret123',
    });
    const userId = String(reg.body?.data?.user?.id ?? '');
    const token = createApprovalToken({
      userId,
      adminEmail: 'sasha.oyanadel@ug.uchile.cl',
      action: 'approve',
    });

    const first = await request(app).get(`/auth/approve?token=${encodeURIComponent(token)}`);
    const second = await request(app).get(`/auth/approve?token=${encodeURIComponent(token)}`);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.data?.alreadyApproved).toBe(true);
  });

  it('reject endpoint is idempotent', async () => {
    const { createApp } = await import('../app');
    const app = createApp();
    const email = `reject-idempotent-${Date.now()}@example.com`;

    const reg = await request(app).post('/auth/register').send({
      name: 'Reject Idempotent User',
      email,
      password: 'Secret123',
    });
    const userId = String(reg.body?.data?.user?.id ?? '');
    const token = createApprovalToken({
      userId,
      adminEmail: 'sasha.oyanadel@ug.uchile.cl',
      action: 'reject',
    });

    const first = await request(app).get(`/auth/reject?token=${encodeURIComponent(token)}`);
    const second = await request(app).get(`/auth/reject?token=${encodeURIComponent(token)}`);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.data?.alreadyRejected).toBe(true);
  });

  it('reject token cannot be used in approve endpoint', async () => {
    const { createApp } = await import('../app');
    const app = createApp();
    const email = `mismatch-${Date.now()}@example.com`;

    const reg = await request(app).post('/auth/register').send({
      name: 'Mismatch User',
      email,
      password: 'Secret123',
    });
    const userId = String(reg.body?.data?.user?.id ?? '');
    const rejectToken = createApprovalToken({
      userId,
      adminEmail: 'sasha.oyanadel@ug.uchile.cl',
      action: 'reject',
    });

    const res = await request(app).get(`/auth/approve?token=${encodeURIComponent(rejectToken)}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });
});
