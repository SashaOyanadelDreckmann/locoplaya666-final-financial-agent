import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../agents/diagnostic/diagnostic.agent', () => ({
  runDiagnosticAgent: vi.fn(async () => ({
    version: 'v2',
    meta: {
      completeness: 0.9,
      blocksExplored: ['warmup'],
      blocksSkipped: [],
      completedAt: new Date().toISOString(),
    },
    blocks: {},
    diagnosticNarrative: 'Diagnóstico persistido de integración',
    profile: {
      financialClarity: 'medium',
      decisionStyle: 'mixed',
      timeHorizon: 'mixed',
      financialPressure: 'moderate',
      emotionalPattern: 'neutral',
      coherenceScore: 0.72,
    },
    tensions: ['Tensión de prueba'],
    hypotheses: ['Hipótesis de prueba'],
    openQuestions: ['Pregunta abierta de prueba'],
    editorial: {
      headline: 'Diagnóstico integrado',
      dek: 'Lectura consolidada',
      keySignals: ['Señal 1'],
      scorecard: [],
      cashflowBuckets: [],
      pressurePoints: [],
    },
  })),
}));

vi.mock('../services/llm.service', () => ({
  completeStructured: vi.fn(async () => ({
    executive_report: 'Resumen ejecutivo persistido',
    key_findings: ['Hallazgo persistido'],
    confidence: 'high',
    stop_reason: 'agent',
    has_enough_information: true,
  })),
}));

vi.mock('../services/knowledge.service', () => ({
  recordKnowledgeEvent: vi.fn(async () => undefined),
}));

vi.mock('../services/memory.service', () => ({
  appendMemoryTimelineNote: vi.fn(),
}));

let dataDir: string;

beforeAll(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'financial-agent-diagnosis-persist-'));
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

describe('diagnosis persistence integration', () => {
  it('persists profile on voice finalize and hydrates session + latest endpoint', async () => {
    const request = (await import('supertest')).default;
    const { createApp } = await import('../app');
    const { createApprovalToken } = await import('./approval.service');
    const app = createApp();
    const agent = request.agent(app);
    const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const email = `diag-${suffix}@example.com`;

    const registerRes = await agent.post('/auth/register').send({
      name: 'Diagnosis Persist',
      email,
      password: 'Secret123',
    });
    expect(registerRes.status).toBe(200);
    const userId = String(registerRes.body?.data?.user?.id ?? '');
    const token = createApprovalToken({
      userId,
      adminEmail: 'sasha.oyanadel@ug.uchile.cl',
    });
    await request(app).get(`/auth/approve?token=${encodeURIComponent(token)}`);
    await agent.post('/auth/login').send({ email, password: 'Secret123' });

    const sessionRes = await agent.get('/api/session');
    const csrfToken = String(sessionRes.headers['x-csrf-token']);

    const finalizeRes = await agent
      .post('/conversation/voice/finalize')
      .set('x-csrf-token', csrfToken)
      .send({
        intake: { hasDebt: false, hasSavingsOrInvestments: true },
        minuteSummaries: [
          {
            minute: 1,
            summary: 'Usuario estable con ahorro moderado.',
            keyFindings: ['Ahorro moderado'],
            confidence: 'high',
          },
        ],
        finalSummary: {
          summary: 'Síntesis final persistida',
          keyFindings: ['Persistencia'],
          confidence: 'high',
          createdAt: new Date().toISOString(),
        },
        endedBy: 'agent',
        durationSec: 42,
        callId: `call-${suffix}`,
      });

    expect(finalizeRes.status).toBe(200);
    expect(finalizeRes.body.data.type).toBe('interview_complete');
    expect(finalizeRes.body.data.profile.diagnosticNarrative).toBe('Diagnóstico persistido de integración');

    const sessionAfter = await agent.get('/api/session');
    expect(sessionAfter.status).toBe(200);
    expect(sessionAfter.body.data.latestDiagnosticCompletedAt).toBeTruthy();
    expect(sessionAfter.body.data.latestDiagnosticProfileId).toBeTruthy();
    expect(sessionAfter.body.data.injectedProfile?.diagnosticNarrative).toBe(
      'Diagnóstico persistido de integración',
    );

    const latestRes = await agent.get('/diagnosis/latest');
    expect(latestRes.status).toBe(200);
    expect(latestRes.body.data.diagnosticNarrative).toBe('Diagnóstico persistido de integración');
    expect(latestRes.body.data.tensions).toContain('Tensión de prueba');
  }, 20000);

  it('lazy-backfills injectedProfile for legacy users with stored profile id only', async () => {
    const request = (await import('supertest')).default;
    const { createApp } = await import('../app');
    const { createApprovalToken } = await import('./approval.service');
    const { patchUserRecord } = await import('../persistencia/repos');
    const { loadUserById } = await import('./user.service');
    const { resolveUserDiagnosticProfile } = await import('./diagnostic-profile.service');

    const app = createApp();
    const agent = request.agent(app);
    const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const email = `legacy-${suffix}@example.com`;

    const registerRes = await agent.post('/auth/register').send({
      name: 'Legacy Diagnosis',
      email,
      password: 'Secret123',
    });
    const userId = String(registerRes.body?.data?.user?.id ?? '');
    const token = createApprovalToken({
      userId,
      adminEmail: 'sasha.oyanadel@ug.uchile.cl',
    });
    await request(app).get(`/auth/approve?token=${encodeURIComponent(token)}`);
    await agent.post('/auth/login').send({ email, password: 'Secret123' });

    const sessionRes = await agent.get('/api/session');
    const csrfToken = String(sessionRes.headers['x-csrf-token']);

    const finalizeRes = await agent
      .post('/conversation/voice/finalize')
      .set('x-csrf-token', csrfToken)
      .send({
        intake: { hasDebt: false },
        minuteSummaries: [{ minute: 1, summary: 'Legacy summary', keyFindings: ['Legacy'] }],
        finalSummary: { summary: 'Legacy final', keyFindings: ['Legacy'] },
        endedBy: 'agent',
        durationSec: 12,
        callId: `legacy-${suffix}`,
      });
    expect(finalizeRes.status).toBe(200);
    const profileId = String(finalizeRes.body?.data?.profile ? sessionRes.body?.data?.latestDiagnosticProfileId : '');
    const sessionAfterFinalize = await agent.get('/api/session');
    const linkedProfileId = String(sessionAfterFinalize.body?.data?.latestDiagnosticProfileId ?? '');
    expect(linkedProfileId.length).toBeGreaterThan(0);

    await patchUserRecord(userId, { injectedProfile: null });
    const before = await loadUserById(userId);
    expect(before?.injectedProfile).toBeFalsy();

    const resolved = await resolveUserDiagnosticProfile({
      id: userId,
      latestDiagnosticProfileId: linkedProfileId || profileId,
    });
    expect(resolved?.diagnosticNarrative).toBe('Diagnóstico persistido de integración');

    await new Promise((resolve) => setTimeout(resolve, 30));

    const after = await loadUserById(userId);
    expect(after?.injectedProfile).toBeTruthy();
    expect((after?.injectedProfile as { diagnosticNarrative?: string })?.diagnosticNarrative).toBe(
      'Diagnóstico persistido de integración',
    );
  }, 20000);

  it('exposes resolved profile through GET /api/session after finalize', async () => {
    const request = (await import('supertest')).default;
    const { createApp } = await import('../app');
    const { createApprovalToken } = await import('./approval.service');
    const app = createApp();
    const agent = request.agent(app);
    const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const email = `session-${suffix}@example.com`;

    const registerRes = await agent.post('/auth/register').send({
      name: 'Session Diagnosis',
      email,
      password: 'Secret123',
    });
    const userId = String(registerRes.body?.data?.user?.id ?? '');
    const token = createApprovalToken({
      userId,
      adminEmail: 'sasha.oyanadel@ug.uchile.cl',
    });
    await request(app).get(`/auth/approve?token=${encodeURIComponent(token)}`);
    await agent.post('/auth/login').send({ email, password: 'Secret123' });

    const sessionBefore = await agent.get('/api/session');
    expect(sessionBefore.body.data.injectedProfile).toBeFalsy();

    const csrfToken = String(sessionBefore.headers['x-csrf-token']);
    const finalizeRes = await agent
      .post('/conversation/voice/finalize')
      .set('x-csrf-token', csrfToken)
      .send({
        intake: { hasDebt: true },
        minuteSummaries: [{ minute: 1, summary: 'Sesión integrada', keyFindings: ['Sesión'] }],
        finalSummary: { summary: 'Sesión final', keyFindings: ['Sesión'] },
        endedBy: 'agent',
        durationSec: 20,
        callId: `session-${suffix}`,
      });
    expect(finalizeRes.status).toBe(200);

    const sessionAfter = await agent.get('/api/session');
    expect(sessionAfter.body.data.latestDiagnosticCompletedAt).toBeTruthy();
    expect(sessionAfter.body.data.injectedProfile?.diagnosticNarrative).toBe(
      'Diagnóstico persistido de integración',
    );
  }, 20000);
});
