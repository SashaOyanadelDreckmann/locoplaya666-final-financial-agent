import { alignProductDashboard } from '@/app/agent/modales/transacciones/align-product-dashboard';
import type { BankProduct, TransactionTaxonomyOverride } from '@/app/agent/modales/transacciones/types';
import type { BudgetProductSnapshot } from '@financial-agent/shared';

const MAX_MOVEMENTS_PER_PRODUCT = 120;

export function buildBudgetAssistantProductsFromBankSimulation(
  products: BankProduct[],
  taxonomyOverrides: TransactionTaxonomyOverride[] = [],
): BudgetProductSnapshot[] {
  return products.map((product) => {
    const dashboard = alignProductDashboard(product, taxonomyOverrides) ?? product.dashboard;
    const movements = (dashboard?.movements ?? [])
      .map((movement) => ({
        date: movement.date,
        description: movement.description,
        amount: Math.max(0, Math.round(Math.abs(Number(movement.amount) || 0))),
        direction: movement.direction === 'income' ? ('income' as const) : ('expense' as const),
        category: movement.category,
        merchant: movement.merchant,
        confidence: movement.category_confidence ?? movement.confidence,
      }))
      .filter((movement) => movement.description && movement.amount > 0)
      .slice(0, MAX_MOVEMENTS_PER_PRODUCT);

    return {
      productId: product.id,
      label: product.label?.trim() || product.bank || 'Producto bancario',
      bank: product.bank,
      productType: product.productType,
      period: dashboard?.period,
      evidenceFidelity: dashboard?.evidenceFidelity,
      movements,
    };
  });
}
