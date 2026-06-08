import type { BankProduct } from '@/app/agent/transactions/types';
import { buildProductInstantSummary, isIndicativeEvidenceProduct } from '@/lib/evidence-fidelity.helpers';

function formatClp(value: number): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

export function resolveInstantTransactionSummary(
  dashboard: BankProduct['dashboard'] | null | undefined,
  productType?: BankProduct['productType'],
): string | null {
  const existing = typeof dashboard?.summary === 'string' ? dashboard.summary.trim() : '';
  if (existing.length >= 40) return existing;

  const metrics = dashboard?.keyMetrics;
  const movementCount = Number(metrics?.movement_count ?? 0) || 0;
  if (movementCount <= 0) return existing || null;

  if (
    dashboard?.evidenceFidelity === 'indicative' ||
    (dashboard ? isIndicativeEvidenceProduct({ dashboard, parsedDocuments: [] }) : false)
  ) {
    return (buildProductInstantSummary(dashboard, productType) ?? existing) || null;
  }

  const inflows = Number(metrics?.inflows_total ?? 0) || 0;
  const outflows = Number(metrics?.outflows_total ?? 0) || 0;
  const netFlow = Number(metrics?.net_flow ?? inflows - outflows) || 0;
  const tableVerified = Number(metrics?.table_rows_verified ?? 0) || 0;
  const period = dashboard?.period;
  const periodLabel =
    period?.from && period?.to ? ` (${period.from} a ${period.to})` : '';

  const lines = [
    `Se detectaron ${movementCount} movimientos válidos${periodLabel}${tableVerified > 0 ? `, ${tableVerified} desde tabla estructurada` : ''}. Ingresos ${formatClp(inflows)}, egresos ${formatClp(outflows)} y flujo neto ${formatClp(netFlow)}.`,
  ];

  const topCategories = dashboard?.topCategories ?? [];
  if (topCategories.length > 0) {
    lines.push(
      `Principales categorías: ${topCategories
        .slice(0, 3)
        .map((category) => `${category.name} ${formatClp(Number(category.amount) || 0)}`)
        .join('; ')}.`,
    );
  }

  const topMerchants = dashboard?.topMerchants ?? [];
  if (topMerchants.length > 0) {
    lines.push(
      `Comercios destacados: ${topMerchants
        .slice(0, 2)
        .map((merchant) => `${merchant.merchant} (${formatClp(Number(merchant.amount) || 0)})`)
        .join(', ')}.`,
    );
  }

  const alerts = dashboard?.alerts ?? [];
  if (alerts.length > 0) {
    lines.push(`Puntos a revisar: ${alerts.slice(0, 2).join(' ')}`);
  }

  return lines.join(' ');
}
