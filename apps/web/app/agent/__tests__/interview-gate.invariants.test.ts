/** @jest-environment node */

import { BUDGET_ROWS_TARGET } from '../onboarding-flow.helpers';
import { resolveChat1UxState } from '../page.utils';
import { isTransactionsEvidenceSatisfied } from '@/lib/transactions-flow.helpers';

type BudgetRowSlice = { amount: number };
type ProductSlice = Parameters<typeof isTransactionsEvidenceSatisfied>[0][number];

const productWithMovements: ProductSlice = {
  connected: true,
  parsedDocuments: [{ id: 'doc-1' }],
  dashboard: { keyMetrics: { movement_count: 2 }, movements: [{ id: 'm1' }] },
};

function rowsWithPositiveAmounts(count: number): BudgetRowSlice[] {
  return Array.from({ length: count }, (_, index) => ({ amount: (index + 1) * 1000 }));
}

/**
 * Mirrors `canOpenInterview` in page.tsx until it is extracted to a shared helper.
 * Keep aligned manually with that useMemo.
 */
function resolveCanOpenInterview(params: {
  products: ProductSlice[];
  productsModuleSkipped?: boolean;
  budgetRows: BudgetRowSlice[];
  interviewCompleted?: boolean;
}): boolean {
  const hasBudgetData = params.budgetRows.filter((row) => row.amount > 0).length >= BUDGET_ROWS_TARGET;
  const hasTransactionsData = isTransactionsEvidenceSatisfied(
    params.products,
    params.productsModuleSkipped,
  );
  return Boolean(params.interviewCompleted) || (hasTransactionsData && hasBudgetData);
}

function expectInterviewBlocked(params: {
  products: ProductSlice[];
  productsModuleSkipped?: boolean;
  budgetRows: BudgetRowSlice[];
}) {
  expect(resolveCanOpenInterview(params)).toBe(false);
  expect(
    resolveChat1UxState({
      chatId: 'chat-1',
      diagnosisCompleted: false,
      canOpenInterview: false,
    }),
  ).toBe('baseReading');
}

function expectInterviewAvailable(params: {
  products: ProductSlice[];
  productsModuleSkipped?: boolean;
  budgetRows: BudgetRowSlice[];
}) {
  expect(resolveCanOpenInterview(params)).toBe(true);
  expect(
    resolveChat1UxState({
      chatId: 'chat-1',
      diagnosisCompleted: false,
      canOpenInterview: true,
    }),
  ).toBe('interviewAvailable');
}

describe('interview gate invariants', () => {
  it('requires three budget rows with amount > 0', () => {
    expect(BUDGET_ROWS_TARGET).toBe(3);
  });

  it.each([
    { label: '0 filas', rowCount: 0 },
    { label: '1 fila', rowCount: 1 },
    { label: '2 filas', rowCount: 2 },
  ])('blocks interview with satisfied TX and $label', ({ rowCount }) => {
    expectInterviewBlocked({
      products: [productWithMovements],
      budgetRows: rowsWithPositiveAmounts(rowCount),
    });
  });

  it('unlocks interview with satisfied TX and 3 filas amount > 0', () => {
    expectInterviewAvailable({
      products: [productWithMovements],
      budgetRows: rowsWithPositiveAmounts(3),
    });
  });

  it('blocks interview when cartolas are complete but budget rows are insufficient', () => {
    expectInterviewBlocked({
      products: [productWithMovements, { ...productWithMovements, parsedDocuments: [{ id: 'doc-2' }] }],
      budgetRows: rowsWithPositiveAmounts(2),
    });
  });

  it('blocks interview with productsModuleSkipped and only 2 budget rows', () => {
    expectInterviewBlocked({
      products: [],
      productsModuleSkipped: true,
      budgetRows: rowsWithPositiveAmounts(2),
    });
  });

  it('unlocks interview with productsModuleSkipped and 3 budget rows', () => {
    expectInterviewAvailable({
      products: [],
      productsModuleSkipped: true,
      budgetRows: rowsWithPositiveAmounts(3),
    });
  });

  it('keeps chat 1 in diagnosisCompleted after interview finishes', () => {
    expect(
      resolveChat1UxState({
        chatId: 'chat-1',
        diagnosisCompleted: true,
        canOpenInterview: true,
      }),
    ).toBe('diagnosisCompleted');
  });
});
