import { describe, expect, it, vi } from 'vitest';

import {
  buildWelcomeIntroFingerprint,
  EXECUTIVE_INTRO_UI_VERSION,
  type WelcomeIntroPayload,
} from '@financial-agent/shared';
import { resolveWelcomeIntroForUser } from './welcome-intro';

const sampleIntro = (): WelcomeIntroPayload => ({
  version: 2,
  uiVersion: EXECUTIVE_INTRO_UI_VERSION,
  firstName: 'Ana',
  headline: 'Ana, lectura personalizada.',
  wittyHook: 'Señal detectada.',
  personalRead: 'Diagnóstico estable.',
  signals: ['Tramo: 300k-600k'],
  sections: {
    marco: { title: 'Marco', body: 'Evidencia primero.' },
    fintech: { title: 'Fintech', body: 'Ley 21.521.', benefit: 'Control.' },
    metodo: [{ step: 1, label: 'Productos', detail: 'Movimientos.' }],
    resultado: { title: 'Resultado', body: 'Claridad.' },
  },
  closingQuestion: '¿Partimos?',
});

vi.mock('../../services/llm.service', () => ({
  completeStructured: vi.fn(),
}));

describe('resolveWelcomeIntroForUser', () => {
  it('returns cached intro without calling persist when fingerprint matches', async () => {
    const intake = { incomeBand: '300k-600k', city: 'Santiago' };
    const fingerprint = buildWelcomeIntroFingerprint(intake, null);
    const injectedIntake = {
      intake,
      welcomeIntroCache: {
        fingerprint,
        uiVersion: EXECUTIVE_INTRO_UI_VERSION,
        intro: sampleIntro(),
        createdAt: '2026-06-07T00:00:00.000Z',
      },
    };
    const persist = vi.fn().mockResolvedValue(true);

    const result = await resolveWelcomeIntroForUser({
      userId: 'user-1',
      firstName: 'Ana',
      injectedIntake,
      persistWelcomeIntroCache: persist,
    });

    expect(result.cached).toBe(true);
    expect(result.intro.headline).toBe('Ana, lectura personalizada.');
    expect(persist).not.toHaveBeenCalled();
  });

  it('generates and persists intro when cache is missing', async () => {
    const { completeStructured } = await import('../../services/llm.service');
    vi.mocked(completeStructured).mockResolvedValue({
      headline: 'Ana, nueva lectura.',
      wittyHook: 'Hook nuevo.',
      personalRead: 'Lectura generada.',
      signals: ['Señal A'],
      marcoInsight: 'Marco generado.',
      fintechInsight: 'Fintech generado.',
      fintechBenefit: 'Beneficio generado.',
      resultNote: 'Resultado generado.',
      closingQuestion: '¿Seguimos?',
    });

    const intake = { incomeBand: '600k-1M' };
    const persist = vi.fn().mockResolvedValue(true);

    const result = await resolveWelcomeIntroForUser({
      userId: 'user-2',
      firstName: 'Ana',
      injectedIntake: { intake, llmSummary: null },
      persistWelcomeIntroCache: persist,
    });

    expect(result.cached).toBe(false);
    expect(result.intro.headline).toBe('Ana, nueva lectura.');
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist.mock.calls[0]?.[1]).toMatchObject({
      fingerprint: buildWelcomeIntroFingerprint(intake, null),
      uiVersion: EXECUTIVE_INTRO_UI_VERSION,
    });
  });
});
