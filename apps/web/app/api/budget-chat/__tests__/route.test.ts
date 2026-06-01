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
    expect(String(body.next_question)).toContain('Sueldo líquido');
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
    expect(body.actions[0]).toMatchObject({
      id: 'income_salary',
      amount: 0,
      cadence: 'variable',
      payment_method: 'transfer',
      movement_type: 'income_main',
    });
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});
