import { describe, expect, it } from 'vitest';

import {
  isMobileAgentClient,
  shouldFlushAgentStreamPatches,
  shouldPreferAgentJsonTransport,
} from '../../agente/agent-transport';

describe('agent-transport', () => {
  it('prefers JSON only when stream env is disabled', () => {
    expect(
      shouldPreferAgentJsonTransport({
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
      }),
    ).toBe(false);
    expect(shouldPreferAgentJsonTransport({ pointerCoarse: true })).toBe(false);
    expect(shouldPreferAgentJsonTransport({ streamEnvDisabled: true })).toBe(true);
  });

  it('detects mobile clients for timeouts and stream UI flush', () => {
    expect(
      isMobileAgentClient({
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)',
      }),
    ).toBe(true);
    expect(isMobileAgentClient({ pointerCoarse: true })).toBe(true);
    expect(isMobileAgentClient({ mobileViewport: true })).toBe(true);
    expect(
      isMobileAgentClient({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)',
        pointerCoarse: false,
      }),
    ).toBe(false);
    expect(shouldFlushAgentStreamPatches({ mobileViewport: true })).toBe(true);
  });
});
