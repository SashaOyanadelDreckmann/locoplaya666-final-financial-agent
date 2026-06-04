import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createApprovalToken } from '../services/approval.service';

let dataDir: string;

beforeAll(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'financial-agent-budget-chat-'));
  process.env.DATA_DIR = dataDir;
  process.env.NODE_ENV = 'test';
  process.env.WEB_ORIGIN = 'http://localhost:3001';
  process.env.LOG_LEVEL = 'error';
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
});

afterAll(() => {
  try {
    fs.rmSync(dataDir, { recursive: true, force: true });
  } catch {}
});

describe('budget-chat routes', () => {
  async function createAuthedAgent() {
    const { createApp } = await import('../app');
    const app = createApp();
    const agent = request.agent(app);
    const email = `budget-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`;
    const reg = await agent.post('/auth/register').send({
      name: 'Budget Tester',
      email,
      password: 'Secret123',
    });
    expect(reg.status).toBe(200);
    const userId = String(reg.body?.data?.user?.id ?? '');
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
    const csrfToken = String(sessionRes.headers['x-csrf-token'] ?? '');
    expect(csrfToken.length).toBeGreaterThan(0);
    return { agent, csrfToken };
  }

  it('answers education questions about fixed vs variable income', async () => {
    const { agent, csrfToken } = await createAuthedAgent();

    const res = await agent
      .post('/api/budget-chat')
      .set('x-csrf-token', csrfToken)
      .send({
      intent: 'reply',
      answer: 'que es un ingreso fijo y variable',
      question: 'Partamos por tu ingreso principal mensual',
      budgetRows: [{ id: 'income_salary', category: 'Ingreso principal', type: 'income', amount: 0 }],
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.source).toBe('deterministic_education');
    expect(String(res.body.assistant_reply)).toMatch(/fijo/i);
    expect(String(res.body.assistant_reply)).toMatch(/variable/i);
    expect(res.body.coach_message).toBeNull();
    expect(String(res.body.assistant_reply)).toBe(String(res.body.assistant_text));
  }, 15_000);

  it('does not treat hola + definitional question as pure greeting', async () => {
    const { agent, csrfToken } = await createAuthedAgent();

    const res = await agent
      .post('/api/budget-chat')
      .set('x-csrf-token', csrfToken)
      .send({
      intent: 'reply',
      answer: 'hola, que es un ingreso fijo y variable',
      question: 'Partamos por tu ingreso principal mensual',
      budgetRows: [{ id: 'income_salary', category: 'Ingreso principal', type: 'income', amount: 0 }],
    });

    expect(res.status).toBe(200);
    expect(res.body.source).toBe('deterministic_education');
    expect(String(res.body.assistant_reply)).toMatch(/ingreso fijo/i);
    expect(res.body.coach_message).toBeNull();
  }, 15_000);

  it('answers natural-language education questions without que es', async () => {
    const { agent, csrfToken } = await createAuthedAgent();

    const res = await agent
      .post('/api/budget-chat')
      .set('x-csrf-token', csrfToken)
      .send({
        intent: 'reply',
        answer: 'me explicas ingreso fijo y variable',
        question: 'Partamos por tu ingreso principal mensual',
        budgetRows: [{ id: 'income_salary', category: 'Ingreso principal', type: 'income', amount: 0 }],
      });

    expect(res.status).toBe(200);
    expect(res.body.source).toBe('deterministic_education');
    expect(String(res.body.assistant_reply)).toMatch(/fijo/i);
    expect(res.body.coach_message).toBeNull();
  }, 15_000);
});
