/** @jest-environment node */

import { requireBackendSession } from '@/lib/serverAuth';
import { POST } from '../route';

jest.mock('@/lib/serverAuth', () => ({
  requireBackendSession: jest.fn(),
}));

describe('transcribe route proxy', () => {
  const mockedRequireBackendSession = requireBackendSession as jest.MockedFunction<
    typeof requireBackendSession
  >;
  const fetchMock = jest.spyOn(global, 'fetch');

  beforeEach(() => {
    jest.clearAllMocks();
    mockedRequireBackendSession.mockResolvedValue({ userId: 'u-1' });
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ text: 'hola mundo' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });

  afterAll(() => {
    fetchMock.mockRestore();
  });

  it('rejects unauthenticated requests', async () => {
    mockedRequireBackendSession.mockRejectedValueOnce(new Error('UNAUTHENTICATED'));
    const req = new Request('http://localhost/api/transcribe', { method: 'POST' });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe('Not authenticated');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
