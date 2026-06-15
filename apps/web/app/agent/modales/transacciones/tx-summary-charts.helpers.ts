import { buildTransactionChartBlocks } from '@financial-agent/shared';

import type { AgentBlock } from '@/lib/tipos/chat';

import type { NormalizedMovementRow } from './compute-movement-analytics';

export function mapMovementRowsToChartInputs(rows: NormalizedMovementRow[]) {
  return rows.map((row) => ({
    label: row.label,
    merchant: row.merchant,
    amount: row.amount,
    direction: row.directionForTotals,
    date: row.date,
    category: row.category,
  }));
}

export function buildTransactionChartBlocksFromRows(
  rows: NormalizedMovementRow[],
  inflowLabel = 'Ingresos y abonos',
): Extract<AgentBlock, { type: 'tx_chart' }>[] {
  if (!rows.length) return [];

  return buildTransactionChartBlocks({
    movements: mapMovementRowsToChartInputs(rows),
    variants: ['cumulative_cashflow', 'flow_bar', 'category_bar'],
    inflowLabel,
    currency: 'CLP',
  }) as Extract<AgentBlock, { type: 'tx_chart' }>[];
}
