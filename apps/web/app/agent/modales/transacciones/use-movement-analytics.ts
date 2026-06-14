import { useCallback, useMemo } from 'react';
import { readProductEvidenceFidelity } from '@/lib/compartido/evidence-fidelity.helpers';
import { resolveInstantTransactionSummary } from '@/lib/transacciones/resumen.helpers';
import { computeMovementAnalytics } from './compute-movement-analytics';
import { formatPercentCompact } from './presentation';
import type { BankProduct, TransactionTaxonomyOverride } from './types';

export type { NormalizedMovementRow } from './compute-movement-analytics';

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

  const dashboardCategories = activeBankProduct?.dashboard?.topCategories ?? [];

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

  const computed = useMemo(
    () =>
      computeMovementAnalytics({
        dashboard: activeBankProduct?.dashboard,
        productType: activeBankProduct?.productType ?? 'credit_card',
        taxonomyOverrides: transactionTaxonomyOverrides,
      }),
    [activeBankProduct?.dashboard, activeBankProduct?.productType, transactionTaxonomyOverrides],
  );

  const {
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
    metricExplanations,
  } = computed;

  const isCreditCardProduct = activeBankProduct?.productType === 'credit_card';
  const isIndicativeEvidence = readProductEvidenceFidelity(activeBankProduct) === 'indicative';
  const evidenceFidelityReason = activeBankProduct?.dashboard?.evidenceFidelityReason ?? null;
  const dashboardClusters = effectiveDashboard.spendClusters ?? [];

  const incomeOrAbonoTotal = tableDerivedMetrics.inflowsTotal;
  const expenseTotal = tableDerivedMetrics.outflowsTotal;

  const txNarrative = useMemo(() => {
    const dominantCategory = enrichedCategoryData[0];
    const concentration = dominantCategory?.share ?? 0;
    const fidelityPct = movementCount > 0 ? (verifiedTableRows / movementCount) * 100 : 0;
    const confidencePct = movementCount > 0 ? (highConfidenceMovementCount / movementCount) * 100 : 0;

    if (isIndicativeEvidence) {
      return {
        marketAngle:
          dominantCategory && concentration >= 20
            ? `Patrón visible: ${dominantCategory.name} aparece entre los rubros más relevantes del antecedente.`
            : 'El gasto parece repartido; no hay un solo rubro dominante en esta lectura orientativa.',
        fidelityAngle:
          'Antecedente visual o texto libre: priorizamos patrones, categorías y cargos visibles sobre totales exactos.',
        confidenceAngle:
          confidencePct >= 60
            ? `Señales legibles en ${formatPercentCompact(confidencePct)} de los movimientos; aun así es una estimación, no un cierre contable.`
            : 'La muestra es parcial; úsala para orientarte, no para cerrar cifras.',
        cashAngle:
          netFlowFromTable >= 0
            ? `Flujo neto estimado ~${formatCurrency(netFlowFromTable)}; no lo uses como saldo oficial.`
            : `Presión de caja estimada ~${formatCurrency(Math.abs(netFlowFromTable))}; confirma con un archivo estructurado si necesitas exactitud.`,
        anchors: [expenseRows[0]?.label, incomeOrAbonoRows[0]?.label].filter(Boolean) as string[],
      };
    }

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
    isIndicativeEvidence,
  ]);

  const categoryChartData =
    enrichedCategoryData.length > 0
      ? enrichedCategoryData.map((c) => ({
          category: c.name,
          amount: c.amount,
          share: Number(c.share.toFixed(2)),
        }))
      : categoryShareData;

  const alignedExecutiveSummary =
    movementCount > 0
      ? resolveInstantTransactionSummary(effectiveDashboard) ?? summaryFromTable
      : null;

  return {
    formatCurrency,
    isCreditCardProduct,
    dashboardClusters,
    alertDetails: alertDetails ?? [],
    metricExplanations: metricExplanations ?? [],
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
    alignedExecutiveSummary,
    inflowLabel,
    verifiedTableRows,
    highConfidenceMovementCount,
    movementCoverageDisplay,
    enrichedCategoryData,
    txNarrative,
    categoryChartData,
    derivedTopMerchants: derivedTopMerchants ?? [],
    merchantConfidenceRows,
    effectiveDashboard,
    isIndicativeEvidence,
    evidenceFidelityReason,
  };
}
