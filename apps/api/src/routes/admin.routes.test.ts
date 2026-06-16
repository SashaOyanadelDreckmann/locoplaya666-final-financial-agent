import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import bcrypt from 'bcryptjs';
import { resetAdminAuditForTests } from '../services/admin-audit.service';
import { createUser } from '../services/user.service';
import { USER_ROLES } from '../auth/rbac';
import { APPROVAL_STATUS } from '../auth/approval';

let dataDir: string;

async function loginAsAdmin(app: ReturnType<typeof import('../app').createApp>) {
  const agent = request.agent(app);
  const login = await agent.post('/auth/login').send({
    email: 'admin@financieramente.local',
    password: 'Financieramente123!',
  });
  expect(login.status).toBe(200);
  const session = await agent.get('/api/session');
  const csrfToken = String(session.headers['x-csrf-token'] ?? '');
  return { agent, csrfToken };
}

async function loginAsUser(app: ReturnType<typeof import('../app').createApp>, email: string, password: string) {
  const agent = request.agent(app);
  const login = await agent.post('/auth/login').send({ email, password });
  expect(login.status).toBe(200);
  return agent;
}

beforeAll(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'financial-agent-admin-'));
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
  process.env.ENABLE_BOOTSTRAP_ADMIN_LOGIN = 'true';
  process.env.ADMIN_RATE_LIMIT_MAX = '500';
  process.env.AUTH_RATE_LIMIT_MAX = '200';
});

afterAll(() => {
  try {
    fs.rmSync(dataDir, { recursive: true, force: true });
  } catch {}
});

beforeEach(() => {
  resetAdminAuditForTests();
});

describe('admin routes', () => {
  it('denies non-admin users from admin cockpit', async () => {
    const { createApp } = await import('../app');
    const app = createApp();

    const passwordHash = await bcrypt.hash('Secret123', 12);
    await createUser({
      name: 'Regular User',
      email: 'regular@example.com',
      passwordHash,
      role: USER_ROLES.USER,
      approvalStatus: APPROVAL_STATUS.APPROVED,
      approvedAt: new Date().toISOString(),
      approvedByEmail: 'admin@financieramente.local',
    });

    const userAgent = await loginAsUser(app, 'regular@example.com', 'Secret123');
    const denied = await userAgent.get('/api/admin/cockpit');
    expect(denied.status).toBe(403);
  }, 15000);

  it('allows admin cockpit and approval actions', async () => {
    const { createApp } = await import('../app');
    const app = createApp();
    const { agent, csrfToken } = await loginAsAdmin(app);

    const cockpit = await agent.get('/api/admin/cockpit');
    expect(cockpit.status).toBe(200);
    expect(cockpit.body.ok).toBe(true);

    const passwordHash = await bcrypt.hash('Secret123', 12);
    const pending = await createUser({
      name: 'Pending User',
      email: 'pending@example.com',
      passwordHash,
      role: USER_ROLES.USER,
      approvalStatus: APPROVAL_STATUS.PENDING_APPROVAL,
    });

    const approved = await agent
      .post(`/api/admin/users/${pending.id}/approve`)
      .set('X-CSRF-Token', csrfToken);
    expect(approved.status).toBe(200);
    expect(approved.body.data?.user?.approvalStatus).toBe('APPROVED');

    const audit = await agent.get('/api/admin/audit-log');
    expect(audit.status).toBe(200);
    expect(audit.body.data?.entries?.some((entry: { action: string }) => entry.action === 'user.approve')).toBe(true);
  }, 15000);

  it('supports paginated archive users and role updates', async () => {
    const { createApp } = await import('../app');
    const app = createApp();
    const { agent, csrfToken } = await loginAsAdmin(app);

    const passwordHash = await bcrypt.hash('Secret123', 12);
    const target = await createUser({
      name: 'Archive Target',
      email: 'archive@example.com',
      passwordHash,
      role: USER_ROLES.USER,
      approvalStatus: APPROVAL_STATUS.APPROVED,
      approvedAt: new Date().toISOString(),
      approvedByEmail: 'admin@financieramente.local',
    });

    const page = await agent.get('/api/admin/users?limit=10&offset=0');
    expect(page.status).toBe(200);
    expect(page.body.data?.users?.length).toBeGreaterThan(0);

    const rolePatch = await agent
      .patch(`/api/admin/users/${target.id}/role`)
      .set('X-CSRF-Token', csrfToken)
      .send({ role: USER_ROLES.ANALYST });
    expect(rolePatch.status).toBe(200);
    expect(rolePatch.body.data?.user?.role).toBe('ANALYST');

    const snapshot = await agent.get(`/api/admin/users/${target.id}/snapshot`);
    expect(snapshot.status).toBe(200);
    expect(snapshot.body.data?.email).toBe('archive@example.com');
  }, 15000);

  it('denies analyst from analytics users endpoint', async () => {
    const { createApp } = await import('../app');
    const app = createApp();
    await loginAsAdmin(app);

    const passwordHash = await bcrypt.hash('Secret123', 12);
    const analyst = await createUser({
      name: 'Analyst User',
      email: 'analyst@example.com',
      passwordHash,
      role: USER_ROLES.ANALYST,
      approvalStatus: APPROVAL_STATUS.APPROVED,
      approvedAt: new Date().toISOString(),
      approvedByEmail: 'admin@financieramente.local',
    });

    const analystAgent = await loginAsUser(app, analyst.email, 'Secret123');
    const denied = await analystAgent.get('/api/analytics/users');
    expect(denied.status).toBe(403);
  }, 15000);
});
