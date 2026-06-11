/** @jest-environment node */

import type { BudgetRow } from '@/lib/budget-rows.helpers';
import { canOpenInterview } from '../interview-gate.helpers';
import { isTransactionsEvidenceSatisfied } from '@/lib/transactions-flow.helpers';

type ProductSlice = Parameters<typeof isTransactionsEvidenceSatisfied>[0][number];

function budgetRow(amount: number, id = `row-${amount}`): BudgetRow {
  return { id, category: 'test', type: 'expense', amount };
}

const productWithMovements: ProductSlice = {
  connected: true,
  parsedDocuments: [{ id: 'doc-1' }],
  dashboard: { keyMetrics: { movement_count: 2 }, movements: [{ id: 'm1' }] },
};

function rowsWithPositiveAmounts(count: number) {
  return Array.from({ length: count }, (_, index) => budgetRow((index + 1) * 1000, `row-${index}`));
}

describe('canOpenInterview', () => {
  it.each([
    { label: '0 filas', rowCount: 0 },
    { label: '1 fila', rowCount: 1 },
    { label: '2 filas', rowCount: 2 },
  ])('blocks interview with $label even when TX evidence is satisfied', ({ rowCount }) => {
    expect(
      canOpenInterview({
        products: [productWithMovements],
        budgetRows: rowsWithPositiveAmounts(rowCount),
      }),
    ).toBe(false);
  });

  it('unlocks interview with 3 budget rows amount > 0 and satisfied TX evidence', () => {
    expect(
      canOpenInterview({
        products: [productWithMovements],
        budgetRows: rowsWithPositiveAmounts(3),
      }),
    ).toBe(true);
  });

  it('unlocks interview with 3 budget rows amount > 0 and productsModuleSkipped', () => {
    expect(
      canOpenInterview({
        products: [],
        productsModuleSkipped: true,
        budgetRows: rowsWithPositiveAmounts(3),
      }),
    ).toBe(true);
  });

  it('blocks interview with 3 budget rows when TX evidence is missing and skip is false', () => {
    expect(
      canOpenInterview({
        products: [],
        productsModuleSkipped: false,
        budgetRows: rowsWithPositiveAmounts(3),
      }),
    ).toBe(false);
  });

  it('ignores budget rows with amount <= 0 or non-positive values', () => {
    expect(
      canOpenInterview({
        products: [productWithMovements],
        budgetRows: [
          budgetRow(0, 'zero'),
          budgetRow(-100, 'negative'),
          budgetRow(1000, 'a'),
          budgetRow(2000, 'b'),
          budgetRow(3000, 'c'),
        ],
      }),
    ).toBe(true);
  });

  it('does not treat complete cartolas as substitute for 3 budget rows', () => {
    expect(
      canOpenInterview({
        products: [productWithMovements, { ...productWithMovements, parsedDocuments: [{ id: 'doc-2' }] }],
        budgetRows: rowsWithPositiveAmounts(2),
      }),
    ).toBe(false);
  });

  it('returns true when interviewCompleted even without budget or TX evidence', () => {
    expect(
      canOpenInterview({
        products: [],
        budgetRows: [],
        interviewCompleted: true,
      }),
    ).toBe(true);
  });
});
