/** @jest-environment node */

import type { BudgetRow } from '@/lib/presupuesto/filas.helpers';
import { isTransactionsEvidenceSatisfied } from '@/lib/transacciones/flujo.helpers';
import { canOpenInterview } from '../flujo/interview-gate.helpers';
import { BUDGET_ROWS_TARGET } from '../flujo/onboarding-flow.helpers';
import { resolveChat1UxState } from '../utilidades/page.utils';

type ProductSlice = Parameters<typeof isTransactionsEvidenceSatisfied>[0][number];

const productWithMovements: ProductSlice = {
  connected: true,
  parsedDocuments: [{ id: 'doc-1' }],
  dashboard: { keyMetrics: { movement_count: 2 }, movements: [{ id: 'm1' }] },
};

function budgetRow(amount: number, id: string): BudgetRow {
  return { id, category: 'test', type: 'expense', amount };
}

function rowsWithPositiveAmounts(count: number): BudgetRow[] {
  return Array.from({ length: count }, (_, index) => budgetRow((index + 1) * 1000, `row-${index}`));
}

function expectInterviewBlocked(params: {
  products: ProductSlice[];
  productsModuleSkipped?: boolean;
  budgetRows: BudgetRow[];
}) {
  expect(canOpenInterview(params)).toBe(false);
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
  budgetRows: BudgetRow[];
}) {
  expect(canOpenInterview(params)).toBe(true);
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

  it('keeps chat 1 in interviewAvailable until general chat deepen starts', () => {
    expect(
      resolveChat1UxState({
        chatId: 'chat-1',
        diagnosisCompleted: true,
        generalChatStarted: false,
        canOpenInterview: true,
      }),
    ).toBe('interviewAvailable');
    expect(
      resolveChat1UxState({
        chatId: 'chat-1',
        diagnosisCompleted: true,
        generalChatStarted: true,
        canOpenInterview: true,
      }),
    ).toBe('diagnosisCompleted');
  });
});
