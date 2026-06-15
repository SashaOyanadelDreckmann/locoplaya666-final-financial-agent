import { describe, expect, it } from 'vitest';
import { buildExecutiveSummaryText, shouldReconcileMovements } from './documents.parse.helpers';

describe('documents.parse.helpers', () => {
  it('skips reconcile for high-confidence structured parsers', () => {
    const documents = [
      {
        structuredData: {
          rowCount: 40,
          parserMeta: { mode: 'csv_exact', confidence: 0.99 },
        },
      },
    ];
    const movements = Array.from({ length: 20 }, () => ({
      source_kind: 'table' as const,
    }));

    expect(shouldReconcileMovements(documents, movements)).toBe(false);
  });

  it('reconciles when parser confidence is low and yield is poor', () => {
    const documents = [
      {
        structuredData: {
          rowCount: 80,
          parserMeta: { mode: 'vision_structured', confidence: 0.62 },
        },
      },
    ];
    const movements = Array.from({ length: 4 }, () => ({
      source_kind: 'line' as const,
    }));

    expect(shouldReconcileMovements(documents, movements)).toBe(true);
  });

  it('skips reconcile when document profile is already high confidence and known', () => {
    const documents = [
      {
        structuredData: {
          rowCount: 60,
          parserMeta: { mode: 'exact_sheet', confidence: 0.98 },
          documentProfile: {
            confidence: 0.95,
            format_family: 'banco_chile_cartola_historica',
            needs_rag: false,
          },
        },
      },
    ];
    const movements = Array.from({ length: 18 }, () => ({
      source_kind: 'table' as const,
    }));

    expect(shouldReconcileMovements(documents, movements)).toBe(false);
  });

  it('skips reconcile for high-confidence inventory profiles outside the old hardcoded set', () => {
    const documents = [
      {
        structuredData: {
          rowCount: 48,
          parserMeta: { mode: 'vision_structured', confidence: 0.96 },
          documentProfile: {
            confidence: 0.94,
            format_family: 'santander_estado_cuenta_tarjeta_credito',
            needs_rag: false,
          },
        },
      },
    ];
    const movements = Array.from({ length: 22 }, () => ({
      source_kind: 'table' as const,
    }));

    expect(shouldReconcileMovements(documents, movements)).toBe(false);
  });

  it('builds a richer executive summary without LLM', () => {
    const summary = buildExecutiveSummaryText({
      movementCount: 42,
      tableBasedMovements: 38,
      inflowsTotal: 1_800_000,
      outflowsTotal: 1_250_000,
      netFlow: 550_000,
      inflowLabel: 'Abonos',
      topCategories: [
        { name: 'Supermercado', amount: 320_000 },
        { name: 'Transporte', amount: 110_000 },
      ],
      topMerchants: [{ merchant: 'Jumbo', amount: 220_000 }],
      alerts: ['Egresos por encima de ingresos en el periodo detectado.'],
      period: { from: '2025-01-01', to: '2025-01-31' },
      formatAmount: (value) => String(value),
    });

    expect(summary).toContain('42 movimientos');
    expect(summary).toContain('Panorama del periodo');
    expect(summary).toContain('Balance detectado');
    expect(summary).toContain('Categorías de gasto');
    expect(summary).toContain('• Supermercado');
    expect(summary).toContain('• Jumbo');
  });
});
