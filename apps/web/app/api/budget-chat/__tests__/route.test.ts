/** @jest-environment node */

import { requireBackendSession } from '@/lib/serverAuth';
import { POST } from '../route';

jest.mock('@/lib/serverAuth', () => ({
  requireBackendSession: jest.fn(),
}));

describe('budget-chat route proxy', () => {
  const mockedRequireBackendSession = requireBackendSession as jest.MockedFunction<
    typeof requireBackendSession
  >;
  const fetchMock = jest.spyOn(global, 'fetch');

  beforeEach(() => {
    jest.clearAllMocks();
    mockedRequireBackendSession.mockResolvedValue({ userId: 'u-1' });
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true, assistant_text: 'ok', source: 'budget_agent_init' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });

  afterAll(() => {
    fetchMock.mockRestore();
  });

  it('returns 401 when user is not authenticated', async () => {
    mockedRequireBackendSession.mockRejectedValueOnce(new Error('UNAUTHENTICATED'));
    const req = new Request('http://localhost/api/budget-chat', {
      method: 'POST',
      body: JSON.stringify({ intent: 'init', budgetRows: [] }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('Not authenticated');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards the request body to the API proxy', async () => {
    const req = new Request('http://localhost/api/budget-chat', {
      method: 'POST',
      headers: {
        cookie: 'session=abc; csrf-token=test-csrf',
        'x-csrf-token': 'test-csrf',
      },
      body: JSON.stringify({ intent: 'init', budgetRows: [] }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/budget-chat'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          cookie: 'session=abc; csrf-token=test-csrf',
          'x-csrf-token': 'test-csrf',
        }),
      }),
    );
  });
});
