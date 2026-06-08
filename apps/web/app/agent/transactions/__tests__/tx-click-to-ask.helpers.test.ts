import {
  buildCategoryAskQuestion,
  buildMerchantAskQuestion,
  buildMovementAskQuestion,
  mapPromptKeysToUiKeys,
} from '../tx-click-to-ask.helpers';

describe('tx-click-to-ask.helpers', () => {
  it('builds merchant and category questions', () => {
    expect(buildMerchantAskQuestion('Uber')).toBe('¿Cuánto gasté en Uber?');
    expect(buildCategoryAskQuestion('Transporte')).toBe('¿Cuánto gasté en la categoría Transporte?');
  });

  it('builds movement questions with context', () => {
    expect(
      buildMovementAskQuestion({
        merchant: 'Jumbo',
        date: '2025-01-05',
        category: 'Supermercado',
      }),
    ).toContain('Jumbo');
  });

  it('maps prompt keys to ui keys', () => {
    const mapped = mapPromptKeysToUiKeys(['a|b|1'], [{ uiKey: 'ui-1', promptKey: 'a|b|1' }]);
    expect(mapped).toEqual(['ui-1']);
  });
});
