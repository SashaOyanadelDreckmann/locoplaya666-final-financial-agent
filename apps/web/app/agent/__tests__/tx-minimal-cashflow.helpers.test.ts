import type { NormalizedMovementRow } from '../modales/transacciones/compute-movement-analytics';
import {
  buildCumulativeCashflowSeries,
  parseTransactionMovementDate,
  shouldBuildCumulativeCashflowChart,
} from '@financial-agent/shared';

function row(partial: Partial<NormalizedMovementRow> & Pick<NormalizedMovementRow, 'date' | 'amount' | 'directionForTotals'>): NormalizedMovementRow {
  return {
    label: partial.label ?? 'Compra',
    signedAmount: partial.amount,
    direction: partial.directionForTotals,
    movementKind: partial.directionForTotals,
    sourceLine: partial.sourceLine ?? '',
    category: 'Otros',
    merchant: 'Comercio',
    categoryConfidence: 0.8,
    confidence: 0.8,
    sourceKind: 'ocr',
    uiKey: partial.uiKey ?? 'k1',
    promptKey: partial.promptKey ?? 'p1',
    rawAmount: partial.amount,
    overrideApplied: false,
    overrideMatchKey: '',
    ...partial,
  };
}

describe('tx-minimal-cashflow.helpers', () => {
  it('parses ISO and CL date tokens', () => {
    expect(parseTransactionMovementDate('2026-06-03')).toEqual({ year: 2026, month: 6, day: 3 });
    expect(parseTransactionMovementDate('03/06/2026')).toEqual({ year: 2026, month: 6, day: 3 });
    expect(parseTransactionMovementDate('03/06', 2026)).toEqual({ year: 2026, month: 6, day: 3 });
  });

  it('builds a monthly series when enough dated movements exist', () => {
    const rows = [
      row({ date: '2026-06-01', amount: 100_000, directionForTotals: 'income', uiKey: 'a', promptKey: 'a' }),
      row({ date: '2026-06-03', amount: 40_000, directionForTotals: 'expense', uiKey: 'b', promptKey: 'b' }),
      row({ date: '2026-06-08', amount: 25_000, directionForTotals: 'expense', uiKey: 'c', promptKey: 'c' }),
      row({ date: '2026-06-12', amount: 80_000, directionForTotals: 'income', uiKey: 'd', promptKey: 'd' }),
    ];

    const series = buildCumulativeCashflowSeries(rows.map((row) => ({
      label: row.label,
      merchant: row.merchant,
      amount: row.amount,
      direction: row.directionForTotals,
      date: row.date,
      category: row.category,
    })));
    expect(series).not.toBeNull();
    expect(series?.points).toHaveLength(4);
    expect(series?.points[0]).toMatchObject({
      cumulativeIncome: 100_000,
      cumulativeExpense: 0,
      dayIncome: 100_000,
      dayExpense: 0,
    });
    expect(series?.points[1]).toMatchObject({
      cumulativeIncome: 100_000,
      cumulativeExpense: 40_000,
      dayIncome: 0,
      dayExpense: 40_000,
    });
    expect(series?.points[3]).toMatchObject({
      cumulativeIncome: 180_000,
      cumulativeExpense: 65_000,
    });
    expect(series?.distinctDays).toBe(4);
    expect(shouldBuildCumulativeCashflowChart(rows.map((row) => ({
      label: row.label,
      amount: row.amount,
      direction: row.directionForTotals,
      date: row.date,
    })))).toBe(true);
  });

  it('hides chart when dates are insufficient', () => {
    const rows = [
      row({ date: 'N/D', amount: 40_000, directionForTotals: 'expense', uiKey: 'a', promptKey: 'a' }),
      row({ date: '2026-06-03', amount: 25_000, directionForTotals: 'expense', uiKey: 'b', promptKey: 'b' }),
    ];

    expect(buildCumulativeCashflowSeries(rows.map((row) => ({
      amount: row.amount,
      direction: row.directionForTotals,
      date: row.date,
    })))).toBeNull();
    expect(shouldBuildCumulativeCashflowChart(rows.map((row) => ({
      amount: row.amount,
      direction: row.directionForTotals,
      date: row.date,
    })))).toBe(false);
  });
});
