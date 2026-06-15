import { buildTransactionChartBlocksFromRows } from '../tx-summary-charts.helpers';
import type { NormalizedMovementRow } from '../compute-movement-analytics';

function buildRow(overrides: Partial<NormalizedMovementRow> = {}): NormalizedMovementRow {
  return {
    label: 'Sueldo',
    merchant: 'Empleador',
    amount: 500_000,
    direction: 'income',
    movementKind: 'income',
    directionForTotals: 'income',
    date: '2026-01-02',
    category: 'Ingresos',
    confidence: 1,
    categoryConfidence: 1,
    sourceLine: 'Sueldo',
    sourceKind: 'table',
    uiKey: 'row-1',
    promptKey: 'row-1',
    rawAmount: 500_000,
    overrideApplied: false,
    overrideMatchKey: '',
    verified: true,
    ...overrides,
  } as NormalizedMovementRow;
}

describe('buildTransactionChartBlocksFromRows', () => {
  it('returns all chart variants when movements support them', () => {
    const blocks = buildTransactionChartBlocksFromRows(
      [
        buildRow(),
        buildRow({
          uiKey: 'row-2',
          promptKey: 'row-2',
          label: 'Arriendo',
          merchant: 'Arrendador',
          amount: 200_000,
          directionForTotals: 'expense',
          date: '2026-01-03',
          category: 'Vivienda',
        }),
        buildRow({
          uiKey: 'row-3',
          promptKey: 'row-3',
          label: 'Super',
          merchant: 'Jumbo',
          amount: 80_000,
          directionForTotals: 'expense',
          date: '2026-01-05',
          category: 'Supermercado',
        }),
      ],
      'Ingresos y abonos',
    );

    expect(blocks.length).toBe(3);
    expect(blocks.map((block) => block.tx_chart.variant)).toEqual([
      'cumulative_cashflow',
      'flow_bar',
      'category_bar',
    ]);
  });

  it('returns an empty list when there are no movements', () => {
    expect(buildTransactionChartBlocksFromRows([])).toEqual([]);
  });
});
