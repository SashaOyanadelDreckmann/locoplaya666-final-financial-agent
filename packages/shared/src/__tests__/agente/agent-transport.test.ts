import { describe, expect, it } from 'vitest';

import { shouldPreferAgentJsonTransport } from '../../agente/agent-transport';

describe('agent-transport', () => {
  it('prefers JSON on touch phones and tablets', () => {
    expect(
      shouldPreferAgentJsonTransport({
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
      }),
    ).toBe(true);
    expect(
      shouldPreferAgentJsonTransport({
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)',
      }),
    ).toBe(true);
    expect(shouldPreferAgentJsonTransport({ pointerCoarse: true })).toBe(true);
    expect(shouldPreferAgentJsonTransport({ mobileViewport: true })).toBe(true);
  });

  it('keeps stream on desktop pointers', () => {
    expect(
      shouldPreferAgentJsonTransport({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)',
        pointerCoarse: false,
      }),
    ).toBe(false);
  });

  it('honors explicit stream disable flag', () => {
    expect(shouldPreferAgentJsonTransport({ streamEnvDisabled: true })).toBe(true);
  });
});
