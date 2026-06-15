import {
  buildTransactionChartBlocks,
  type TransactionChartVariant,
} from '@financial-agent/shared';

import { alignProductDashboard } from '@/app/agent/modales/transacciones/align-product-dashboard';
import { computeMovementAnalytics } from '@/app/agent/modales/transacciones/compute-movement-analytics';
import type { CoreAgentRequestContext } from '@/lib/agente/nucleo/buildCoreAgentContext';
import type { AgentBlock } from '@/lib/tipos/chat';

export function buildTransactionChartBlocksFromProductContext(
  context: CoreAgentRequestContext,
  variants?: TransactionChartVariant[],
): AgentBlock[] {
  const product =
    (context.activeProductId
      ? context.products.find((entry) => entry.id === context.activeProductId)
      : null) ??
    context.products.find((entry) => entry.connected) ??
    context.products[0] ??
    null;

  if (!product) return [];

  const dashboard =
    alignProductDashboard(product, context.taxonomyOverrides) ?? product.dashboard;
  if (!dashboard?.movements?.length) return [];

  const analytics = computeMovementAnalytics({
    dashboard,
    productType: product.productType,
    taxonomyOverrides: context.taxonomyOverrides,
  });

  if (!analytics.dedupedMovementRows.length) return [];

  const movements = analytics.dedupedMovementRows.map((row) => ({
    label: row.label,
    merchant: row.merchant,
    amount: row.amount,
    direction: row.directionForTotals,
    date: row.date,
    category: row.category,
  }));

  return buildTransactionChartBlocks({
    movements,
    variants: variants ?? ['cumulative_cashflow', 'flow_bar'],
    inflowLabel: analytics.inflowLabel,
    currency: 'CLP',
  }) as AgentBlock[];
}
