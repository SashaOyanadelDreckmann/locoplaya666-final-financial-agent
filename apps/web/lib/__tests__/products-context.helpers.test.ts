/** @jest-environment node */

import {
  aggregateCanonicalMovements,
  buildPersistableProductsContext,
  getSimulationSnapshot,
} from '../products-context.helpers';
import type { BankProduct } from '@/app/agent/transactions/types';

function product(partial: Partial<BankProduct> & Pick<BankProduct, 'id'>): BankProduct {
  return {
    id: partial.id,
    label: partial.label ?? 'Cuenta',
    bank: partial.bank ?? 'Banco',
    simulationAccepted: partial.simulationAccepted ?? true,
    connected: partial.connected ?? true,
    randomMode: partial.randomMode ?? false,
    productType: partial.productType ?? 'checking_account',
    uploadedFiles: partial.uploadedFiles ?? [],
    parsedDocuments: partial.parsedDocuments ?? [],
    dashboard: partial.dashboard,
    assistant: partial.assistant,
  };
}

describe('products-context helpers', () => {
  it('dedupes movements across products', () => {
    const movement = {
      description: 'Super',
      amount: 1000,
      direction: 'expense' as const,
      date: '2026-01-01',
    };
    const products = [
      product({ id: 'a', dashboard: { movements: [movement] } }),
      product({ id: 'b', dashboard: { movements: [movement] } }),
    ];
    expect(aggregateCanonicalMovements(products)).toHaveLength(1);
  });

  it('builds persistable context with transaction summary', () => {
    const products = [
      product({
        id: 'a',
        connected: true,
        dashboard: {
          keyMetrics: { inflows_total: 100, outflows_total: 40, net_flow: 60, avg_movement: 10, movement_count: 2 },
          topCategories: [{ name: 'Food', amount: 40 }],
          alerts: ['High spend'],
        },
      }),
    ];
    const ctx = buildPersistableProductsContext(products, 'a');
    expect(ctx.scope).toBe('all_products');
    expect(ctx.activeProductId).toBe('a');
    expect(ctx.transactionSummary.inflowsTotal).toBe(100);
    expect(ctx.transactionSummary.topCategories[0]?.name).toBe('Food');
  });

  it('returns simulation snapshot for active product', () => {
    const products = [product({ id: 'a', connected: true, uploadedFiles: ['f1.pdf'] })];
    const snap = getSimulationSnapshot(products, 'a');
    expect(snap.connected).toBe(true);
    expect(snap.uploadedFiles).toEqual(['f1.pdf']);
  });
});
