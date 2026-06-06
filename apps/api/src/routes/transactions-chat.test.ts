import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createApprovalToken } from '../services/approval.service';

const mockCreate = vi.fn();

vi.mock('openai', () => ({
  __esModule: true,
  default: vi.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
  })),
}));

let dataDir: string;

beforeAll(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'financial-agent-transactions-chat-'));
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

describe('transactions-chat api route', () => {
  async function createAuthedAgent() {
    const { createApp } = await import('../app');
    const app = createApp();
    const agent = request.agent(app);
    const email = `tx-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`;
    const reg = await agent.post('/auth/register').send({
      name: 'Tx Tester',
      email,
      password: 'Secret123',
    });
    const userId = String(reg.body?.data?.user?.id ?? '');
    const token = createApprovalToken({ userId, adminEmail: 'sasha.oyanadel@ug.uchile.cl' });
    await request(app).get(`/auth/approve?token=${encodeURIComponent(token)}`);
    await agent.post('/auth/login').send({ email, password: 'Secret123' });
    const sessionRes = await agent.get('/api/session');
    return { agent, csrfToken: String(sessionRes.headers['x-csrf-token'] ?? '') };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ summary: 'resumen ok' }) } }],
    });
  });

  it('returns summary payload', async () => {
    const { agent, csrfToken } = await createAuthedAgent();
    const res = await agent.post('/api/transactions-chat').set('x-csrf-token', csrfToken).send({
      mode: 'summary',
      product: { bank: 'Banco' },
      parsedDocuments: [],
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.summary).toBe('resumen ok');
    expect(mockCreate).toHaveBeenCalledTimes(1);
  }, 15000);

  it('returns chat payload', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'respuesta corta' } }],
    });
    const { agent, csrfToken } = await createAuthedAgent();
    const res = await agent.post('/api/transactions-chat').set('x-csrf-token', csrfToken).send({
      mode: 'chat',
      question: 'hola',
      messages: [{ role: 'user', text: 'hola' }],
      dashboard: { keyMetrics: { movement_count: 0 }, retrieval: { mode: 'overview', matchedCount: 0 }, movements: [] },
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.assistant_text).toBe('respuesta corta');
    expect(res.body.retrieval_mode).toBe('overview');
    expect(mockCreate).toHaveBeenCalledTimes(1);
  }, 15000);
});
