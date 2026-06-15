'use client';

import { useMemo } from 'react';

import { TransactionChartBlockRenderer } from '@/components/transacciones/charts/TransactionChartBlockRenderer';

import type { NormalizedMovementRow } from './compute-movement-analytics';
import { buildTransactionChartBlocksFromRows } from './tx-summary-charts.helpers';

export function TxSummaryChartsPanel(props: {
  movementRows?: NormalizedMovementRow[];
  inflowLabel?: string;
  className?: string;
  compact?: boolean;
}) {
  const blocks = useMemo(
    () => buildTransactionChartBlocksFromRows(props.movementRows ?? [], props.inflowLabel),
    [props.inflowLabel, props.movementRows],
  );

  if (!blocks.length) return null;

  return (
    <div
      className={`tx-summary-charts-grid${props.compact ? ' is-compact' : ''}${props.className ? ` ${props.className}` : ''}`}
      role="region"
      aria-label="Gráficos del resumen de movimientos"
    >
      {blocks.map((block, index) => (
        <TransactionChartBlockRenderer key={`${block.tx_chart.variant}-${index}`} block={block} />
      ))}
    </div>
  );
}
