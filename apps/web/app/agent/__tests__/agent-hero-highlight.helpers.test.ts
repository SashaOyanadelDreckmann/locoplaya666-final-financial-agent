import {
  applyHighlightNeighborBleed,
  buildAgentHighlightTerms,
  parseAgentHeroSegments,
} from '../agent-hero-highlight.helpers';

describe('agent-hero-highlight.helpers', () => {
  it('collects movement, amount and column terms from focus context', () => {
    const terms = buildAgentHighlightTerms({
      text: '¿Alimentación es un monto fijo cada mes o varía mes a mes?',
      focusRow: { id: 'expense_food', category: 'Alimentación', type: 'expense', amount: 250000 },
      question: '¿Alimentación es un monto fijo cada mes o varía mes a mes?',
    });

    expect(terms).toEqual(
      expect.arrayContaining(['Alimentación', 'cada mes', 'fijo', 'recurrencia']),
    );
  });

  it('highlights only complete terms while the typewriter is in progress', () => {
    const terms = ['Alimentación', '$250.000', 'débito'];
    expect(parseAgentHeroSegments('Para alimentac', terms)).toEqual([
      { text: 'Para alimentac', highlight: false },
    ]);
    expect(parseAgentHeroSegments('Para alimentación dejé pago con ', terms)).toEqual([
      { text: 'Para ', highlight: false },
      { text: 'alimentación', highlight: true },
      { text: ' dejé pago con ', highlight: false },
    ]);
    expect(parseAgentHeroSegments('Para Alimentación dejé ', terms)).toEqual([
      { text: 'Para ', highlight: false },
      { text: 'Alimentación', highlight: true },
      { text: ' dejé ', highlight: false },
    ]);
  });

  it('bleeds one neighbor letter into highlighted arcade words', () => {
    const base = parseAgentHeroSegments('Para Alimentación dejé ', ['Alimentación']);
    expect(applyHighlightNeighborBleed(base, 1)).toEqual([
      { text: 'Par ', highlight: false },
      { text: 'aAlimentación d', highlight: true },
      { text: ' ejé ', highlight: false },
    ]);
  });

  it('highlights formatted amounts in the visible text', () => {
    const terms = buildAgentHighlightTerms({
      text: 'Dejamos $200.000 para comida y supermercado.',
      focusRow: { id: 'expense_food', category: 'Alimentación', type: 'expense', amount: 200000 },
    });
    const segments = parseAgentHeroSegments('Dejamos $200.000 para ', terms);
    expect(segments).toEqual([
      { text: 'Dejamos ', highlight: false },
      { text: '$200.000', highlight: true },
      { text: ' para ', highlight: false },
    ]);
  });
});
