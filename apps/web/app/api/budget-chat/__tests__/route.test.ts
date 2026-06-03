/** @jest-environment node */

import { checkRateLimit } from '@/lib/rateLimit';
import { requireBackendSession } from '@/lib/serverAuth';
import { POST } from '../route';

const mockCreate = jest.fn();

jest.mock('@/lib/serverAuth', () => ({
  requireBackendSession: jest.fn(),
}));

jest.mock('@/lib/rateLimit', () => ({
  checkRateLimit: jest.fn(),
}));

jest.mock('@/lib/serverEnv', () => ({
  getServerEnv: jest.fn((key: string) => {
    const value = process.env[key];
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }),
}));

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockCreate,
      },
    },
  })),
}));

describe('budget-chat route', () => {
  const mockedRequireBackendSession = requireBackendSession as jest.MockedFunction<
    typeof requireBackendSession
  >;
  const mockedCheckRateLimit = checkRateLimit as jest.MockedFunction<typeof checkRateLimit>;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_MODEL;
    process.env.OPENAI_API_KEY = 'test-key';
    mockedRequireBackendSession.mockResolvedValue({ userId: 'u-1' });
    mockedCheckRateLimit.mockReturnValue({ ok: true });
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              assistant_text: 'ok',
              next_question: 'siguiente',
              focus_row_id: 'income_salary',
              action: {
                kind: 'update',
                id: 'income_salary',
                category: 'Sueldo',
                type: 'income',
                amount: 1200000,
                cadence: 'fixed',
                payment_method: 'transfer',
                movement_type: 'income_main',
              },
            }),
          },
        },
      ],
    });
  });

  it('returns 401 when user is not authenticated', async () => {
    mockedRequireBackendSession.mockRejectedValueOnce(new Error('UNAUTHENTICATED'));

    const req = new Request('http://localhost/api/budget-chat', {
      method: 'POST',
      body: JSON.stringify({ intent: 'init' }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('Not authenticated');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('returns 429 when rate limit is exceeded', async () => {
    mockedCheckRateLimit.mockReturnValueOnce({ ok: false, retryAfter: 33 });

    const req = new Request('http://localhost/api/budget-chat', {
      method: 'POST',
      body: JSON.stringify({ intent: 'reply', answer: 'hola' }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(429);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('Too many requests');
    expect(res.headers.get('Retry-After')).toBe('33');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid intent', async () => {
    const req = new Request('http://localhost/api/budget-chat', {
      method: 'POST',
      body: JSON.stringify({ intent: 'drop_database', answer: 'hola' }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('Invalid intent');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('returns deterministic fallback on init without calling OpenAI', async () => {
    const req = new Request('http://localhost/api/budget-chat', {
      method: 'POST',
      body: JSON.stringify({
        intent: 'init',
        budgetRows: [{ id: 'income_salary', category: 'Sueldo líquido', type: 'income', amount: 0 }],
      }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.focus_row_id).toBe('income_salary');
    expect(String(body.next_question)).toContain('ingreso principal mensual');
    expect(String(body.assistant_reply)).toContain('ingreso principal mensual');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('returns deterministic init even without OPENAI_API_KEY', async () => {
    delete process.env.OPENAI_API_KEY;

    const req = new Request('http://localhost/api/budget-chat', {
      method: 'POST',
      body: JSON.stringify({
        intent: 'init',
        budgetRows: [{ id: 'income_salary', category: 'Sueldo líquido', type: 'income', amount: 0 }],
      }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.source).toBe('deterministic_init');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('sanitizes/limits model response payload fields', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              assistant_text: 'x'.repeat(400),
              next_question: 'y'.repeat(400),
              focus_row_id: 'z'.repeat(200),
              actions: [
                {
                  kind: 'update',
                  id: 'income_salary',
                  category: 'Sueldo',
                  type: 'income',
                  amount: 'NaN',
                  cadence: 'oneoff',
                  payment_method: 'transfer',
                  movement_type: 'income_main',
                },
                {
                  kind: 'update',
                  id: '',
                  category: '',
                  type: 'income',
                  amount: 500,
                },
              ],
            }),
          },
        },
      ],
    });

    const req = new Request('http://localhost/api/budget-chat', {
      method: 'POST',
      body: JSON.stringify({
        intent: 'reply',
        answer: 'a'.repeat(9000),
        question: 'q'.repeat(4000),
        activeRow: { id: 'income_salary', category: 'Sueldo', type: 'income', amount: 1000000 },
        budgetRows: new Array(40).fill(null).map((_, i) => ({
          id: `row-${i}`,
          category: `cat-${i}`,
          type: i % 2 === 0 ? 'income' : 'expense',
          amount: i * 1000,
        })),
      }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(String(body.assistant_text).length).toBeLessThanOrEqual(220);
    expect(String(body.next_question).length).toBeLessThanOrEqual(220);
    expect(String(body.focus_row_id).length).toBeLessThanOrEqual(80);
    expect(Array.isArray(body.actions)).toBe(true);
    expect(body.actions).toHaveLength(1);
    expect(String(body.assistant_text)).toContain(String(body.assistant_reply));
    expect(body.actions[0]).toMatchObject({
      id: 'income_salary',
      amount: 0,
      cadence: 'variable',
      payment_method: 'transfer',
      movement_type: 'income_main',
    });
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('returns 400 for invalid json body', async () => {
    const req = new Request('http://localhost/api/budget-chat', {
      method: 'POST',
      body: '{"intent":"reply"',
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('Invalid JSON body');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('returns 413 for oversized body', async () => {
    const req = new Request('http://localhost/api/budget-chat', {
      method: 'POST',
      body: 'x'.repeat(32_001),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(413);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('Payload too large');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('falls back safely when model call fails', async () => {
    mockCreate.mockRejectedValueOnce(new Error('upstream failed'));

    const req = new Request('http://localhost/api/budget-chat', {
      method: 'POST',
      body: JSON.stringify({
        intent: 'reply',
        question: '¿cuánto ganas?',
        activeRow: { id: 'income_salary', category: 'Sueldo', type: 'income', amount: 0 },
        budgetRows: [{ id: 'income_salary', category: 'Sueldo', type: 'income', amount: 0 }],
      }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.source).toBe('model_failure');
    expect(body.actions).toEqual([]);
    expect(body.focus_row_id).toBe('income_salary');
  });

  it('falls back safely when model returns invalid json', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'not-json' } }],
    });

    const req = new Request('http://localhost/api/budget-chat', {
      method: 'POST',
      body: JSON.stringify({
        intent: 'reply',
        question: '¿cuánto ganas?',
        activeRow: { id: 'income_salary', category: 'Sueldo', type: 'income', amount: 0 },
        budgetRows: [{ id: 'income_salary', category: 'Sueldo', type: 'income', amount: 0 }],
      }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.source).toBe('invalid_model_json');
    expect(body.actions).toEqual([]);
    expect(body.focus_row_id).toBe('income_salary');
  });

  it('blocks delete actions without explicit destructive intent', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              assistant_reply: 'Listo',
              next_question: '¿Seguimos?',
              action: { kind: 'delete', id: 'expense_food' },
            }),
          },
        },
      ],
    });

    const req = new Request('http://localhost/api/budget-chat', {
      method: 'POST',
      body: JSON.stringify({
        intent: 'reply',
        answer: 'son 45000',
        budgetRows: [{ id: 'expense_food', category: 'Comida', type: 'expense', amount: 30000 }],
      }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.actions).toEqual([]);
    expect(body.action).toBeNull();
  });

  it('allows delete actions with explicit destructive intent', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              assistant_reply: 'Listo',
              next_question: '¿Seguimos?',
              action: { kind: 'delete', id: 'expense_food' },
            }),
          },
        },
      ],
    });

    const req = new Request('http://localhost/api/budget-chat', {
      method: 'POST',
      body: JSON.stringify({
        intent: 'reply',
        answer: 'elimina comida del presupuesto',
        budgetRows: [{ id: 'expense_food', category: 'Comida', type: 'expense', amount: 30000 }],
      }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.actions).toEqual([{ kind: 'delete', id: 'expense_food' }]);
    expect(body.action).toEqual({ kind: 'delete', id: 'expense_food' });
  });

  it('rewrites add into update when the row already exists', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              assistant_reply: 'Actualizado',
              next_question: '¿Seguimos?',
              action: {
                kind: 'add',
                id: 'income_salary',
                category: 'Sueldo',
                type: 'income',
                amount: 1500000,
                cadence: 'fixed',
                payment_method: 'transfer',
                movement_type: 'income_main',
              },
            }),
          },
        },
      ],
    });

    const req = new Request('http://localhost/api/budget-chat', {
      method: 'POST',
      body: JSON.stringify({
        intent: 'reply',
        answer: 'mi sueldo es 1500000',
        budgetRows: [{ id: 'income_salary', category: 'Sueldo', type: 'income', amount: 1000000 }],
      }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.actions[0]).toMatchObject({
      kind: 'update',
      id: 'income_salary',
      amount: 1500000,
    });
  });

  it('blocks update to unknown rows unless the user explicitly asked to add one', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              assistant_reply: 'Listo',
              next_question: '¿Seguimos?',
              action: {
                kind: 'update',
                id: 'expense-custom-delivery',
                category: 'Delivery',
                type: 'expense',
                amount: 35910,
                cadence: 'variable',
                payment_method: 'debit',
                movement_type: 'food',
              },
            }),
          },
        },
      ],
    });

    const req = new Request('http://localhost/api/budget-chat', {
      method: 'POST',
      body: JSON.stringify({
        intent: 'reply',
        answer: 'gasto 35910 en delivery',
        budgetRows: [{ id: 'expense_food', category: 'Comida', type: 'expense', amount: 30000 }],
      }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.actions).toEqual([]);
  });

  it('promotes update to add for unknown rows when the user explicitly asks to add', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              assistant_reply: 'Listo',
              next_question: '¿Seguimos?',
              action: {
                kind: 'update',
                id: 'expense-custom-delivery',
                category: 'Delivery',
                type: 'expense',
                amount: 35910,
                cadence: 'variable',
                payment_method: 'debit',
                movement_type: 'food',
              },
            }),
          },
        },
      ],
    });

    const req = new Request('http://localhost/api/budget-chat', {
      method: 'POST',
      body: JSON.stringify({
        intent: 'reply',
        answer: 'agrega delivery por 35910',
        budgetRows: [{ id: 'expense_food', category: 'Comida', type: 'expense', amount: 30000 }],
      }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.actions[0]).toMatchObject({
      kind: 'add',
      id: 'expense-custom-delivery',
      category: 'Delivery',
      amount: 35910,
    });
  });

  it('returns fallback reply without OPENAI_API_KEY', async () => {
    delete process.env.OPENAI_API_KEY;

    const req = new Request('http://localhost/api/budget-chat', {
      method: 'POST',
      body: JSON.stringify({ intent: 'reply', answer: 'hola' }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.source).toBe('missing_provider_key');
    expect(typeof body.assistant_reply).toBe('string');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('updates the active row deterministically when the amount is clear', async () => {
    const req = new Request('http://localhost/api/budget-chat', {
      method: 'POST',
      body: JSON.stringify({
        intent: 'reply',
        answer: 'mi sueldo es 1.450.000 por transferencia',
        activeRow: { id: 'income_salary', category: 'Sueldo', type: 'income', amount: 1000000 },
        budgetRows: [{ id: 'income_salary', category: 'Sueldo', type: 'income', amount: 1000000 }],
      }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.provider).toBe('deterministic');
    expect(body.source).toBe('deterministic_update');
    expect(body.actions[0]).toMatchObject({
      kind: 'update',
      id: 'income_salary',
      amount: 1450000,
      payment_method: 'transfer',
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('returns a deterministic budget review without calling the model', async () => {
    const req = new Request('http://localhost/api/budget-chat', {
      method: 'POST',
      body: JSON.stringify({
        intent: 'reply',
        answer: 'como voy con el presupuesto?',
        budgetRows: [
          { id: 'income_salary', category: 'Sueldo', type: 'income', amount: 1500000 },
          { id: 'expense_rent', category: 'Arriendo', type: 'expense', amount: 600000 },
          { id: 'expense_food', category: 'Comida', type: 'expense', amount: 180000 },
        ],
      }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.provider).toBe('deterministic');
    expect(body.source).toBe('deterministic_status');
    expect(String(body.assistant_reply)).toContain('ingresos por');
    expect(body.actions).toEqual([]);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
