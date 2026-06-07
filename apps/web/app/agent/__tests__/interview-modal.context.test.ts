import { buildInterviewContextHighlights } from '../interview-modal.context';

describe('interview modal context', () => {
  it('builds sidebar highlights as discrete lines instead of a single blob', () => {
    const highlights = buildInterviewContextHighlights(
      {
        age: 34,
        profession: 'Ingeniera',
        __budgetContext: {
          income: 1200000,
          expenses: 900000,
          balance: 300000,
          rowsCount: 4,
        },
        __productsContext: {
          productsCount: 2,
          activeProductLabel: 'Cuenta Vista',
          transactionSummary: {
            netFlow: 150000,
            movementCount: 12,
            alerts: ['Gasto recurrente alto'],
          },
        },
      },
      [{ blockId: 'cashflow', answer: 'Pago arriendo el día 5' }],
    );

    expect(highlights.length).toBeGreaterThan(1);
    expect(highlights.length).toBeLessThanOrEqual(4);
    expect(highlights.some((line) => line.includes('34 años'))).toBe(true);
    expect(highlights.some((line) => line.includes('Presupuesto'))).toBe(true);
    expect(highlights.some((line) => line.includes('Productos'))).toBe(true);

    const extendedHighlights = buildInterviewContextHighlights(
      {
        age: 34,
        profession: 'Ingeniera',
      },
      [{ blockId: 'cashflow', answer: 'Pago arriendo el día 5' }],
      8,
    );
    expect(extendedHighlights.some((line) => line.includes('Respuestas previas'))).toBe(true);
  });
});
