'use client';

import type { AgentBlock } from '@/lib/tipos/chat';
import { MovementCashflowChart } from './MovementCashflowChart';
import { MovementCategoryBarChart, MovementFlowBarChart } from './MovementMetricsCharts';

function buildFormatCurrency(currency = 'CLP') {
  return (value: number) =>
    new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(Number.isFinite(value) ? value : 0);
}

export function TransactionChartBlockRenderer(props: { block: Extract<AgentBlock, { type: 'tx_chart' }> }) {
  const chart = props.block.tx_chart;
  const formatCurrency = buildFormatCurrency(chart.currency ?? 'CLP');

  if (chart.variant === 'cumulative_cashflow') {
    return (
      <MovementCashflowChart
        series={chart.series}
        formatCurrency={formatCurrency}
        className="agent-tx-chart-card"
        kicker="Evolución acumulada"
        title={chart.title ?? chart.series.monthLabel}
        meta={chart.subtitle}
      />
    );
  }

  if (chart.variant === 'flow_bar') {
    return (
      <MovementFlowBarChart
        data={chart.data}
        formatCurrency={formatCurrency}
        title={chart.title}
        subtitle={chart.subtitle}
      />
    );
  }

  return (
    <MovementCategoryBarChart
      data={chart.data}
      formatCurrency={formatCurrency}
      title={chart.title}
      subtitle={chart.subtitle}
    />
  );
}
