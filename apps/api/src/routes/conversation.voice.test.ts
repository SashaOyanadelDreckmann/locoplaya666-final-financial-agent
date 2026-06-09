import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { INTERVIEW_TOTAL_LIMIT_SEC } from '@financial-agent/shared';
import { createApprovalToken } from '../services/approval.service';

vi.mock('../services/llm.service', () => ({
  completeStructured: vi.fn(async () =>
    ({
      executive_report: 'Resumen ejecutivo de prueba',
      key_findings: ['Hallazgo 1'],
      confidence: 'high',
      stop_reason: 'user',
      has_enough_information: true,
    }),
  ),
}));

vi.mock('../agents/diagnostic/diagnostic.agent', () => ({
  runDiagnosticAgent: vi.fn(async () => ({
    diagnosticNarrative: 'Diagnóstico de prueba',
    profile: { timeHorizon: 'medium' },
  })),
}));

vi.mock('../services/storage.service', () => ({
  saveProfile: vi.fn(async () => ({ profileId: 'profile-test-1' })),
}));

vi.mock('../services/knowledge.service', () => ({
  recordKnowledgeEvent: vi.fn(async () => undefined),
}));

vi.mock('../services/memory.service', () => ({
  appendMemoryTimelineNote: vi.fn(),
}));

let dataDir: string;

beforeAll(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'financial-agent-conversation-voice-'));
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

beforeEach(() => {
  vi.clearAllMocks();
});

async function createAuthedAgent() {
  const { createApp } = await import('../app');
  const app = createApp();
  const agent = request.agent(app);
  const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const email = `voice-${suffix}@example.com`;

  const registerRes = await agent.post('/auth/register').send({
    name: 'Voice Test',
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
  const csrfToken = sessionRes.headers['x-csrf-token'];
  expect(typeof csrfToken).toBe('string');
  return { agent, csrfToken: String(csrfToken) };
}

describe('conversation voice routes', () => {
  it('persists interview voice state via /conversation/voice/state', async () => {
    const { agent, csrfToken } = await createAuthedAgent();

    const res = await agent
      .post('/conversation/voice/state')
      .set('x-csrf-token', csrfToken)
      .send({
        callId: 'call-voice-test-1',
        status: 'paused',
        callSeconds: 37,
        maxDurationSec: INTERVIEW_TOTAL_LIMIT_SEC,
        remainingTotalSec: 83,
        pauseUsed: true,
        minuteSummaries: [
          {
            minute: 1,
            summary: 'Síntesis breve de prueba',
            keyFindings: ['Hallazgo de prueba'],
            confidence: 'medium',
          },
        ],
        finalSummary: {
          summary: 'Síntesis final de prueba',
          keyFindings: ['Hallazgo final'],
          confidence: 'high',
          createdAt: new Date().toISOString(),
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.saved).toBe(true);
    expect(res.body.data.interview_voice.callId).toBe('call-voice-test-1');
    expect(res.body.data.interview_voice.activeCallId).toBe('call-voice-test-1');
    expect(res.body.data.interview_voice.status).toBe('paused');
    expect(res.body.data.interview_voice.totalUsedSec).toBe(37);
    expect(res.body.data.interview_voice.remainingTotalSec).toBe(INTERVIEW_TOTAL_LIMIT_SEC - 37);
  }, 15000);

  it('accepts durationSec=0 when finalizing voice call', async () => {
    const { agent, csrfToken } = await createAuthedAgent();

    const stateRes = await agent
      .post('/conversation/voice/state')
      .set('x-csrf-token', csrfToken)
      .send({
        callId: 'call-voice-test-2',
        activeCallId: 'call-voice-test-2',
        status: 'paused',
        maxDurationSec: 150,
        callSeconds: 44,
        remainingTotalSec: 76,
      });
    expect(stateRes.status).toBe(200);

    const res = await agent
      .post('/conversation/voice/finalize')
      .set('x-csrf-token', csrfToken)
      .send({
        intake: {
          hasDebt: false,
          hasSavingsOrInvestments: true,
        },
        minuteSummaries: [
          {
            minute: 1,
            summary: 'El usuario confirma estabilidad de ingresos y buena capacidad de ahorro.',
            keyFindings: ['Ingreso estable', 'Capacidad de ahorro'],
            confidence: 'high',
          },
        ],
        finalSummary: {
          summary: 'Síntesis final consolidada sin transcripción.',
          keyFindings: ['No depende de transcript'],
          confidence: 'high',
          createdAt: new Date().toISOString(),
        },
        endedBy: 'user',
        durationSec: 0,
        callId: 'call-voice-test-2',
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.type).toBe('interview_complete');
    expect(res.body.data.voice_summary.executive_report).toBe('Resumen ejecutivo de prueba');
    expect(res.body.data.interview_voice.total_used_sec).toBe(44);
    expect(res.body.data.interview_voice.remaining_total_sec).toBe(
      INTERVIEW_TOTAL_LIMIT_SEC - 44,
    );
    expect(res.body.data.interview_voice.max_duration_sec).toBe(INTERVIEW_TOTAL_LIMIT_SEC);
  }, 15000);

  it('still completes finalize when diagnostic agent fails', async () => {
    const { runDiagnosticAgent } = await import('../agents/diagnostic/diagnostic.agent');
    vi.mocked(runDiagnosticAgent).mockRejectedValueOnce(new Error('LLM unavailable'));

    const { agent, csrfToken } = await createAuthedAgent();

    const res = await agent
      .post('/conversation/voice/finalize')
      .set('x-csrf-token', csrfToken)
      .send({
        intake: {
          hasDebt: true,
          tracksExpenses: false,
          moneyStressLevel: 7,
        },
        minuteSummaries: [
          {
            minute: 1,
            summary: 'El usuario describe presión por deuda y poca estructura de seguimiento.',
            keyFindings: ['Deuda activa', 'Seguimiento irregular'],
            confidence: 'medium',
          },
        ],
        finalSummary: {
          summary: 'Síntesis final con tensión entre deuda y falta de control operativo.',
          keyFindings: ['Presión financiera'],
          confidence: 'medium',
          createdAt: new Date().toISOString(),
        },
        endedBy: 'timeout',
        durationSec: 88,
        callId: 'call-voice-test-fallback',
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.type).toBe('interview_complete');
    expect(res.body.data.profile.diagnosticNarrative).toContain('Resumen ejecutivo de prueba');
    expect(res.body.data.voice_summary.diagnostic_fallback_used).toBe(true);
  }, 15000);
});
