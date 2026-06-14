import { alignProductDashboard } from '../align-product-dashboard';
import type { BankProduct } from '../types';

describe('alignProductDashboard', () => {
  it('recomputes key metrics and categories from canonical movements', () => {
    const dashboard: NonNullable<BankProduct['dashboard']> = {
      keyMetrics: {
        inflows_total: 0,
        outflows_total: 734_340,
        net_flow: -734_340,
        avg_movement: 27_198,
        movement_count: 27,
      },
      topCategories: [{ name: 'Transferencias', amount: 336_466 }],
      spendClusters: [
        {
          name: 'Transferencias',
          amount: 336_466,
          tx_count: 5,
          avg_ticket: 67_293,
          share_pct: 45.8,
          examples: ['Pago Pesos TEF'],
        },
      ],
      movements: [
        {
          date: '2026-05-18',
          description: 'Pago Pesos TEF',
          amount: 100_000,
          direction: 'income',
          movement_kind: 'abono',
          category: 'Transferencias',
          merchant: 'PESOS',
          confidence: 0.9,
          source_kind: 'table',
        },
        {
          date: '2026-05-15',
          description: 'EKONO COVENTRY SANTIAGO',
          amount: 4_100,
          direction: 'expense',
          movement_kind: 'expense',
          category: 'Supermercado',
          merchant: 'Ekono',
          confidence: 0.99,
          source_kind: 'table',
        },
      ],
    };

    const aligned = alignProductDashboard({ dashboard, productType: 'credit_card' });

    expect(aligned?.keyMetrics?.inflows_total).toBe(100_000);
    expect(aligned?.keyMetrics?.outflows_total).toBe(4_100);
    expect(aligned?.keyMetrics?.net_flow).toBe(95_900);
    expect(aligned?.topCategories?.[0]?.name).toBe('Supermercado');
    expect(aligned?.spendClusters?.[0]?.name).toBe('Supermercado');
    expect(aligned?.summary).toContain('100.000');
  });
});
