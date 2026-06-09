import { describe, expect, it } from 'vitest';

import {
  shouldAttachLiveMarketSnapshot,
  shouldBoostFreshEvidenceTools,
  shouldBypassWebEvidenceCache,
  shouldPrefetchTrustedWeb,
} from '../evidence-policy';

describe('evidence-policy', () => {
  it('attaches market snapshot for substantive messages only', () => {
    expect(shouldAttachLiveMarketSnapshot('¿Cómo está la UF hoy?')).toBe(true);
    expect(shouldAttachLiveMarketSnapshot('hola')).toBe(false);
  });

  it('boosts fresh evidence tools for factual modes', () => {
    const boosted = shouldBoostFreshEvidenceTools({
      mode: 'information',
      userMessage: '¿Cuál es la TPM actual?',
      requiresTools: false,
      requiresRag: false,
    });
    expect(boosted.requires_tools).toBe(true);
  });

  it('prefetches trusted web for information mode', () => {
    expect(
      shouldPrefetchTrustedWeb({
        mode: 'information',
        userMessage: 'Explícame el APV',
        requiresTools: false,
        requiresRag: false,
      }),
    ).toBe(true);
  });

  it('bypasses web cache when user asks for today', () => {
    expect(shouldBypassWebEvidenceCache('¿Qué pasa hoy en el mercado?')).toBe(true);
    expect(shouldBypassWebEvidenceCache('simula mi ahorro')).toBe(false);
  });
});
