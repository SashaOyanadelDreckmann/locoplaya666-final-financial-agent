import { describe, expect, it } from 'vitest';

import {
  buildWelcomeIntroFingerprint,
  canGenerateWelcomeIntroWithLlm,
  EXECUTIVE_INTRO_UI_VERSION,
  isValidWelcomeIntroCache,
  readWelcomeIntroCache,
  readWelcomeIntroGenerationCount,
  stableStringify,
  type WelcomeIntroCache,
  type WelcomeIntroPayload,
} from '@financial-agent/shared';

const sampleIntro = (): WelcomeIntroPayload => ({
  version: 2,
  uiVersion: EXECUTIVE_INTRO_UI_VERSION,
  firstName: 'Ana',
  headline: 'Ana, partimos con una lectura seria de tu situación.',
  wittyHook: 'Tu intake llegó con señal.',
  personalRead: 'Hay espacio para ordenar mejor tu mapa financiero.',
  signals: ['Tramo: 300k-600k'],
  sections: {
    marco: { title: 'Marco', body: 'Evidencia antes de decisión.' },
    fintech: { title: 'Ley Fintech', body: 'Finanzas abiertas.', benefit: 'Más control.' },
    metodo: [{ step: 1, label: 'Productos', detail: 'Partimos por movimientos.' }],
    resultado: { title: 'Resultado', body: 'Claridad accionable.' },
  },
  closingQuestion: '¿Partimos por Productos y transacciones?',
});

describe('shared welcome intro cache helpers', () => {
  it('stableStringify ignores object key order', () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }));
  });

  it('builds a stable fingerprint for the same intake payload', () => {
    const intake = { incomeBand: '300k-600k', city: 'Santiago' };
    const summary = { summary: 'Perfil conservador', highlights: ['Estrés moderado'] };
    const a = buildWelcomeIntroFingerprint(intake, summary);
    const b = buildWelcomeIntroFingerprint(intake, summary);
    expect(a).toBe(b);
    expect(a).toHaveLength(24);
  });

  it('reads and validates cached intro from injected intake envelope', () => {
    const intake = { incomeBand: '300k-600k' };
    const fingerprint = buildWelcomeIntroFingerprint(intake, null);
    const cache: WelcomeIntroCache = {
      fingerprint,
      uiVersion: EXECUTIVE_INTRO_UI_VERSION,
      intro: sampleIntro(),
      createdAt: '2026-06-07T00:00:00.000Z',
      llmGenerationCount: 1,
    };
    const envelope = { intake, welcomeIntroCache: cache };
    const parsed = readWelcomeIntroCache(envelope);
    expect(isValidWelcomeIntroCache(parsed, fingerprint)).toBe(true);
    expect(isValidWelcomeIntroCache(parsed, 'other-fingerprint')).toBe(false);
    expect(isValidWelcomeIntroCache(parsed, fingerprint)).toBe(true);
  });

  it('tracks welcome intro LLM generation count with a hard cap', () => {
    const cache: WelcomeIntroCache = {
      fingerprint: 'abc',
      uiVersion: EXECUTIVE_INTRO_UI_VERSION,
      intro: sampleIntro(),
      createdAt: '2026-06-07T00:00:00.000Z',
    };

    expect(readWelcomeIntroGenerationCount(null)).toBe(0);
    expect(readWelcomeIntroGenerationCount(cache)).toBe(1);
    expect(canGenerateWelcomeIntroWithLlm(cache)).toBe(true);
    expect(
      canGenerateWelcomeIntroWithLlm({
        ...cache,
        llmGenerationCount: 2,
      }),
    ).toBe(false);
  });
});
