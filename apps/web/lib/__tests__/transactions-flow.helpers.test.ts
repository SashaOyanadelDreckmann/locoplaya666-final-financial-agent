/** @jest-environment node */

import {
  countProductsWithAnalyzedMovements,
  productHasAnalyzedMovements,
  productsHaveAnalyzedMovements,
  resolveTxWizardStep,
} from '../transactions-flow.helpers';

describe('transactions-flow helpers', () => {
  it('resolves wizard steps from product state', () => {
    expect(resolveTxWizardStep(null)).toBe('products');
    expect(resolveTxWizardStep({ connected: false, parsedDocuments: [] })).toBe('credentials');
    expect(resolveTxWizardStep({ connected: true, parsedDocuments: [] })).toBe('upload');
    expect(resolveTxWizardStep({ connected: true, parsedDocuments: [{ name: 'a.pdf' }] })).toBe('dashboard');
  });

  it('requires parsed documents and movements for analyzed products', () => {
    expect(productHasAnalyzedMovements({ parsedDocuments: [], dashboard: {} })).toBe(false);
    expect(
      productHasAnalyzedMovements({
        parsedDocuments: [{ name: 'a.pdf' }],
        dashboard: { keyMetrics: { movement_count: 0 }, movements: [] },
      }),
    ).toBe(false);
    expect(
      productHasAnalyzedMovements({
        parsedDocuments: [{ name: 'a.pdf' }],
        dashboard: { keyMetrics: { movement_count: 3 } },
      }),
    ).toBe(true);
    expect(
      productHasAnalyzedMovements({
        parsedDocuments: [{ name: 'a.pdf' }],
        dashboard: { movements: [{ description: 'x', amount: 1, direction: 'expense' }] },
      }),
    ).toBe(true);
    expect(
      productHasAnalyzedMovements({
        parsedDocuments: [{ name: 'a.pdf', text: 'Sueldo 450000 ingreso\\nArriendo 180000 gasto' }],
        dashboard: { keyMetrics: { movement_count: 0 }, movements: [] },
      }),
    ).toBe(true);
  });

  it('aggregates analyzed products across a library', () => {
    const products = [
      { parsedDocuments: [{ name: 'a' }], dashboard: { keyMetrics: { movement_count: 2 } } },
      { parsedDocuments: [], dashboard: {} },
    ];
    expect(productsHaveAnalyzedMovements(products)).toBe(true);
    expect(countProductsWithAnalyzedMovements(products)).toBe(1);
  });
});
