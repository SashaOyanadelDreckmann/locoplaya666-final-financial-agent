import { resolveInstantTransactionSummary } from '@/lib/transacciones/resumen.helpers';
import { computeMovementAnalytics } from './compute-movement-analytics';
import type { BankProduct, TransactionTaxonomyOverride } from './types';

export function alignProductDashboard(
  product: Pick<BankProduct, 'dashboard' | 'productType'>,
  taxonomyOverrides: TransactionTaxonomyOverride[] = [],
): BankProduct['dashboard'] | undefined {
  const dashboard = product.dashboard;
  if (!dashboard?.movements?.length) return dashboard;

  const computed = computeMovementAnalytics({
    dashboard,
    productType: product.productType,
    taxonomyOverrides,
  });

  if (computed.movementCount === 0) return dashboard;

  const preserveIndicativeSummary = dashboard.evidenceFidelity === 'indicative';
  const aligned = {
    ...computed.effectiveDashboard,
    evidenceFidelity: dashboard.evidenceFidelity,
    evidenceFidelityReason: dashboard.evidenceFidelityReason,
    summary: preserveIndicativeSummary
      ? dashboard.summary ?? computed.summaryFromTable
      : resolveInstantTransactionSummary(computed.effectiveDashboard, product.productType) ??
        computed.summaryFromTable ??
        dashboard.summary,
  };

  return aligned;
}

export function alignBankProduct(
  product: BankProduct,
  taxonomyOverrides: TransactionTaxonomyOverride[] = [],
): BankProduct {
  const alignedDashboard = alignProductDashboard(product, taxonomyOverrides);
  if (!alignedDashboard || alignedDashboard === product.dashboard) return product;
  return {
    ...product,
    dashboard: alignedDashboard,
  };
}
