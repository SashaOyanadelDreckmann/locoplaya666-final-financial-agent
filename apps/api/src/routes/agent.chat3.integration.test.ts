import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { replaceIntakeEnvelopeForDev, saveUserMemoryBlob } from '../services/user.service';
import { createApprovalToken } from '../services/approval.service';
import { defaultProductLifecycleState } from '../services/product-lifecycle.service';

const runCoreAgentMock = vi.fn();

vi.mock('../agents/core.agent/core-agent-orchestrator', () => ({
  runCoreAgent: (...args: unknown[]) => runCoreAgentMock(...args),
}));

let dataDir: string;

beforeAll(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'financial-agent-chat3-'));
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

async function createAuthedAgent() {
  const { createApp } = await import('../app');
  const app = createApp();
  const agent = request.agent(app);
  const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const email = `chat3-${suffix}@example.com`;

  const registerRes = await agent.post('/auth/register').send({
    name: 'Chat 3 Integration Test',
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
  return {
    agent,
    userId,
    csrfToken: String(sessionRes.headers['x-csrf-token'] ?? ''),
  };
}

async function unlockChat3(userId: string) {
  const lifecycle = {
    ...defaultProductLifecycleState(),
    phase: 'diagnosis_ready',
    unlockedChats: ['chat-1', 'chat-2', 'chat-3'],
    chatTurns: { 'chat-1': 0, 'chat-2': 0, 'chat-3': 0 },
  };
  await saveUserMemoryBlob(userId, { productLifecycle: lifecycle });
}

describe('chat-3 integration', () => {
  it('persists social reflections and hydrates them into agent context', async () => {
    const { agent, userId, csrfToken } = await createAuthedAgent();
    const intakeOk = await replaceIntakeEnvelopeForDev(userId, {
      intake: { profession: 'Filósofa' },
      intakeContext: { financialLiteracy: 'high' },
    });
    expect(intakeOk).toBe(true);
    await unlockChat3(userId);

    const saveRes = await agent
      .put('/api/agent/social-reflections')
      .set('x-csrf-token', csrfToken)
      .send({
        answers: [
          {
            questionId: 'q-freedom',
            question: '¿En qué punto el ahorro deja de ser prudencia?',
            choiceId: 'anxiety',
            choiceLabel: 'Cuando el número importa más que vivir',
          },
        ],
        completedAt: new Date().toISOString(),
      });
    expect(saveRes.status).toBe(200);

    const sessionRes = await agent.get('/api/session');
    expect(sessionRes.body?.data?.socialConsciousnessReflections?.answers).toHaveLength(1);

    runCoreAgentMock.mockReset();
    runCoreAgentMock.mockResolvedValue({
      message: 'Reflexionemos sobre tus valores.',
      mode: 'information',
      tool_calls: [],
      agent_blocks: [],
      artifacts: [],
      citations: [],
      compliance: {
        mode: 'information',
        no_auto_execution: true,
        includes_recommendation: false,
        includes_simulation: false,
        includes_regulation: false,
        missing_information: [],
        disclaimers_shown: [],
        risk_score: 0,
        blocked: { is_blocked: false },
      },
      state_updates: {},
      suggested_replies: ['¿El dinero compra libertad real?'],
      budget_updates: [],
      knowledge_score: 0,
      knowledge_event_detected: false,
      meta: {},
    });

    const res = await agent
      .post('/api/agent')
      .set('x-csrf-token', csrfToken)
      .send({
        user_message: '¿El dinero compra libertad real?',
        history: [],
        context: {
          uploaded_documents: [{ name: 'cartola.csv', text: 'Fecha;Detalle;Cargo;Abono;Saldo' }],
          injected_budget: { income: 1800000, expenses: 1200000, balance: 600000 },
          product_lifecycle: { interviewCompleted: true },
        },
        ui_state: {
          active_chat: { id: 'chat-3', label: '3', name: 'Conciencia social' },
          unlocked_modules: { post_diagnosis_chats: true },
          budget_summary: { income: 1800000, expenses: 1200000, balance: 600000 },
        },
      });

    expect(res.status).toBe(200);
    expect(res.body?.data?.compliance?.blocked?.is_blocked).not.toBe(true);
    expect(runCoreAgentMock).toHaveBeenCalledTimes(1);
    const input = runCoreAgentMock.mock.calls[0]?.[0] as {
      context?: { social_consciousness_reflections?: unknown[] };
      ui_state?: { active_chat?: { id?: string } };
    };
    expect(input.ui_state?.active_chat?.id).toBe('chat-3');
    expect(Array.isArray(input.context?.social_consciousness_reflections)).toBe(true);
    expect(input.context?.social_consciousness_reflections?.length).toBe(1);
    expect(res.body?.data?.suggested_replies?.[0]).toMatch(/libertad/i);
  }, 15000);
});
