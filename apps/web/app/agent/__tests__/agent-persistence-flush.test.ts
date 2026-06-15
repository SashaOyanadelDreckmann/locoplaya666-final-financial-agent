/** @jest-environment jsdom */

import {
  flushAgentPersistenceKeepalive,
  postJsonKeepalive,
} from '../utilidades/agent-persistence-flush';

describe('agent-persistence-flush', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockResolvedValue({ ok: true });
    global.fetch = fetchMock as unknown as typeof fetch;
    Object.defineProperty(document, 'cookie', {
      writable: true,
      value: 'csrf-token=test-token',
    });
    sessionStorage.setItem('__csrf_token', 'test-token');
  });

  afterEach(() => {
    jest.resetAllMocks();
    sessionStorage.clear();
  });

  it('posts keepalive payloads with csrf header', () => {
    postJsonKeepalive({
      path: '/api/sheets',
      method: 'POST',
      body: { sheets: [{ id: 'chat-1' }] },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/sheets'),
      expect.objectContaining({
        method: 'POST',
        keepalive: true,
        headers: expect.objectContaining({
          'X-CSRF-Token': 'test-token',
        }),
      }),
    );
  });

  it('flushes sheets, panel and social reflections together', () => {
    flushAgentPersistenceKeepalive({
      sheets: [{ id: 'chat-1' }],
      panelState: { budgetRows: [] },
      socialReflections: { answers: [], completedAt: '2026-01-01T00:00:00.000Z' },
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
