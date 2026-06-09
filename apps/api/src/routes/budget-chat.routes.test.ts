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
    expect(String(res.body.next_question || res.body.assistant_reply)).toMatch(/En la tabla aparece|ingreso|sueldo/i);
    expect(res.body.focus_row_id).toBe('income_salary');
  }, 15000);

  it('answers off-topic questions briefly and pivots back to the budget table', async () => {
    const { agent, csrfToken } = await createAuthedAgent();
    const budgetRows = [
      { id: 'income_salary', category: 'Sueldo líquido', type: 'income', amount: 0 },
      { id: 'expense_rent', category: 'Arriendo / vivienda', type: 'expense', amount: 0 },
    ];
    const res = await agent.post('/api/budget-chat').set('x-csrf-token', csrfToken).send({
      intent: 'reply',
      answer: 'cuantos satelites tiene la nasa en orbita?',
      question: '¿Cuál es tu ingreso mensual promedio en pesos?',
      assistantFocusRowId: 'income_salary',
      budgetRows,
    });

    expect(res.status).toBe(200);
    expect(res.body.source).toBe('deterministic_off_topic');
    expect(String(res.body.assistant_reply)).toMatch(/nasa|satelite/i);
    expect(String(res.body.assistant_reply)).toMatch(/presupuesto/i);
    expect(String(res.body.next_question)).toMatch(/\?/);
    expect(res.body.action).toBeNull();
  }, 15000);

  it('routes general inflation questions through off-topic instead of budget education', async () => {
    const { agent, csrfToken } = await createAuthedAgent();
    const res = await agent.post('/api/budget-chat').set('x-csrf-token', csrfToken).send({
      intent: 'reply',
      answer: 'que es la inflacion en chile',
      question: '¿Cuál es tu ingreso mensual promedio en pesos?',
      assistantFocusRowId: 'income_salary',
      budgetRows: [{ id: 'income_salary', category: 'Sueldo líquido', type: 'income', amount: 0 }],
    });

    expect(res.status).toBe(200);
    expect(res.body.source).toBe('deterministic_off_topic');
    expect(String(res.body.assistant_reply)).toMatch(/inflaci[oó]n|precios|banco central/i);
    expect(String(res.body.assistant_reply)).not.toMatch(/ingreso fijo se repite/i);
    expect(String(res.body.next_question)).toMatch(/\?/);
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
      question: '¿Cuál es el monto mensual de «Sueldo líquido»?',
      assistantFocusRowId: 'income_salary',
      budgetRows,
      chatAnswers: [
        {
          q: 'En la tabla aparece «Sueldo líquido» como ingreso. ¿Confirmas ese nombre o cómo quieres llamar este movimiento?',
          a: 'sí',
        },
      ],
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
      question: '¿Cuál es el monto mensual de «Sueldo líquido»?',
      budgetRows: [{ id: 'income_salary', category: 'Sueldo líquido', type: 'income', amount: 0, note: '' }],
      chatAnswers: [
        {
          q: 'En la tabla aparece «Sueldo líquido» como ingreso. ¿Confirmas ese nombre o cómo quieres llamar este movimiento?',
          a: 'sí',
        },
      ],
    });

    expect(res.status).toBe(200);
    expect(res.body.source).toBe('deterministic_update');
    expect(res.body.action?.id).toBe('income_salary');
    expect(res.body.action?.amount).toBe(850000);
  }, 15000);

  it('routes amount answers to the category mentioned in the reply instead of the stale rent question', async () => {
    const { agent, csrfToken } = await createAuthedAgent();
    const budgetRows = [
      { id: 'income_salary', category: 'Sueldo líquido', type: 'income', amount: 900000 },
      { id: 'expense_rent', category: 'Arriendo / vivienda', type: 'expense', amount: 0 },
      { id: 'expense_food', category: 'Alimentación', type: 'expense', amount: 0 },
    ];
    const res = await agent.post('/api/budget-chat').set('x-csrf-token', csrfToken).send({
      intent: 'reply',
      answer: 'en comida gasto 200 mil al mes',
      question: '¿Cuánto pagas al mes en vivienda o dividendo?',
      assistantFocusRowId: 'expense_rent',
      budgetRows,
    });

    expect(res.status).toBe(200);
    expect(res.body.source).toBe('deterministic_update');
    expect(res.body.action?.id).toBe('expense_food');
    expect(res.body.action?.amount).toBe(200000);
  }, 15000);

  it('asks for a concrete amount when the user mentions a category without numbers', async () => {
    const { agent, csrfToken } = await createAuthedAgent();
    const budgetRows = [
      { id: 'income_salary', category: 'Sueldo líquido', type: 'income', amount: 900000 },
      { id: 'expense_food', category: 'Alimentación', type: 'expense', amount: 0 },
    ];
    const res = await agent.post('/api/budget-chat').set('x-csrf-token', csrfToken).send({
      intent: 'reply',
      answer: 'gasto harto en comida fuera',
      question: '¿Cuánto pagas al mes en vivienda o dividendo?',
      assistantFocusRowId: 'expense_rent',
      budgetRows,
    });

    expect(res.status).toBe(200);
    expect(res.body.source).toBe('deterministic_category_clarify');
    expect(res.body.focus_row_id).toBe('expense_food');
    expect(String(res.body.assistant_reply)).toMatch(/comida/i);
    expect(String(res.body.assistant_reply)).not.toMatch(/^perfecto|^claro|^listo|^entendido/i);
    expect(String(res.body.next_question)).toMatch(/En la tabla aparece|Confirmas ese nombre/i);
  }, 15000);

  it('advances to the next unfilled row when the user answers off-topic without a category', async () => {
    const { agent, csrfToken } = await createAuthedAgent();
    const budgetRows = [
      { id: 'income_salary', category: 'Sueldo líquido', type: 'income', amount: 900000 },
      { id: 'expense_rent', category: 'Arriendo / vivienda', type: 'expense', amount: 0 },
      { id: 'expense_food', category: 'Alimentación', type: 'expense', amount: 0 },
    ];
    const res = await agent.post('/api/budget-chat').set('x-csrf-token', csrfToken).send({
      intent: 'reply',
      answer: 'prefiero seguir con otra cosa',
      question:
        'En la tabla aparece «Arriendo / vivienda» como gasto. ¿Confirmas ese nombre o cómo quieres llamar este movimiento?',
      assistantFocusRowId: 'expense_rent',
      budgetRows,
    });

    expect(res.status).toBe(200);
    expect(res.body.source).toBe('deterministic_advance_focus');
    expect(res.body.focus_row_id).toBe('expense_food');
    expect(String(res.body.next_question)).toMatch(/En la tabla aparece|Alimentación/i);
  }, 15000);

  it('requests confirmation before deleting all rows when asked in bulk', async () => {
    const { agent, csrfToken } = await createAuthedAgent();
    const budgetRows = [
      { id: 'income_salary', category: 'Sueldo líquido', type: 'income', amount: 900000 },
      { id: 'expense_food', category: 'Alimentación', type: 'expense', amount: 200000 },
      { id: 'expense_other', category: 'Otros gastos', type: 'expense', amount: 50000 },
    ];
    const res = await agent.post('/api/budget-chat').set('x-csrf-token', csrfToken).send({
      intent: 'reply',
      answer: 'elimina todas las filas',
      question: '¿Cuánto gastas al mes en comida y supermercado?',
      budgetRows,
    });

    expect(res.status).toBe(200);
    expect(res.body.source).toBe('deterministic_delete_all_confirm');
    expect(res.body.requires_confirmation).toBe(true);
    expect(res.body.pending_confirmation?.actions?.length).toBe(3);
    expect(String(res.body.pending_confirmation?.summary)).toMatch(/Eliminar 3 movimientos/i);
    expect(String(res.body.pending_confirmation?.summary)).not.toContain('expense_');
  }, 15000);

  it('requests confirmation before deleting a budget row', async () => {
    const { agent, csrfToken } = await createAuthedAgent();
    const budgetRows = [
      { id: 'income_salary', category: 'Sueldo líquido', type: 'income', amount: 900000 },
      { id: 'expense_other', category: 'Otros gastos', type: 'expense', amount: 50000 },
    ];
    const res = await agent.post('/api/budget-chat').set('x-csrf-token', csrfToken).send({
      intent: 'reply',
      answer: 'elimina otros gastos',
      question: '¿Qué otro gasto mensual recurrente quieres agregar?',
      budgetRows,
    });

    expect(res.status).toBe(200);
    expect(res.body.source).toBe('deterministic_delete_confirm');
    expect(res.body.requires_confirmation).toBe(true);
    expect(res.body.pending_confirmation?.actions?.[0]?.kind).toBe('delete');
    expect(res.body.actions).toEqual([]);
  }, 15000);

  it('updates cadence and payment fields after amount is set', async () => {
    const { agent, csrfToken } = await createAuthedAgent();
    const budgetRows = [
      { id: 'income_salary', category: 'Sueldo líquido', type: 'income', amount: 900000 },
      { id: 'expense_food', category: 'Alimentación', type: 'expense', amount: 250000 },
    ];
    const res = await agent.post('/api/budget-chat').set('x-csrf-token', csrfToken).send({
      intent: 'reply',
      answer: 'es fijo, pago con débito',
      question: 'Para «Alimentación», ¿el monto es fijo cada mes o varía mes a mes?',
      assistantFocusRowId: 'expense_food',
      budgetRows,
    });

    expect(res.status).toBe(200);
    expect(res.body.source).toBe('deterministic_field_update');
    expect(res.body.action?.cadence).toBe('fixed');
    expect(res.body.action?.payment_method).toBe('debit');
    expect(String(res.body.next_question)).toMatch(/tipo de movimiento|describe mejor/i);
  }, 15000);

  it('applies pending delete actions after an affirmative confirmation', async () => {
    const { agent, csrfToken } = await createAuthedAgent();
    const budgetRows = [
      { id: 'income_salary', category: 'Sueldo líquido', type: 'income', amount: 900000 },
      { id: 'expense_other', category: 'Otros gastos', type: 'expense', amount: 50000 },
    ];
    const res = await agent.post('/api/budget-chat').set('x-csrf-token', csrfToken).send({
      intent: 'reply',
      answer: 'sí',
      question: '¿Confirmas eliminar Otros gastos de la tabla?',
      budgetRows,
      pendingConfirmation: {
        summary: 'eliminar expense_other',
        actions: [{ kind: 'delete', id: 'expense_other' }],
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.source).toBe('deterministic_confirm_apply');
    expect(res.body.action?.kind).toBe('delete');
    expect(res.body.action?.id).toBe('expense_other');
    expect(res.body.requires_confirmation).toBeFalsy();
  }, 15000);

  it('updates cadence and payment from a free-form chat command mentioning the row', async () => {
    const { agent, csrfToken } = await createAuthedAgent();
    const budgetRows = [
      { id: 'income_salary', category: 'Sueldo líquido', type: 'income', amount: 900000 },
      { id: 'expense_food', category: 'Alimentación', type: 'expense', amount: 250000 },
    ];
    const res = await agent.post('/api/budget-chat').set('x-csrf-token', csrfToken).send({
      intent: 'reply',
      answer: 'alimentación es variable y la pago con tarjeta de crédito',
      question: '¿Qué otro gasto quieres revisar?',
      budgetRows,
    });

    expect(res.status).toBe(200);
    expect(res.body.source).toBe('deterministic_field_update');
    expect(res.body.action?.id).toBe('expense_food');
    expect(res.body.action?.cadence).toBe('variable');
    expect(res.body.action?.payment_method).toBe('credit');
  }, 15000);

  it('applies amount and metadata together in one chat turn', async () => {
    const { agent, csrfToken } = await createAuthedAgent();
    const budgetRows = [
      { id: 'income_salary', category: 'Sueldo líquido', type: 'income', amount: 900000 },
      { id: 'expense_transport', category: 'Transporte', type: 'expense', amount: 0 },
    ];
    const res = await agent.post('/api/budget-chat').set('x-csrf-token', csrfToken).send({
      intent: 'reply',
      answer: 'transporte 120 mil fijo con débito',
      question: '¿Cuál es el monto mensual de «Transporte»?',
      assistantFocusRowId: 'expense_transport',
      budgetRows,
      chatAnswers: [
        {
          q: 'En la tabla aparece «Transporte» como gasto. ¿Confirmas ese nombre o cómo quieres llamar este movimiento?',
          a: 'sí',
        },
      ],
    });

    expect(res.status).toBe(200);
    expect(res.body.source).toBe('deterministic_update');
    expect(res.body.action?.id).toBe('expense_transport');
    expect(res.body.action?.amount).toBe(120000);
    expect(res.body.action?.cadence).toBe('fixed');
    expect(res.body.action?.payment_method).toBe('debit');
  }, 15000);

  it('asks cadence on the same row right after setting its amount', async () => {
    const { agent, csrfToken } = await createAuthedAgent();
    const budgetRows = [
      { id: 'income_salary', category: 'Sueldo líquido', type: 'income', amount: 900000 },
      { id: 'expense_food', category: 'Alimentación', type: 'expense', amount: 0 },
    ];
    const res = await agent.post('/api/budget-chat').set('x-csrf-token', csrfToken).send({
      intent: 'reply',
      answer: '200000',
      question: '¿Cuál es el monto mensual de «Alimentación»?',
      assistantFocusRowId: 'expense_food',
      budgetRows,
      chatAnswers: [
        {
          q: 'En la tabla aparece «Alimentación» como gasto. ¿Confirmas ese nombre o cómo quieres llamar este movimiento?',
          a: 'sí',
        },
      ],
    });

    expect(res.status).toBe(200);
    expect(res.body.action?.amount).toBe(200000);
    expect(String(res.body.next_question)).toMatch(/fijo|variable|mes a mes/i);
    expect(res.body.focus_row_id).toBe('expense_food');
  }, 15000);

  it('confirms category before asking for monthly amount', async () => {
    const { agent, csrfToken } = await createAuthedAgent();
    const budgetRows = [
      { id: 'expense_food', category: 'Alimentación', type: 'expense', amount: 0 },
    ];
    const initRes = await agent.post('/api/budget-chat').set('x-csrf-token', csrfToken).send({
      intent: 'init',
      budgetRows,
      chatAnswers: [],
    });
    expect(initRes.status).toBe(200);
    expect(String(initRes.body.next_question)).toMatch(/En la tabla aparece/i);

    const confirmRes = await agent.post('/api/budget-chat').set('x-csrf-token', csrfToken).send({
      intent: 'reply',
      answer: 'sí',
      question: initRes.body.next_question,
      assistantFocusRowId: 'expense_food',
      budgetRows,
      chatAnswers: [],
    });
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.source).toBe('deterministic_category_update');
    expect(String(confirmRes.body.next_question)).toMatch(/monto mensual/i);
  }, 15000);

  it('updates movement type category from chat like the table selector', async () => {
    const { agent, csrfToken } = await createAuthedAgent();
    const budgetRows = [
      { id: 'income_salary', category: 'Sueldo líquido', type: 'income', amount: 900000 },
      { id: 'expense_other', category: 'Otros gastos', type: 'expense', amount: 80000 },
    ];
    const res = await agent.post('/api/budget-chat').set('x-csrf-token', csrfToken).send({
      intent: 'reply',
      answer: 'pon categoría alimentación',
      question: '¿Qué dato falta completar para otros gastos?',
      assistantFocusRowId: 'expense_other',
      budgetRows,
    });

    expect(res.status).toBe(200);
    expect(res.body.source).toBe('deterministic_field_update');
    expect(res.body.action?.movement_type).toBe('food');
  }, 15000);

  it('applies intake income when user confirms with sí on a profile-based question', async () => {
    const { agent, csrfToken } = await createAuthedAgent();
    const budgetRows = [{ id: 'income_salary', category: 'Sueldo líquido', type: 'income', amount: 0 }];
    const question =
      'Para «Sueldo líquido», según tu perfil ronda $1.450.000. ¿Cuál es el monto mensual?';

    const res = await agent.post('/api/budget-chat').set('x-csrf-token', csrfToken).send({
      intent: 'reply',
      answer: 'sí',
      question,
      assistantFocusRowId: 'income_salary',
      budgetRows,
      chatAnswers: [
        {
          q: 'En la tabla aparece «Sueldo líquido» como ingreso. ¿Confirmas ese nombre o cómo quieres llamar este movimiento?',
          a: 'sí',
        },
      ],
      intakeData: { exactMonthlyIncome: 1_450_000 },
      products: [
        {
          label: 'Cuenta demo',
          bank: 'Banco Demo',
          keyMetrics: { inflows_total: 1000, outflows_total: 0 },
        },
      ],
    });

    expect(res.status).toBe(200);
    expect(res.body.source).toBe('deterministic_update');
    expect(res.body.action?.id).toBe('income_salary');
    expect(res.body.action?.amount).toBe(1_450_000);
  }, 15000);

  it('uses transaction categories to personalize the first budget question on init', async () => {
    const { agent, csrfToken } = await createAuthedAgent();
    const res = await agent.post('/api/budget-chat').set('x-csrf-token', csrfToken).send({
      intent: 'init',
      budgetRows: [
        { id: 'income_salary', category: 'Sueldo líquido', type: 'income', amount: 0 },
        { id: 'expense_food', category: 'Alimentación', type: 'expense', amount: 0 },
      ],
      intakeData: { exactMonthlyIncome: 1200000, hasDebt: true },
      products: [
        {
          label: 'Cuenta vista',
          bank: 'Banco Estado',
          keyMetrics: { inflows_total: 1180000, outflows_total: 640000 },
          topCategories: [{ name: 'Supermercado Lider', amount: 210000 }],
        },
      ],
      chatAnswers: [],
    });

    expect(res.status).toBe(200);
    expect(String(res.body.next_question)).toMatch(/En la tabla aparece|Sueldo/i);
    expect(String(res.body.assistant_reply)).toMatch(/movimientos|perfil/i);
  }, 15000);
});
