import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';

let dataDir: string;

beforeAll(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'financial-agent-api-'));
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
  delete process.env.OPENAI_API_KEY;
});

describe('auth + session', () => {
  it('register creates session cookie and /api/session returns user', async () => {
    const { createApp } = await import('../app');
    const app = createApp();

    const agent = request.agent(app);

    const reg = await agent.post('/auth/register').send({
      name: 'Test User',
      email: 'test@example.com',
      password: 'secret123',
    });

    expect(reg.status).toBe(200);
    expect(reg.body.ok).toBe(true);
    expect(reg.body.data?.user?.email).toBe('test@example.com');
    const sc = reg.headers['set-cookie'];
    const cookieStr = Array.isArray(sc) ? sc.join(' ') : sc ?? '';
    expect(cookieStr).toContain('session=');

    const session = await agent.get('/api/session');
    expect(session.status).toBe(200);
    expect(session.body.ok).toBe(true);
    expect(session.body.data.email).toBe('test@example.com');
    expect(session.body.data.passwordHash).toBeUndefined();
  });

  it('login fails with wrong password', async () => {
    const { createApp } = await import('../app');
    const app = createApp();
    const agent = request.agent(app);

    await agent.post('/auth/register').send({
      name: 'Test User 2',
      email: 'test2@example.com',
      password: 'secret123',
    });

    const bad = await request(app).post('/auth/login').send({
      email: 'test2@example.com',
      password: 'nope',
    });

    expect(bad.status).toBe(401);
    expect(bad.body.ok).toBe(false);
    expect(bad.body.error?.code).toBe('UNAUTHORIZED');
  });
});
