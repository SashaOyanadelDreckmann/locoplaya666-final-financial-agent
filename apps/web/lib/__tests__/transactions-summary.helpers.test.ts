import { resolveInstantTransactionSummary } from '../transacciones/resumen.helpers';

describe('transactions-summary.helpers', () => {
  it('returns the existing executive summary when it is already rich enough', () => {
    const summary = resolveInstantTransactionSummary({
      summary: 'Resumen ejecutivo ya generado con suficiente detalle para el usuario final.',
      keyMetrics: {
        inflows_total: 0,
        outflows_total: 0,
        net_flow: 0,
        avg_movement: 0,
        movement_count: 12,
      },
    });

    expect(summary).toContain('Resumen ejecutivo');
  });

  it('builds an instant summary from dashboard metrics', () => {
    const summary = resolveInstantTransactionSummary({
      keyMetrics: {
        movement_count: 18,
        inflows_total: 1_500_000,
        outflows_total: 900_000,
        net_flow: 600_000,
        avg_movement: 50_000,
        table_rows_verified: 16,
      },
      topCategories: [{ name: 'Supermercado', amount: 250_000 }],
      topMerchants: [{ merchant: 'Jumbo', amount: 180_000, category: 'Supermercado', tx_count: 3 }],
      alerts: ['Alta concentración en Supermercado.'],
      period: { from: '2025-01-01', to: '2025-01-31' },
    });

    expect(summary).toContain('18 movimientos');
    expect(summary).toContain('Supermercado');
    expect(summary).toContain('Jumbo');
  });
});
