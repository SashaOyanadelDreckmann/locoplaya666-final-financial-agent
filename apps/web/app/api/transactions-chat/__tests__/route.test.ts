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

describe('transactions-chat route', () => {
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
      choices: [{ message: { content: JSON.stringify({ assistant_text: 'ok', summary: 'ok' }) } }],
    });
  });

  function buildReq(body: unknown) {
    return new Request('http://localhost/api/transactions-chat', {
      method: 'POST',
      headers: {
        cookie: 'csrf-token=test-csrf',
        'x-csrf-token': 'test-csrf',
      },
      body: JSON.stringify(body),
    });
  }

  it('returns 401 when user is not authenticated', async () => {
    mockedRequireBackendSession.mockRejectedValueOnce(new Error('UNAUTHENTICATED'));
    const req = buildReq({ mode: 'chat', messages: [] });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('Not authenticated');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('returns 429 when rate limit is exceeded', async () => {
    mockedCheckRateLimit.mockReturnValueOnce({ ok: false, retryAfter: 15 });
    const req = buildReq({ mode: 'chat', messages: [] });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(429);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('Too many requests');
    expect(res.headers.get('Retry-After')).toBe('15');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid mode', async () => {
    const req = buildReq({ mode: 'drop_db' });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('Invalid mode');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('returns summary payload in summary mode', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({ summary: 'resumen premium' }) } }],
    });
    const req = buildReq({
      mode: 'summary',
      product: { bank: 'Banco', label: 'TC', productType: 'credit_card' },
      parsedDocuments: [],
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.summary).toBe('resumen premium');
    expect(typeof body.model).toBe('string');
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('returns assistant text in chat mode', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({ assistant_text: 'respuesta corta' }) } }],
    });
    const req = buildReq({
      mode: 'chat',
      messages: [{ role: 'user', text: 'hola' }],
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.assistant_text).toBe('respuesta corta');
    expect(typeof body.model).toBe('string');
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('falls back safely when the model returns malformed JSON', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'not-json' } }],
    });
    const req = buildReq({
      mode: 'chat',
      messages: [{ role: 'user', text: 'hola' }],
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.assistant_text).toBe('Listo.');
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('returns 403 when csrf token is missing', async () => {
    const req = new Request('http://localhost/api/transactions-chat', {
      method: 'POST',
      body: JSON.stringify({ mode: 'chat', messages: [] }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('CSRF token invalid or missing');
  });
});
