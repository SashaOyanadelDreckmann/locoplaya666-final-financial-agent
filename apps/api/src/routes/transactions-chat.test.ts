import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createApprovalToken } from '../services/approval.service';
import { createDocumentRecord } from '../persistence/repos';

const mockCreate = vi.fn();

vi.mock('openai', () => ({
  __esModule: true,
  default: vi.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
    responses: { create: mockCreate },
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
    return { agent, csrfToken: String(sessionRes.headers['x-csrf-token'] ?? ''), userId };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockResolvedValue({
      output_text: JSON.stringify({ summary: 'resumen ok' }),
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

  it('returns deterministic chat payload without calling the model for metric questions', async () => {
    const { agent, csrfToken } = await createAuthedAgent();
    const res = await agent.post('/api/transactions-chat').set('x-csrf-token', csrfToken).send({
      mode: 'chat',
      question: '¿Cuánto fueron mis egresos totales?',
      messages: [{ role: 'user', text: '¿Cuánto fueron mis egresos totales?' }],
      dashboard: {
        keyMetrics: { outflows_total: 450000, movement_count: 12 },
        movements: [],
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(String(res.body.assistant_text)).toContain('$450.000');
    expect(res.body.source).toBe('deterministic');
    expect(Array.isArray(res.body.suggested_followups)).toBe(true);
    expect(mockCreate).not.toHaveBeenCalled();
  }, 15000);

  it('returns chat payload', async () => {
    mockCreate.mockResolvedValueOnce({
      output_text: JSON.stringify({
        assistant_text: 'respuesta corta',
        suggested_followups: ['¿Cuánto fueron mis egresos?'],
        referenced_movement_keys: [],
      }),
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
    expect(res.body.suggested_followups).toEqual(['¿Cuánto fueron mis egresos?']);
    expect(res.body.source).toBe('llm');
    expect(mockCreate).toHaveBeenCalledTimes(1);
  }, 15000);

  it('keeps parsed documents in chat context', async () => {
    mockCreate.mockResolvedValueOnce({
      output_text: JSON.stringify({
        assistant_text: 'respuesta corta',
        suggested_followups: [],
        referenced_movement_keys: [],
      }),
    });
    const { agent, csrfToken } = await createAuthedAgent();
    await agent.post('/api/transactions-chat').set('x-csrf-token', csrfToken).send({
      mode: 'chat',
      question: 'qué ves',
      messages: [{ role: 'user', text: 'qué ves' }],
      dashboard: { keyMetrics: { movement_count: 0 }, retrieval: { mode: 'overview', matchedCount: 0 }, movements: [] },
      parsedDocuments: [
        {
          name: 'cartola.csv',
          text: '2026-05-01,ABONO,+1000',
        },
      ],
    });

    const callArgs = mockCreate.mock.calls[0]?.[0] as { input?: Array<{ role?: string; content?: string }> } | undefined;
    const userMessage = Array.isArray(callArgs?.input)
      ? callArgs.input.find((msg) => msg.role === 'user')
      : null;

    expect(String(userMessage?.content ?? '')).toContain('Documentos=');
    expect(String(userMessage?.content ?? '')).toContain('cartola.csv');
  }, 15000);

  it('rejects foreign document ids with a not found response', async () => {
    const { agent, csrfToken } = await createAuthedAgent();
    const res = await agent.post('/api/transactions-chat').set('x-csrf-token', csrfToken).send({
      mode: 'chat',
      question: 'hola',
      messages: [{ role: 'user', text: 'hola' }],
      dashboard: { keyMetrics: { movement_count: 0 }, retrieval: { mode: 'overview', matchedCount: 0 }, movements: [] },
      parsedDocuments: [
        {
          documentId: 'doc-inexistente',
          name: 'cartola.csv',
          text: '2026-05-01,ABONO,+1000',
        },
      ],
    });

    expect(res.status).toBe(404);
    expect(String(res.body.code ?? '')).toBe('NOT_FOUND');
    expect(String(res.body.detail ?? '')).toContain('No se encontró evidencia documental válida');
  }, 15000);

  it('keeps valid canonical documents when one referenced id is stale', async () => {
    mockCreate.mockResolvedValueOnce({
      output_text: JSON.stringify({
        assistant_text: 'respuesta corta',
        suggested_followups: [],
        referenced_movement_keys: [],
      }),
    });
    const { agent, csrfToken, userId } = await createAuthedAgent();
    const validDoc = await createDocumentRecord({
      userId,
      name: 'cartola-real.csv',
      kind: 'CSV',
      extractedText: '2026-05-01,ABONO,+1000',
      textPreview: '2026-05-01,ABONO,+1000',
      status: 'PARSED',
    });

    const res = await agent.post('/api/transactions-chat').set('x-csrf-token', csrfToken).send({
      mode: 'chat',
      question: 'hola',
      messages: [{ role: 'user', text: 'hola' }],
      dashboard: { keyMetrics: { movement_count: 0 }, retrieval: { mode: 'overview', matchedCount: 0 }, movements: [] },
      parsedDocuments: [
        {
          documentId: validDoc.id,
          name: 'cartola-real.csv',
          text: '2026-05-01,ABONO,+1000',
        },
        {
          documentId: 'doc-stale',
          name: 'cartola-stale.csv',
          text: '2026-05-02,ABONO,+2000',
        },
      ],
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  }, 15000);

  it('accepts long chat histories without rejecting the request', async () => {
    mockCreate.mockResolvedValueOnce({
      output_text: JSON.stringify({
        assistant_text: 'respuesta corta',
        suggested_followups: [],
        referenced_movement_keys: [],
      }),
    });
    const { agent, csrfToken } = await createAuthedAgent();
    const messages = Array.from({ length: 18 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' : 'assistant',
      text: `mensaje ${index + 1}`,
    }));

    const res = await agent.post('/api/transactions-chat').set('x-csrf-token', csrfToken).send({
      mode: 'chat',
      question: 'hola',
      messages,
      dashboard: { keyMetrics: { movement_count: 0 }, retrieval: { mode: 'overview', matchedCount: 0 }, movements: [] },
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  }, 15000);
});
