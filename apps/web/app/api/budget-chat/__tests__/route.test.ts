/** @jest-environment node */

import { getApiBaseUrl } from '@/lib/apiBase';
import { checkRateLimit } from '@/lib/rateLimit';
import { requireBackendSession } from '@/lib/serverAuth';
import { POST } from '../route';

jest.mock('@/lib/serverAuth', () => ({
  requireBackendSession: jest.fn(),
}));

jest.mock('@/lib/rateLimit', () => ({
  checkRateLimit: jest.fn(),
}));

jest.mock('@/lib/apiBase', () => ({
  getApiBaseUrl: jest.fn(),
}));

describe('budget-chat route', () => {
  const mockedRequireBackendSession = requireBackendSession as jest.MockedFunction<
    typeof requireBackendSession
  >;
  const mockedCheckRateLimit = checkRateLimit as jest.MockedFunction<typeof checkRateLimit>;
  const mockedGetApiBaseUrl = getApiBaseUrl as jest.MockedFunction<typeof getApiBaseUrl>;
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetApiBaseUrl.mockReturnValue('http://localhost:3001');
    mockedRequireBackendSession.mockResolvedValue({ userId: 'u-1' });
    mockedCheckRateLimit.mockReturnValue({ ok: true });
    global.fetch = fetchMock as unknown as typeof fetch;
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
    expect(fetchMock).not.toHaveBeenCalled();
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
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('proxies body and auth headers to backend budget-chat endpoint', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          source: 'deterministic_init',
          assistant_reply: 'hola',
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );

    const payload = { intent: 'init', budgetRows: [{ id: 'income_salary', type: 'income', amount: 0 }] };
    const req = new Request('http://localhost/api/budget-chat', {
      method: 'POST',
      headers: {
        cookie: 'sid=abc123',
        'x-csrf-token': 'csrf-token',
      },
      body: JSON.stringify(payload),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.source).toBe('deterministic_init');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/api/budget-chat',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          cookie: 'sid=abc123',
          'x-csrf-token': 'csrf-token',
        }),
        body: JSON.stringify(payload),
      }),
    );
  });

  it('passes through backend error responses and status code', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false, error: 'Invalid intent' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const req = new Request('http://localhost/api/budget-chat', {
      method: 'POST',
      body: JSON.stringify({ intent: 'drop_database', answer: 'hola' }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('Invalid intent');
  });

  it('forwards backend 500 payload as-is', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false, error: 'Upstream failure' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const req = new Request('http://localhost/api/budget-chat', {
      method: 'POST',
      body: JSON.stringify({ intent: 'reply', answer: 'hola' }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('Upstream failure');
  });

  it('wraps non-JSON upstream responses without crashing', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('<html>oops</html>', {
        status: 502,
        headers: { 'content-type': 'text/html' },
      }),
    );

    const req = new Request('http://localhost/api/budget-chat', {
      method: 'POST',
      body: JSON.stringify({ intent: 'reply', answer: 'hola' }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.ok).toBe(false);
    expect(String(body.error)).toMatch(/invalid upstream response/i);
  });

  it('returns 502 when the upstream request fails', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));

    const req = new Request('http://localhost/api/budget-chat', {
      method: 'POST',
      body: JSON.stringify({ intent: 'reply', answer: 'hola' }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('Upstream request failed');
  });
});
