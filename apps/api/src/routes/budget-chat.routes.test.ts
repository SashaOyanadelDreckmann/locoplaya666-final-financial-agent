import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
      action: 'approve',
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
    return { agent, csrfToken: String(sessionRes.headers['x-csrf-token'] ?? '') };
  }

  it('returns deterministic init without calling a model', async () => {
    const { agent, csrfToken } = await createAuthedAgent();
    const res = await agent.post('/api/budget-chat').set('x-csrf-token', csrfToken).send({
      intent: 'init',
      budgetRows: [{ id: 'income_salary', category: 'Sueldo líquido', type: 'income', amount: 850000, note: '' }],
      chatAnswers: [{ q: 'old', a: '850000' }],
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.source).toBe('deterministic_init');
    expect(String(res.body.next_question || res.body.assistant_reply)).toMatch(/ingreso|sueldo/i);
    expect(res.body.focus_row_id).toBe('income_salary');
  }, 15000);

  it('answers education questions about fixed vs variable income', async () => {
    const { agent, csrfToken } = await createAuthedAgent();
    const res = await agent.post('/api/budget-chat').set('x-csrf-token', csrfToken).send({
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
  }, 15000);

  it('updates the row implied by the assistant question even when activeRow points elsewhere', async () => {
    const { agent, csrfToken } = await createAuthedAgent();
    const budgetRows = [
      { id: 'income_salary', category: 'Sueldo líquido', type: 'income', amount: 0 },
      { id: 'expense_rent', category: 'Arriendo / vivienda', type: 'expense', amount: 0 },
    ];
    const res = await agent.post('/api/budget-chat').set('x-csrf-token', csrfToken).send({
      intent: 'reply',
      answer: '850000',
      question: '¿Cuál es tu ingreso mensual promedio en pesos?',
      assistantFocusRowId: 'income_salary',
      budgetRows,
      activeRow: {
        id: 'expense_rent',
        category: 'Arriendo / vivienda',
        type: 'expense',
        amount: 0,
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.source).toBe('deterministic_update');
    expect(res.body.action?.id).toBe('income_salary');
    expect(res.body.action?.amount).toBe(850000);
  }, 15000);

  it('keeps contextual amount answers out of deterministic short-circuit', async () => {
    const { agent, csrfToken } = await createAuthedAgent();
    const res = await agent.post('/api/budget-chat').set('x-csrf-token', csrfToken).send({
      intent: 'reply',
      answer: 'son 850 mil liquidos al mes',
      question: '¿Cuánto es tu ingreso principal mensual?',
      budgetRows: [{ id: 'income_salary', category: 'Sueldo líquido', type: 'income', amount: 0, note: '' }],
    });

    expect(res.status).toBe(200);
    expect(res.body.source).not.toBe('deterministic_update');
  }, 15000);
});
