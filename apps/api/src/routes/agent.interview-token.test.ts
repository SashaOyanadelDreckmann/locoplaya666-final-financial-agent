import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  INTERVIEW_MAX_CALLS_PER_USER,
  INTERVIEW_TOTAL_LIMIT_MINUTES,
  INTERVIEW_TOTAL_LIMIT_SEC,
} from '@financial-agent/shared';

let dataDir: string;

beforeAll(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'financial-agent-interview-token-'));
  process.env.DATA_DIR = dataDir;
  process.env.NODE_ENV = 'test';
  process.env.WEB_ORIGIN = 'http://localhost:3001';
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.ANTHROPIC_API_KEY = 'test-key';
  process.env.LOG_LEVEL = 'error';
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(() => {
  try {
    fs.rmSync(dataDir, { recursive: true, force: true });
  } catch {}
});

function mockRealtimeClientSecretFetch() {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(
      JSON.stringify({
        id: 'realtime-session-test',
        client_secret: {
          value: 'epk_test_secret',
          expires_at: Math.floor(Date.now() / 1000) + 60,
        },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    ) as unknown as Response,
  );
}

async function createAuthedAgent() {
  const { createApp } = await import('../app');
  const app = createApp();
  const agent = request.agent(app);
  const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const email = `token-${suffix}@example.com`;

  const registerRes = await agent.post('/auth/register').send({
    name: 'Token Test',
    email,
    password: 'secret123',
  });
  expect(registerRes.status).toBe(200);

  const sessionRes = await agent.get('/api/session');
  expect(sessionRes.status).toBe(200);
  const userId = String(sessionRes.body?.data?.id ?? '');
  expect(userId.length).toBeGreaterThan(0);

  return { agent, userId };
}

describe('GET /api/interview/realtime/token', () => {
  it('returns full remaining time for fresh users', async () => {
    const fetchSpy = mockRealtimeClientSecretFetch();
    const { agent } = await createAuthedAgent();

    const res = await agent.get('/api/interview/realtime/token');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.max_duration_sec).toBe(INTERVIEW_TOTAL_LIMIT_SEC);
    expect(res.body.data.remaining_total_sec).toBe(INTERVIEW_TOTAL_LIMIT_SEC);
    expect(typeof res.body.data.call_id).toBe('string');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const requestBody = JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body ?? '{}'));
    expect(requestBody.session.model).toBe('gpt-realtime-mini');
  });

  it('returns exact remaining time after prior consumption', async () => {
    const fetchSpy = mockRealtimeClientSecretFetch();
    const { agent, userId } = await createAuthedAgent();
    const { saveUserMemoryBlob } = await import('../services/user.service');

    await saveUserMemoryBlob(userId, {
      interviewVoice: {
        totalUsedSec: INTERVIEW_TOTAL_LIMIT_SEC - 15,
        callsStarted: 1,
        activeCallId: 'call_resume_test',
        status: 'paused',
      },
    });

    const res = await agent.get('/api/interview/realtime/token');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.max_duration_sec).toBe(15);
    expect(res.body.data.remaining_total_sec).toBe(15);
    expect(res.body.data.total_used_sec).toBe(INTERVIEW_TOTAL_LIMIT_SEC - 15);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('blocks token creation when total interview time is exhausted', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { agent, userId } = await createAuthedAgent();
    const { saveUserMemoryBlob } = await import('../services/user.service');

    await saveUserMemoryBlob(userId, {
      interviewVoice: {
        totalUsedSec: INTERVIEW_TOTAL_LIMIT_SEC,
        callsStarted: 2,
      },
    });

    const res = await agent.get('/api/interview/realtime/token');

    expect(res.status).toBe(403);
    expect(String(res.body?.detail ?? '')).toContain(
      `máximo ${INTERVIEW_TOTAL_LIMIT_MINUTES} minutos`,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('blocks a second fresh call for the same user', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { agent, userId } = await createAuthedAgent();
    const { saveUserMemoryBlob } = await import('../services/user.service');

    await saveUserMemoryBlob(userId, {
      interviewVoice: {
        totalUsedSec: 42,
        callsStarted: INTERVIEW_MAX_CALLS_PER_USER,
        activeCallId: null,
        status: 'idle',
      },
    });

    const res = await agent.get('/api/interview/realtime/token');

    expect(res.status).toBe(403);
    expect(String(res.body?.detail ?? '')).toContain('una sola llamada por usuario');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
