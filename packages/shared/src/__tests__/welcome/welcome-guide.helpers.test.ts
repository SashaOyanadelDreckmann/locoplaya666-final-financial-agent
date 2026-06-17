/** @jest-environment node */

import {
  buildChat1WelcomeGuideActions,
  buildChat2WelcomeGuideActions,
  buildProductSearchQueries,
  buildWelcomeGuideEnrichment,
  formatProductHintsBlurb,
} from '@financial-agent/shared';

describe('welcome guide helpers', () => {
  it('builds contextual product search queries', () => {
    expect(
      buildProductSearchQueries({ hasDebt: true, hasSavingsOrInvestments: false }, 'chat-2'),
    ).toEqual(
      expect.arrayContaining([expect.stringMatching(/tarjeta|crédito|credito/i)]),
    );
  });

  it('builds chat-1 panel and message actions', () => {
    const actions = buildChat1WelcomeGuideActions({
      firstName: 'Ana',
      intake: { hasDebt: true },
    });
    expect(actions.some((action) => action.kind === 'panel')).toBe(true);
    expect(actions.some((action) => action.id === 'real-products')).toBe(false);
    expect(actions.some((action) => action.id === 'priority-now')).toBe(true);
    expect(actions.some((action) => action.id === 'open-budget')).toBe(false);
  });

  it('adds budget action on chat-1 only after transactions unlock', () => {
    const locked = buildChat1WelcomeGuideActions({
      firstName: 'Ana',
      intake: { hasDebt: true },
      budgetUnlocked: false,
    });
    const unlocked = buildChat1WelcomeGuideActions({
      firstName: 'Ana',
      intake: { hasDebt: true },
      budgetUnlocked: true,
    });
    expect(locked.some((action) => action.id === 'open-budget')).toBe(false);
    expect(unlocked.some((action) => action.id === 'open-budget')).toBe(true);
  });

  it('keeps product actions for chat-1 after diagnosis unlock', () => {
    const actions = buildChat1WelcomeGuideActions({
      firstName: 'Ana',
      intake: { hasDebt: true },
      diagnosisUnlocked: true,
      productHints: [
        {
          label: 'Fintual',
          fact: 'Fondos desde perfil conservador',
          source: 'fintual.cl',
        },
      ],
    });
    expect(actions.some((action) => action.id === 'compare-products')).toBe(true);
  });

  it('omits product enrichment on chat-1 initial welcome', () => {
    const enrichment = buildWelcomeGuideEnrichment({
      chatId: 'chat-1',
      firstName: 'Ana',
      intake: { hasDebt: true },
      productHints: [
        {
          label: 'Fintual',
          fact: 'Fondos desde perfil conservador',
          source: 'fintual.cl',
        },
      ],
    });

    expect(enrichment.productHints).toEqual([]);
    expect(enrichment.productBlurb).toBeUndefined();
  });

  it('builds chat-2 strategy actions with product blurb', () => {
    const enrichment = buildWelcomeGuideEnrichment({
      chatId: 'chat-2',
      firstName: 'Ana',
      intake: { hasSavingsOrInvestments: true },
      hasDiagnosis: true,
      topTension: 'Deuda de consumo',
      productHints: [
        {
          label: 'Fintual',
          fact: 'Fondos desde perfil conservador',
          source: 'fintual.cl',
          url: 'https://fintual.cl',
        },
      ],
    });

    expect(enrichment.guideActions.length).toBeGreaterThan(2);
    expect(enrichment.productBlurb).toMatch(/Fintual/);
    expect(
      buildChat2WelcomeGuideActions({
        firstName: 'Ana',
        hasDiagnosis: true,
        productHints: enrichment.productHints,
      }).some((action) => action.id === 'executive-plan'),
    ).toBe(true);
  });

  it('formats product hint blurbs', () => {
    expect(
      formatProductHintsBlurb([
        { label: 'Banco', fact: 'Cuenta sin comisión', source: 'banco.cl' },
      ]),
    ).toBe('Banco: Cuenta sin comisión (banco.cl)');
  });

  it('builds chat-3 social consciousness actions', () => {
    const enrichment = buildWelcomeGuideEnrichment({
      chatId: 'chat-3',
      firstName: 'Ana',
      intake: { hasSavingsOrInvestments: true },
      hasDiagnosis: true,
      topTension: 'Gasto discrecional vs. colchón',
      productHints: [
        {
          label: 'Finanzas con impacto',
          fact: 'Fondos ESG regulados en Chile',
          source: 'cmfchile.cl',
        },
      ],
    });

    expect(enrichment.guideActions.some((action) => action.id === 'freedom')).toBe(true);
    expect(enrichment.guideActions.some((action) => action.id === 'tension')).toBe(true);
    expect(enrichment.guideActions.some((action) => action.id === 'synthesis')).toBe(true);
  });
});
