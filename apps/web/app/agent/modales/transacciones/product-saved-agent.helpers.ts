import type { AgentBlock } from '@/lib/tipos/chat';
import { resolveInstantTransactionSummary } from '@/lib/transacciones/resumen.helpers';

import { alignProductDashboard } from './align-product-dashboard';
import { computeMovementAnalytics } from './compute-movement-analytics';
import { buildTransactionChartBlocksFromRows } from './tx-summary-charts.helpers';
import type { BankProduct, TransactionTaxonomyOverride } from './types';

function formatClp(value: number): string {
  return Math.max(0, Math.round(Number(value) || 0)).toLocaleString('es-CL');
}

function formatCurrencyLabel(value: number, currency = 'CLP'): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Math.max(0, Number(value) || 0));
}

function productLabel(product: BankProduct): string {
  return [product.bank?.trim(), product.label?.trim()].filter(Boolean).join(' · ') || 'Producto bancario';
}

function editorialSummaryToMarkdown(text: string): string {
  return text
    .trim()
    .split(/\n\s*\n+/)
    .map((block) => {
      const lines = block
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      if (lines.length === 0) return '';

      const [first, ...rest] = lines;
      const looksLikeKicker =
        rest.length > 0 && first.length <= 56 && !/[.!?]$/.test(first) && !first.startsWith('•');

      if (looksLikeKicker) {
        const body = rest
          .map((line) => (line.startsWith('•') ? `- ${line.replace(/^•\s*/, '')}` : line))
          .join('\n');
        return `## ${first}\n\n${body}`;
      }

      return lines.map((line) => (line.startsWith('•') ? `- ${line.replace(/^•\s*/, '')}` : line)).join('\n');
    })
    .filter(Boolean)
    .join('\n\n');
}

function buildExecutiveSummaryFromMetrics(dashboard: BankProduct['dashboard']): string | null {
  const metrics = dashboard?.keyMetrics;
  const movementCount = Math.max(0, Number(metrics?.movement_count ?? 0));
  if (movementCount <= 0) return null;

  const currency = dashboard?.currency || 'CLP';
  const inflows = Math.max(0, Number(metrics?.inflows_total ?? 0));
  const outflows = Math.max(0, Number(metrics?.outflows_total ?? 0));
  const netFlow = Number(metrics?.net_flow ?? inflows - outflows) || 0;
  const period = dashboard?.period;
  const periodLabel =
    period?.from && period?.to ? ` (${period.from} a ${period.to})` : '';

  const blocks: string[] = [
    [
      'Panorama del periodo',
      `Se detectaron ${movementCount} movimiento${movementCount === 1 ? '' : 's'} válido${movementCount === 1 ? '' : 's'}${periodLabel}.`,
    ].join('\n'),
    [
      'Balance detectado',
      [
        `Ingresos ${formatCurrencyLabel(inflows, currency)}`,
        `Egresos ${formatCurrencyLabel(outflows, currency)}`,
        `Flujo neto ${formatCurrencyLabel(netFlow, currency)}`,
      ].join(' · '),
    ].join('\n'),
  ];

  const topCategories = dashboard?.topCategories ?? [];
  if (topCategories.length > 0) {
    blocks.push(
      [
        'Categorías de gasto',
        ...topCategories
          .slice(0, 3)
          .map((category) => `• ${category.name} — ${formatCurrencyLabel(Number(category.amount) || 0, currency)}`),
      ].join('\n'),
    );
  }

  const topMerchants = dashboard?.topMerchants ?? [];
  if (topMerchants.length > 0) {
    blocks.push(
      [
        'Comercios destacados',
        ...topMerchants
          .slice(0, 3)
          .map((merchant) => `• ${merchant.merchant} — ${formatCurrencyLabel(Number(merchant.amount) || 0, currency)}`),
      ].join('\n'),
    );
  }

  const alerts = dashboard?.alerts ?? [];
  if (alerts.length > 0) {
    blocks.push(['Puntos a revisar', ...alerts.slice(0, 3).map((alert) => `• ${alert}`)].join('\n'));
  }

  return blocks.join('\n\n');
}

function buildExecutiveSummaryFromAnalytics(
  product: BankProduct,
  taxonomyOverrides: TransactionTaxonomyOverride[],
): string | null {
  const dashboard = alignProductDashboard(product, taxonomyOverrides) ?? product.dashboard;
  if (!dashboard) return null;

  const analytics = computeMovementAnalytics({
    dashboard,
    productType: product.productType,
    taxonomyOverrides,
  });

  if (analytics.movementCount <= 0) return null;

  const currency = dashboard.currency || 'CLP';
  const periodLabel =
    analytics.tablePeriod.from !== 'N/D' && analytics.tablePeriod.to !== 'N/D'
      ? ` (${analytics.tablePeriod.from} a ${analytics.tablePeriod.to})`
      : '';
  const blocks: string[] = [
    [
      'Panorama del periodo',
      `Se detectaron ${analytics.movementCount} movimiento${analytics.movementCount === 1 ? '' : 's'} válido${analytics.movementCount === 1 ? '' : 's'}${periodLabel}. ${analytics.verifiedTableRows} provienen de tabla estructurada.`,
    ].join('\n'),
    [
      'Balance detectado',
      [
        `${analytics.inflowLabel} ${formatCurrencyLabel(analytics.tableDerivedMetrics.inflowsTotal, currency)}`,
        `Egresos ${formatCurrencyLabel(analytics.tableDerivedMetrics.outflowsTotal, currency)}`,
        `Flujo neto ${formatCurrencyLabel(analytics.netFlowFromTable, currency)}`,
      ].join(' · '),
    ].join('\n'),
  ];

  const topCategories = analytics.enrichedCategoryData.slice(0, 3);
  if (topCategories.length > 0) {
    blocks.push(
      [
        'Categorías de gasto',
        ...topCategories.map(
          (category) => `• ${category.name} — ${formatCurrencyLabel(category.amount, currency)}`,
        ),
      ].join('\n'),
    );
  }

  const topMerchants = analytics.derivedTopMerchants?.slice(0, 3) ?? [];
  if (topMerchants.length > 0) {
    blocks.push(
      [
        'Comercios destacados',
        ...topMerchants.map((merchant) => `• ${merchant.merchant}`),
      ].join('\n'),
    );
  }

  const alerts = analytics.effectiveDashboard.alerts ?? [];
  if (alerts.length > 0) {
    blocks.push(['Puntos a revisar', ...alerts.slice(0, 3).map((alert) => `• ${alert}`)].join('\n'));
  }

  return blocks.join('\n\n');
}

function isRichGeneratedSummary(summary: string): boolean {
  const trimmed = summary.trim();
  if (trimmed.length < 40) return false;
  if (/^Lectura desde tabla/i.test(trimmed)) return false;
  if (/^Se detectaron \d+ movimientos válidos/i.test(trimmed) && !trimmed.includes('\n\n')) return false;
  return true;
}

export function buildTransactionProductSavedExecutiveSummary(
  product: BankProduct,
  taxonomyOverrides: TransactionTaxonomyOverride[] = [],
): string | null {
  const assistantSummary = product.assistant?.summaryText?.trim();
  if (assistantSummary && assistantSummary.length >= 40) return assistantSummary;

  const rawDashboardSummary = typeof product.dashboard?.summary === 'string' ? product.dashboard.summary.trim() : '';
  if (isRichGeneratedSummary(rawDashboardSummary)) return rawDashboardSummary;

  const analyticsExecutive = buildExecutiveSummaryFromAnalytics(product, taxonomyOverrides);
  if (analyticsExecutive) return analyticsExecutive;

  const dashboard = alignProductDashboard(product, taxonomyOverrides) ?? product.dashboard;
  const metricsExecutive = buildExecutiveSummaryFromMetrics(dashboard);
  if (metricsExecutive) return metricsExecutive;

  const instantSummary = resolveInstantTransactionSummary(dashboard, product.productType)?.trim();
  if (instantSummary) return instantSummary;

  const analyticsSummary = computeMovementAnalytics({
    dashboard,
    productType: product.productType,
    taxonomyOverrides,
  }).summaryFromTable?.trim();
  if (analyticsSummary && !/^Sin base tabular/i.test(analyticsSummary)) return analyticsSummary;

  return null;
}

export function buildTransactionProductSavedAgentBlocks(
  product: BankProduct,
  taxonomyOverrides: TransactionTaxonomyOverride[] = [],
): AgentBlock[] {
  const dashboard = alignProductDashboard(product, taxonomyOverrides) ?? product.dashboard;
  if (!dashboard?.movements?.length) return [];

  const analytics = computeMovementAnalytics({
    dashboard,
    productType: product.productType,
    taxonomyOverrides,
  });

  if (!analytics.dedupedMovementRows.length) return [];

  return buildTransactionChartBlocksFromRows(analytics.dedupedMovementRows, analytics.inflowLabel);
}

export function buildTransactionProductSavedAgentMessage(
  product: BankProduct,
  taxonomyOverrides: TransactionTaxonomyOverride[] = [],
): string {
  const label = productLabel(product);
  const dashboard = alignProductDashboard(product, taxonomyOverrides) ?? product.dashboard;
  const movementCount = Math.max(0, Number(dashboard?.keyMetrics?.movement_count ?? 0));
  const executiveSummary = buildTransactionProductSavedExecutiveSummary(product, taxonomyOverrides);

  const sections = [
    `# Informe ejecutivo — ${label}`,
    '',
    movementCount > 0
      ? `**${label}** quedó incorporado a tu biblioteca con **${movementCount} movimiento${movementCount === 1 ? '' : 's'}** listos para el agente.`
      : `**${label}** quedó incorporado a tu biblioteca. El contexto del agente quedó actualizado.`,
  ];

  if (executiveSummary) {
    sections.push('', editorialSummaryToMarkdown(executiveSummary));
  }

  sections.push(
    '',
    '## Próximo paso',
    movementCount > 0
      ? 'Puedes preguntarme por categorías, evolución del flujo, concentración de gasto o el siguiente producto a conectar.'
      : 'Cuando quieras, pregúntame por el análisis o continúa con otro producto.',
  );

  return sections.join('\n');
}

export function buildTransactionProductSavedPanelMessage(product: BankProduct): string {
  const label = productLabel(product);
  const movementCount = Math.max(0, Number(product.dashboard?.keyMetrics?.movement_count ?? 0));
  if (movementCount > 0) {
    return `${label} guardado. Resumen ejecutivo y gráficos disponibles en el chat.`;
  }
  return `${label} guardado. El agente ya puede usar este producto.`;
}
