import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createApprovalToken } from '../services/approval.service';

const mockCreate = vi.fn();
const mockToFile = vi.fn(async (buffer: Buffer, name: string, options?: { type?: string }) => ({
  name,
  type: options?.type ?? 'audio/wav',
  size: buffer.byteLength,
}));

vi.mock('openai', () => ({
  __esModule: true,
  default: vi.fn().mockImplementation(() => ({
    audio: { transcriptions: { create: mockCreate } },
  })),
  toFile: mockToFile,
}));

let dataDir: string;

beforeAll(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'financial-agent-transcribe-'));
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

describe('transcribe api route', () => {
  async function createAuthedAgent() {
    const { createApp } = await import('../app');
    const app = createApp();
    const agent = request.agent(app);
    const email = `audio-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`;
    const reg = await agent.post('/auth/register').send({
      name: 'Audio Tester',
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
    mockCreate.mockResolvedValue({ text: 'hola mundo' });
  });

  it('transcribes a base64 audio payload', async () => {
    const { agent, csrfToken } = await createAuthedAgent();
    const body = {
      file: {
        name: 'audio.wav',
        mimeType: 'audio/wav',
        base64: Buffer.from('fake-audio').toString('base64'),
      },
    };

    const res = await agent.post('/api/transcribe').set('x-csrf-token', csrfToken).send(body);

    expect(res.status).toBe(200);
    expect(res.body.text).toBe('hola mundo');
    expect(mockToFile).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  }, 15000);
});
