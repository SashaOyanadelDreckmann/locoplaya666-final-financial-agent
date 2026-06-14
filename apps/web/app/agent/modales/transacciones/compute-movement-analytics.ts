import { buildMovementPromptKey } from '@/lib/transacciones/chat.helpers';
import {
  resolveMovementDirectionForTotals,
  resolveMovementKind,
  resolveSignedAmount,
} from './movement-direction.helpers';
import { formatPercentCompact } from './presentation';
import { movementOverrideKey, normalizeTaxonomyKey, resolveTransactionOverride } from './taxonomy';
import type { BankProduct, TransactionTaxonomyOverride } from './types';

export type NormalizedMovementRow = {
  label: string;
  amount: number;
  signedAmount?: number;
  direction: 'income' | 'expense';
  movementKind: 'income' | 'expense' | 'abono';
  date: string;
  sourceLine: string;
  category: string;
  merchant: string;
  categoryConfidence: number;
  confidence: number;
  sourceKind: string;
  directionBasis?: string;
  uiKey: string;
  promptKey: string;
  rawAmount: number;
  directionForTotals: 'income' | 'expense';
  overrideApplied: boolean;
  overrideMatchKey: string;
};

function formatClp(value: number, currency = 'CLP'): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

function normalizeMovementText(value: string | null | undefined): string {
  return String(value ?? '')
    .toUpperCase()
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ')
    .replace(/\b\d{2}[/-]\d{2}(?:[/-]\d{2,4})?\b/g, ' ')
    .replace(/\b(?:INTERNET|CENTRAL)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isMissingDate(value?: string | null): boolean {
  const normalized = String(value ?? '').trim().toUpperCase();
  return normalized.length === 0 || normalized === 'N/D' || normalized === 'ND';
}

function extractDateTokens(value: string): string[] {
  const source = String(value ?? '').trim();
  if (!source) return [];
  const tokens = new Set<string>();
  const isoMatch = source.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) {
    tokens.add(`${isoMatch[3]}/${isoMatch[2]}`);
    tokens.add(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`);
  }
  const dmMatch = source.match(/\b(\d{2})[/-](\d{2})(?:[/-](\d{2,4}))?\b/);
  if (dmMatch) {
    tokens.add(`${dmMatch[1]}/${dmMatch[2]}`);
    if (dmMatch[3]) {
      const yyyy = dmMatch[3].length === 2 ? `20${dmMatch[3]}` : dmMatch[3];
      tokens.add(`${yyyy}-${dmMatch[2]}-${dmMatch[1]}`);
    }
  }
  return Array.from(tokens);
}

function buildDedupKey(dateToken: string, direction: 'income' | 'expense', amountAbs: number, label: string): string {
  return `${dateToken}|${direction}|${Math.round(amountAbs)}|${normalizeMovementText(label)}`;
}

function deriveAlertDetails(
  enrichedCategoryData: Array<{ name: string; share: number }>,
): NonNullable<BankProduct['dashboard']>['alertDetails'] {
  const dominant = enrichedCategoryData[0];
  if (!dominant || dominant.share < 28) return [];
  return [
    {
      title: 'Concentración de gasto',
      severity: dominant.share >= 45 ? 'high' : 'medium',
      reason: `${dominant.name} concentra ${dominant.share.toFixed(1)}% del gasto detectado.`,
    },
  ];
}

export type ComputeMovementAnalyticsInput = {
  dashboard: BankProduct['dashboard'] | null | undefined;
  productType: BankProduct['productType'];
  taxonomyOverrides?: TransactionTaxonomyOverride[];
};

export type ComputeMovementAnalyticsResult = {
  dedupedMovementRows: NormalizedMovementRow[];
  incomeOrAbonoRows: NormalizedMovementRow[];
  expenseRows: NormalizedMovementRow[];
  tableDerivedMetrics: { inflowsTotal: number; outflowsTotal: number };
  movementCount: number;
  netFlowFromTable: number;
  avgMovementFromTable: number;
  flowRatioFromTable: number;
  tablePeriod: { from: string; to: string };
  summaryFromTable: string;
  inflowLabel: string;
  verifiedTableRows: number;
  highConfidenceMovementCount: number;
  movementCoverageDisplay: number;
  enrichedCategoryData: Array<{ name: string; amount: number; count: number; share: number }>;
  derivedTopMerchants: NonNullable<BankProduct['dashboard']>['topMerchants'];
  merchantConfidenceRows: Array<{
    merchant: string;
    category: string;
    count: number;
    manual: boolean;
    avgConfidence: number;
  }>;
  effectiveDashboard: NonNullable<BankProduct['dashboard']>;
  alertDetails: NonNullable<BankProduct['dashboard']>['alertDetails'];
  alerts: string[];
  metricExplanations: NonNullable<BankProduct['dashboard']>['metricExplanations'];
  keyMetrics: NonNullable<BankProduct['dashboard']>['keyMetrics'];
};

export function computeMovementAnalytics(input: ComputeMovementAnalyticsInput): ComputeMovementAnalyticsResult {
  const dashboard = input.dashboard ?? {};
  const dashboardMetrics = dashboard.keyMetrics;
  const isCreditCardProduct = input.productType === 'credit_card';
  const currency = dashboard.currency || 'CLP';
  const taxonomyOverrides = input.taxonomyOverrides ?? [];
  const dashboardPeriod = dashboard.period;

  const dashboardMovements = (dashboard.movements ?? []).map((movement) => {
    const signedAmount = resolveSignedAmount({
      amount: Number(movement.amount) || 0,
      amountSigned: Number.isFinite(Number(movement.amount_signed)) ? Number(movement.amount_signed) : undefined,
      direction: movement.direction,
    });
    const direction = resolveMovementDirectionForTotals({
      apiDirection: movement.direction,
      movementKind: movement.movement_kind,
      signedAmount,
      isCreditCardProduct,
    });
    return {
      label: movement.description ?? movement.source_line ?? movement.merchant ?? '',
      amount: Math.abs(Number(movement.amount) || 0),
      signedAmount,
      direction,
      movementKind: resolveMovementKind({
        apiKind: movement.movement_kind,
        directionForTotals: direction,
        signedAmount,
        isCreditCardProduct,
      }),
      date: movement.date ?? '',
      sourceLine: movement.source_line ?? '',
      category: movement.category ?? '',
      merchant: movement.merchant ?? '',
      categoryConfidence: Number(movement.category_confidence ?? 0) || 0,
      confidence: Number(movement.confidence ?? 0) || 0,
      sourceKind: movement.source_kind ?? 'line',
      directionBasis: movement.direction_basis ?? '',
    };
  });

  const normalizedMovementRows = dashboardMovements.map((movement, idx) => {
    const rawAmount = resolveSignedAmount({
      amount: Number(movement.amount) || 0,
      amountSigned: Number.isFinite(Number(movement.signedAmount)) ? Number(movement.signedAmount) : undefined,
      direction: movement.direction,
    });
    const normalizedDirection = resolveMovementDirectionForTotals({
      apiDirection: movement.direction,
      movementKind: movement.movementKind,
      signedAmount: rawAmount,
      isCreditCardProduct,
    });
    const movementKind = resolveMovementKind({
      apiKind: movement.movementKind,
      directionForTotals: normalizedDirection,
      signedAmount: rawAmount,
      isCreditCardProduct,
    });
    const baseRow = {
      ...movement,
      uiKey: `${movement.date ?? 'nd'}|${normalizedDirection}|${Math.round(Math.abs(rawAmount))}|${normalizeMovementText(movement.label)}|${idx}`,
      promptKey: buildMovementPromptKey({
        date: movement.date,
        merchant: movement.merchant,
        description: movement.label,
        label: movement.label,
        amount: rawAmount,
      }),
      rawAmount,
      directionForTotals: normalizedDirection,
      amount: Math.abs(rawAmount),
      movementKind,
    };
    const manualOverride = resolveTransactionOverride(baseRow, taxonomyOverrides);
    return manualOverride
      ? {
          ...baseRow,
          merchant: manualOverride.merchant,
          category: manualOverride.category,
          categoryConfidence: 0.999,
          overrideApplied: true,
          overrideMatchKey: manualOverride.matchKey,
        }
      : {
          ...baseRow,
          overrideApplied: false,
          overrideMatchKey: movementOverrideKey(baseRow),
        };
  }) as NormalizedMovementRow[];

  const datedMovementKeys = new Set<string>();
  normalizedMovementRows.forEach((movement) => {
    if (isMissingDate(movement.date)) return;
    extractDateTokens(movement.date).forEach((token) => {
      datedMovementKeys.add(buildDedupKey(token, movement.directionForTotals, movement.amount, movement.label));
    });
  });

  const dedupedMovementRows = normalizedMovementRows.filter((movement) => {
    if (!isMissingDate(movement.date)) return true;
    const embeddedDateTokens = extractDateTokens(movement.label);
    if (embeddedDateTokens.length === 0) return true;
    return !embeddedDateTokens.some((token) =>
      datedMovementKeys.has(buildDedupKey(token, movement.directionForTotals, movement.amount, movement.label)),
    );
  });

  const incomeOrAbonoRows = dedupedMovementRows.filter((m) => m.directionForTotals === 'income');
  const expenseRows = dedupedMovementRows.filter((m) => m.directionForTotals === 'expense');
  const hasAbonoRows = incomeOrAbonoRows.some((m) => m.movementKind === 'abono');
  const hasIncomeRows = incomeOrAbonoRows.some((m) => m.movementKind === 'income');
  const inflowLabel = hasAbonoRows ? (hasIncomeRows ? 'abonos e ingresos' : 'abonos') : 'ingresos';
  const expenseTotal = expenseRows.reduce((acc, m) => acc + m.amount, 0);

  const tableDerivedMetrics = dedupedMovementRows.reduce(
    (acc, movement) => {
      if (movement.directionForTotals === 'income') acc.inflowsTotal += movement.amount;
      else acc.outflowsTotal += movement.amount;
      return acc;
    },
    { inflowsTotal: 0, outflowsTotal: 0 },
  );

  const movementCount = dedupedMovementRows.length;
  const netFlowFromTable = tableDerivedMetrics.inflowsTotal - tableDerivedMetrics.outflowsTotal;
  const avgMovementFromTable =
    movementCount > 0
      ? (tableDerivedMetrics.inflowsTotal + tableDerivedMetrics.outflowsTotal) / movementCount
      : 0;
  const flowRatioFromTable =
    tableDerivedMetrics.inflowsTotal > 0
      ? tableDerivedMetrics.outflowsTotal / tableDerivedMetrics.inflowsTotal
      : 0;

  const datedRows = dedupedMovementRows
    .map((m) => m.date?.trim() ?? '')
    .filter((d) => d.length > 0)
    .sort((a, b) => a.localeCompare(b, 'es'));

  const tablePeriod = {
    from: datedRows[0] || dashboardPeriod?.from || 'N/D',
    to: datedRows[datedRows.length - 1] || dashboardPeriod?.to || 'N/D',
  };

  const summaryFromTable =
    movementCount > 0
      ? `Se analizaron ${movementCount.toLocaleString('es-CL')} movimientos sobre cartola de ${isCreditCardProduct ? 'tarjeta' : 'producto'}. Totales detectados desde tabla extraída: ${formatClp(tableDerivedMetrics.outflowsTotal, currency)} en egresos y ${formatClp(tableDerivedMetrics.inflowsTotal, currency)} en ${inflowLabel}; flujo neto ${formatClp(netFlowFromTable, currency)}.`
      : 'Aún no hay suficientes filas extraídas para construir un resumen analítico confiable.';

  const verifiedTableRows =
    Number(dashboardMetrics?.table_rows_verified ?? 0) ||
    dedupedMovementRows.filter((m) => m.sourceKind === 'table').length;

  const highConfidenceMovementCount =
    Number(dashboardMetrics?.high_confidence_movement_count ?? 0) ||
    dedupedMovementRows.filter((m) => (m.confidence ?? 0) >= 0.85).length;

  const movementCoverageDisplay =
    Number(dashboardMetrics?.movement_coverage_pct ?? 0) > 0
      ? Number(dashboardMetrics?.movement_coverage_pct ?? 0)
      : movementCount > 0 && dashboardMetrics?.table_rows_processed && dashboardMetrics.table_rows_processed > 0
        ? Math.min(100, (movementCount / dashboardMetrics.table_rows_processed) * 100)
        : 0;

  const enrichedCategoryData = (() => {
    const byCategory = new Map<string, { amount: number; count: number }>();
    expenseRows.forEach((m) => {
      const key = m.category?.trim() || 'Otros';
      const current = byCategory.get(key) ?? { amount: 0, count: 0 };
      current.amount += m.amount;
      current.count += 1;
      byCategory.set(key, current);
    });
    return Array.from(byCategory.entries())
      .map(([name, data]) => ({
        name,
        amount: data.amount,
        count: data.count,
        share: expenseTotal > 0 ? (data.amount / expenseTotal) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6);
  })();

  const derivedTopMerchants = (() => {
    const buckets = new Map<string, { merchant: string; category: string; amount: number; tx_count: number }>();
    expenseRows.forEach((m) => {
      const merchant = String(m.merchant || m.label || '').trim();
      if (!merchant) return;
      const key = normalizeTaxonomyKey(merchant);
      const current = buckets.get(key) ?? {
        merchant,
        category: m.category || 'Consumo general',
        amount: 0,
        tx_count: 0,
      };
      current.amount += m.amount;
      current.tx_count += 1;
      current.category = m.category || current.category;
      current.merchant = m.merchant || current.merchant;
      buckets.set(key, current);
    });
    return Array.from(buckets.values())
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8);
  })();

  const merchantConfidenceRows = (() => {
    const buckets = new Map<
      string,
      { merchant: string; avgConfidence: number; count: number; manual: boolean; category: string }
    >();
    expenseRows.forEach((m) => {
      const merchant = String(m.merchant || m.label || '').trim();
      if (!merchant) return;
      const key = normalizeTaxonomyKey(merchant);
      const current = buckets.get(key) ?? {
        merchant,
        avgConfidence: 0,
        count: 0,
        manual: false,
        category: m.category || 'Consumo general',
      };
      current.avgConfidence += Number(m.categoryConfidence ?? m.confidence ?? 0) || 0;
      current.count += 1;
      current.manual = current.manual || Boolean(m.overrideApplied);
      current.category = m.category || current.category;
      buckets.set(key, current);
    });
    return Array.from(buckets.values())
      .map((item) => ({
        merchant: item.merchant,
        category: item.category,
        count: item.count,
        manual: item.manual,
        avgConfidence: item.count > 0 ? item.avgConfidence / item.count : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  })();

  const spendClusters = enrichedCategoryData.map((item) => ({
    name: item.name,
    amount: Math.round(item.amount),
    tx_count: item.count,
    avg_ticket: item.count > 0 ? Math.round(item.amount / item.count) : 0,
    share_pct: Number(item.share.toFixed(2)),
    examples: dedupedMovementRows
      .filter((m) => m.directionForTotals === 'expense' && (m.category || 'Otros') === item.name)
      .slice(0, 3)
      .map((m) => m.merchant || m.label),
  }));

  const canonicalMovements = dedupedMovementRows.map((m) => ({
    date: m.date ?? '',
    description: m.label,
    amount: m.amount,
    amount_signed: m.rawAmount,
    direction: m.directionForTotals,
    movement_kind: m.movementKind,
    direction_basis: m.directionBasis ?? '',
    source_line: m.sourceLine ?? '',
    category: m.category ?? 'Consumo general',
    merchant: m.merchant ?? '',
    category_confidence: m.categoryConfidence ?? m.confidence ?? 0,
    confidence: m.confidence ?? 0,
    source_kind: m.sourceKind as 'table' | 'line',
  }));

  const abonosTotal = incomeOrAbonoRows
    .filter((m) => m.movementKind === 'abono')
    .reduce((acc, m) => acc + m.amount, 0);

  const keyMetrics: NonNullable<BankProduct['dashboard']>['keyMetrics'] = {
    inflows_total: Math.round(tableDerivedMetrics.inflowsTotal),
    abonos_total: Math.round(abonosTotal),
    outflows_total: Math.round(tableDerivedMetrics.outflowsTotal),
    net_flow: Math.round(netFlowFromTable),
    avg_movement: Math.round(avgMovementFromTable),
    movement_count: movementCount,
    median_movement: dashboardMetrics?.median_movement,
    p90_movement: dashboardMetrics?.p90_movement,
    max_income: incomeOrAbonoRows.reduce((max, row) => Math.max(max, row.amount), 0),
    max_expense: expenseRows.reduce((max, row) => Math.max(max, row.amount), 0),
    expense_to_income_ratio: flowRatioFromTable > 0 ? Number(flowRatioFromTable.toFixed(4)) : undefined,
    table_rows_processed: dashboardMetrics?.table_rows_processed,
    movement_coverage_pct: Number(movementCoverageDisplay.toFixed(2)),
    table_rows_verified: verifiedTableRows,
    high_confidence_movement_count: highConfidenceMovementCount,
    avg_category_confidence: dashboardMetrics?.avg_category_confidence,
  };

  const alertDetails = deriveAlertDetails(enrichedCategoryData);
  const alerts = alertDetails?.map((alert) => alert.reason) ?? [];

  const metricExplanations: NonNullable<BankProduct['dashboard']>['metricExplanations'] =
    movementCount === 0
      ? dashboard.metricExplanations
      : [
          {
            metric: 'Flujo neto',
            value: formatClp(netFlowFromTable, currency),
            explanation: 'Diferencia entre ingresos detectados y egresos detectados del periodo.',
          },
          {
            metric: 'Ratio gasto/ingreso',
            value: flowRatioFromTable > 0 ? `${(flowRatioFromTable * 100).toFixed(1)}%` : 'N/D',
            explanation: 'Mide presión de gasto: sobre 100% implica déficit operativo.',
          },
          {
            metric: 'Cobertura tabular',
            value: formatPercentCompact(movementCoverageDisplay),
            explanation: 'Proporción de movimientos estructurados sobre filas procesadas.',
          },
          {
            metric: 'Filas fieles de tabla',
            value: formatPercentCompact(movementCount > 0 ? (verifiedTableRows / movementCount) * 100 : 0),
            explanation:
              'Porcentaje de movimientos reconstruidos desde tablas detectadas, no solo desde texto libre.',
          },
        ];

  const topCategories = enrichedCategoryData.map((item) => ({ name: item.name, amount: Math.round(item.amount) }));
  const topExpenses = [...expenseRows]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 8)
    .map((row) => ({ label: row.label, amount: row.amount, date: row.date }));
  const topIncome = [...incomeOrAbonoRows]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 8)
    .map((row) => ({ label: row.label, amount: row.amount, date: row.date }));

  const effectiveDashboard: NonNullable<BankProduct['dashboard']> = {
    ...dashboard,
    period: tablePeriod,
    currency,
    keyMetrics,
    topCategories,
    topMerchants: derivedTopMerchants,
    spendClusters,
    topExpenses,
    topIncome,
    alerts,
    alertDetails,
    metricExplanations,
    movements: canonicalMovements,
  };

  return {
    dedupedMovementRows,
    incomeOrAbonoRows,
    expenseRows,
    tableDerivedMetrics,
    movementCount,
    netFlowFromTable,
    avgMovementFromTable,
    flowRatioFromTable,
    tablePeriod,
    summaryFromTable,
    inflowLabel,
    verifiedTableRows,
    highConfidenceMovementCount,
    movementCoverageDisplay,
    enrichedCategoryData,
    derivedTopMerchants,
    merchantConfidenceRows,
    effectiveDashboard,
    alertDetails,
    alerts,
    metricExplanations,
    keyMetrics,
  };
}
