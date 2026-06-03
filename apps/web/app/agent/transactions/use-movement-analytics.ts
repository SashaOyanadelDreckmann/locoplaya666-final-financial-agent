import { useCallback, useMemo } from 'react';
import { formatPercentCompact } from './presentation';
import { movementOverrideKey, normalizeTaxonomyKey, resolveTransactionOverride } from './taxonomy';
import type { BankProduct, TransactionTaxonomyOverride } from './types';

export type NormalizedMovementRow = {
  label: string;
  amount: number;
  direction: 'income' | 'expense';
  date: string;
  sourceLine: string;
  category: string;
  merchant: string;
  categoryConfidence: number;
  confidence: number;
  sourceKind: string;
  uiKey: string;
  rawAmount: number;
  directionForTotals: 'income' | 'expense';
  overrideApplied: boolean;
  overrideMatchKey: string;
};

export function useMovementAnalytics(
  activeBankProduct: BankProduct | null,
  transactionTaxonomyOverrides: TransactionTaxonomyOverride[],
) {
  const currency = activeBankProduct?.dashboard?.currency || 'CLP';
  const formatCurrency = useCallback(
    (value: number) =>
      new Intl.NumberFormat('es-CL', {
        style: 'currency',
        currency,
        maximumFractionDigits: 0,
      }).format(Number.isFinite(value) ? value : 0),
    [currency],
  );

  const dashboardMetrics = activeBankProduct?.dashboard?.keyMetrics;
  const isCreditCardProduct = activeBankProduct?.productType === 'credit_card';
  const dashboardCategories = activeBankProduct?.dashboard?.topCategories ?? [];
  const dashboardClusters = activeBankProduct?.dashboard?.spendClusters ?? [];
  const alertDetails = activeBankProduct?.dashboard?.alertDetails ?? [];
  const metricExplanations = activeBankProduct?.dashboard?.metricExplanations ?? [];
  const dashboardPeriod = activeBankProduct?.dashboard?.period;

  const documentQualityRows = (activeBankProduct?.parsedDocuments ?? [])
    .filter((doc) => doc.insight)
    .map((doc) => ({
      name: doc.name,
      reliabilityPct: Math.round((doc.insight?.reliability ?? 0) * 100),
      extractedRows: Number(doc.insight?.extracted_rows ?? 0),
      findings: Array.isArray(doc.insight?.key_findings) ? doc.insight!.key_findings!.slice(0, 3) : [],
    }));

  const qualityAverage =
    documentQualityRows.length > 0
      ? Math.round(
          documentQualityRows.reduce((acc, item) => acc + item.reliabilityPct, 0) / documentQualityRows.length,
        )
      : 0;

  const totalCategoryAmount = dashboardCategories.reduce((acc, c) => acc + (Number(c.amount) || 0), 0);
  const categoryShareData = dashboardCategories.slice(0, 6).map((category) => ({
    category: category.name,
    amount: category.amount,
    share: totalCategoryAmount > 0 ? Number(((category.amount / totalCategoryAmount) * 100).toFixed(2)) : 0,
  }));

  const qualityRowsChart = documentQualityRows.map((row) => ({
    document: row.name.length > 18 ? `${row.name.slice(0, 18)}…` : row.name,
    reliability: row.reliabilityPct,
    rows: row.extractedRows,
  }));

  const normalizeMovementText = (value: string) =>
    value
      .toUpperCase()
      .replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ')
      .replace(/\b\d{2}[/-]\d{2}(?:[/-]\d{2,4})?\b/g, ' ')
      .replace(/\b(?:INTERNET|CENTRAL)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const isMissingDate = (value?: string | null) => {
    const normalized = String(value ?? '').trim().toUpperCase();
    return normalized.length === 0 || normalized === 'N/D' || normalized === 'ND';
  };

  const extractDateTokens = (value: string): string[] => {
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
  };

  const buildDedupKey = (dateToken: string, direction: 'income' | 'expense', amountAbs: number, label: string) =>
    `${dateToken}|${direction}|${Math.round(amountAbs)}|${normalizeMovementText(label)}`;

  const dashboardMovements = (activeBankProduct?.dashboard?.movements ?? []).map((movement) => ({
    label: movement.description,
    amount: Number(movement.amount) || 0,
    direction: movement.direction,
    date: movement.date ?? '',
    sourceLine: movement.source_line ?? '',
    category: movement.category ?? '',
    merchant: movement.merchant ?? '',
    categoryConfidence: Number(movement.category_confidence ?? 0) || 0,
    confidence: Number(movement.confidence ?? 0) || 0,
    sourceKind: movement.source_kind ?? 'line',
  }));

  const topMovements = [...dashboardMovements].sort((a, b) => {
    if (b.amount !== a.amount) return b.amount - a.amount;
    if (a.direction !== b.direction) return a.direction === 'expense' ? -1 : 1;
    return a.label.localeCompare(b.label, 'es');
  });

  const movementTableRows = dashboardMovements.length > 0 ? dashboardMovements : topMovements;

  const normalizedMovementRows = movementTableRows.map((movement, idx) => {
    const rawAmount = Number(movement.amount) || 0;
    const hasDeclaredDirection = movement.direction === 'income' || movement.direction === 'expense';
    const normalizedDirection = hasDeclaredDirection
      ? movement.direction
      : rawAmount < 0
        ? 'expense'
        : rawAmount > 0
          ? 'income'
          : 'expense';
    const baseRow = {
      ...movement,
      uiKey: `${movement.date ?? 'nd'}|${normalizedDirection}|${Math.round(Math.abs(rawAmount))}|${normalizeMovementText(movement.label)}|${idx}`,
      rawAmount,
      directionForTotals: normalizedDirection as 'income' | 'expense',
      amount: Math.abs(rawAmount),
    };
    const manualOverride = resolveTransactionOverride(baseRow, transactionTaxonomyOverrides);
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
  });

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
  }) as NormalizedMovementRow[];

  const incomeOrAbonoRows = dedupedMovementRows.filter((m) => m.directionForTotals === 'income');
  const expenseRows = dedupedMovementRows.filter((m) => m.directionForTotals === 'expense');
  const incomeOrAbonoTotal = incomeOrAbonoRows.reduce((acc, m) => acc + m.amount, 0);
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
      ? `Se analizaron ${movementCount.toLocaleString('es-CL')} movimientos sobre cartola de ${isCreditCardProduct ? 'tarjeta' : 'producto'}. Totales detectados desde tabla extraída: ${formatCurrency(tableDerivedMetrics.outflowsTotal)} en egresos y ${formatCurrency(tableDerivedMetrics.inflowsTotal)} en ${isCreditCardProduct ? 'abonos' : 'ingresos'}; flujo neto ${formatCurrency(netFlowFromTable)}.`
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

  const enrichedCategoryData = useMemo(() => {
    const byCategory = new Map<string, { amount: number; count: number }>();
    dedupedMovementRows
      .filter((m) => m.directionForTotals === 'expense')
      .forEach((m) => {
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
  }, [dedupedMovementRows, expenseTotal]);

  const txNarrative = useMemo(() => {
    const dominantCategory = enrichedCategoryData[0];
    const concentration = dominantCategory?.share ?? 0;
    const fidelityPct = movementCount > 0 ? (verifiedTableRows / movementCount) * 100 : 0;
    const confidencePct = movementCount > 0 ? (highConfidenceMovementCount / movementCount) * 100 : 0;
    return {
      marketAngle:
        dominantCategory && concentration >= 28
          ? `${dominantCategory.name} está marcando el ritmo del período con ${formatPercentCompact(concentration)} del gasto detectado.`
          : 'El gasto está más repartido, sin una sola categoría dominando de forma extrema.',
      fidelityAngle:
        fidelityPct >= 70
          ? `La lectura es mayoritariamente tabular: ${formatPercentCompact(fidelityPct)} de los movimientos proviene de filas estructuradas.`
          : 'Una parte relevante del análisis todavía depende de texto libre; conviene reforzar cartolas nítidas o planillas.',
      confidenceAngle:
        confidencePct >= 75
          ? `La muestra viene sólida: ${formatPercentCompact(confidencePct)} de los movimientos quedó en banda alta/media-alta de confianza.`
          : 'La confianza del set todavía es mixta; el resumen debe leerse con cautela operativa.',
      cashAngle:
        netFlowFromTable >= 0
          ? `El flujo neto quedó positivo en ${formatCurrency(netFlowFromTable)}.`
          : `El flujo neto quedó presionado en ${formatCurrency(netFlowFromTable)}.`,
      anchors: [expenseRows[0]?.label, incomeOrAbonoRows[0]?.label].filter(Boolean) as string[],
    };
  }, [
    enrichedCategoryData,
    movementCount,
    verifiedTableRows,
    highConfidenceMovementCount,
    expenseRows,
    incomeOrAbonoRows,
    netFlowFromTable,
    formatCurrency,
  ]);

  const categoryChartData =
    enrichedCategoryData.length > 0
      ? enrichedCategoryData.map((c) => ({
          category: c.name,
          amount: c.amount,
          share: Number(c.share.toFixed(2)),
        }))
      : categoryShareData;

  const derivedTopMerchants = useMemo(() => {
    const buckets = new Map<string, { merchant: string; category: string; amount: number; tx_count: number }>();
    dedupedMovementRows
      .filter((m) => m.directionForTotals === 'expense')
      .forEach((m) => {
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
  }, [dedupedMovementRows]);

  const merchantConfidenceRows = useMemo(() => {
    const buckets = new Map<
      string,
      { merchant: string; avgConfidence: number; count: number; manual: boolean; category: string }
    >();
    dedupedMovementRows.forEach((m) => {
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
  }, [dedupedMovementRows]);

  const effectiveDashboard = useMemo(
    () => ({
      ...(activeBankProduct?.dashboard ?? {}),
      topCategories: enrichedCategoryData.map((item) => ({ name: item.name, amount: Math.round(item.amount) })),
      topMerchants: derivedTopMerchants,
      spendClusters: enrichedCategoryData.map((item) => ({
        name: item.name,
        amount: Math.round(item.amount),
        tx_count: item.count,
        avg_ticket: item.count > 0 ? Math.round(item.amount / item.count) : 0,
        share_pct: Number(item.share.toFixed(2)),
        examples: dedupedMovementRows
          .filter((m) => m.directionForTotals === 'expense' && (m.category || 'Otros') === item.name)
          .slice(0, 3)
          .map((m) => m.merchant || m.label),
      })),
      movements: dedupedMovementRows.map((m) => ({
        date: m.date ?? '',
        description: m.label,
        amount: m.amount,
        direction: m.directionForTotals,
        source_line: m.sourceLine ?? '',
        category: m.category ?? 'Consumo general',
        merchant: m.merchant ?? '',
        category_confidence: m.categoryConfidence ?? m.confidence ?? 0,
        confidence: m.confidence ?? 0,
        source_kind: m.sourceKind ?? 'line',
      })),
    }),
    [activeBankProduct?.dashboard, enrichedCategoryData, derivedTopMerchants, dedupedMovementRows],
  );

  return {
    formatCurrency,
    isCreditCardProduct,
    dashboardClusters,
    alertDetails,
    metricExplanations,
    documentQualityRows,
    qualityAverage,
    categoryShareData,
    qualityRowsChart,
    dedupedMovementRows,
    incomeOrAbonoRows,
    expenseRows,
    incomeOrAbonoTotal,
    expenseTotal,
    tableDerivedMetrics,
    movementCount,
    netFlowFromTable,
    avgMovementFromTable,
    flowRatioFromTable,
    tablePeriod,
    summaryFromTable,
    verifiedTableRows,
    highConfidenceMovementCount,
    movementCoverageDisplay,
    enrichedCategoryData,
    txNarrative,
    categoryChartData,
    derivedTopMerchants,
    merchantConfidenceRows,
    effectiveDashboard,
  };
}
