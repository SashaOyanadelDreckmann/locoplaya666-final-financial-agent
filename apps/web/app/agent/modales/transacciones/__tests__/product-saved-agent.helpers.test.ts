import {
  buildTransactionProductSavedAgentBlocks,
  buildTransactionProductSavedAgentMessage,
  buildTransactionProductSavedExecutiveSummary,
  buildTransactionProductSavedPanelMessage,
} from '../product-saved-agent.helpers';
import type { BankProduct } from '../types';

function buildProduct(overrides: Partial<BankProduct> = {}): BankProduct {
  return {
    id: 'prod-1',
    label: 'Cuenta vista',
    bank: 'Banco Estado',
    assistant: {
      messages: [],
      uploadFormat: 'photos',
      summaryText: null,
      summaryModel: null,
      summaryGeneratedAt: null,
      summaryRegenerationsUsed: 0,
      lastSummaryFeedback: null,
    },
    productType: 'checking_account',
    simulationAccepted: true,
    connected: true,
    randomMode: false,
    uploadedFiles: [],
    parsedDocuments: [],
    dashboard: {
      keyMetrics: {
        movement_count: 12,
        inflows_total: 1_250_000,
        outflows_total: 980_000,
        net_flow: 270_000,
        avg_movement: 0,
      },
      topCategories: [],
      alerts: [],
    },
    ...overrides,
  };
}

describe('buildTransactionProductSavedAgentMessage', () => {
  it('renders a premium executive report with metrics when dashboard data exists', () => {
    const message = buildTransactionProductSavedAgentMessage(buildProduct());
    expect(message).toContain('# Informe ejecutivo — Banco Estado · Cuenta vista');
    expect(message).toContain('12 movimientos');
    expect(message).toContain('## Panorama del periodo');
    expect(message).toContain('## Balance detectado');
    expect(message).toContain('## Próximo paso');
    expect(message).toContain('$1.250.000');
    expect(message).toContain('$980.000');
  });

  it('prefers the assistant summary when it is already rich', () => {
    const message = buildTransactionProductSavedAgentMessage(
      buildProduct({
        assistant: {
          messages: [],
          uploadFormat: 'photos',
          summaryText:
            'Panorama del periodo\nEl flujo quedó estable con ingresos recurrentes y gasto concentrado en vivienda.',
          summaryModel: 'test',
          summaryGeneratedAt: null,
          summaryRegenerationsUsed: 0,
          lastSummaryFeedback: null,
        },
      }),
    );
    expect(message).toContain('## Panorama del periodo');
    expect(message).toContain('ingresos recurrentes');
  });

  it('falls back when there are no movements yet', () => {
    const message = buildTransactionProductSavedAgentMessage(
      buildProduct({
        dashboard: {
          keyMetrics: { movement_count: 0, inflows_total: 0, outflows_total: 0, net_flow: 0, avg_movement: 0 },
          topCategories: [],
          alerts: [],
        },
      }),
    );
    expect(message).toContain('# Informe ejecutivo');
    expect(message).toContain('contexto del agente quedó actualizado');
    expect(message).toContain('## Próximo paso');
  });
});

describe('buildTransactionProductSavedExecutiveSummary', () => {
  it('builds editorial blocks from movement analytics', () => {
    const summary = buildTransactionProductSavedExecutiveSummary(
      buildProduct({
        dashboard: {
          keyMetrics: {
            movement_count: 6,
            inflows_total: 500_000,
            outflows_total: 320_000,
            net_flow: 180_000,
            avg_movement: 0,
          },
          topCategories: [{ name: 'Supermercado', amount: 120_000 }],
          alerts: ['Alta concentración en Supermercado.'],
          movements: [
            { description: 'Sueldo', amount: 500_000, direction: 'income', date: '2026-01-02', category: 'Ingresos' },
            { description: 'Arriendo', amount: 200_000, direction: 'expense', date: '2026-01-03', category: 'Vivienda' },
            { description: 'Super', amount: 80_000, direction: 'expense', date: '2026-01-05', category: 'Supermercado' },
            { description: 'Cafe', amount: 40_000, direction: 'expense', date: '2026-01-08', category: 'Comida' },
          ],
        },
      }),
    );

    expect(summary).toContain('Panorama del periodo');
    expect(summary).toContain('Balance detectado');
    expect(summary).toContain('Supermercado');
  });
});

describe('buildTransactionProductSavedPanelMessage', () => {
  it('mentions executive summary availability when movements exist', () => {
    expect(buildTransactionProductSavedPanelMessage(buildProduct())).toContain('Resumen ejecutivo');
  });
});

describe('buildTransactionProductSavedAgentBlocks', () => {
  it('returns tx_chart blocks when movements support charts', () => {
    const blocks = buildTransactionProductSavedAgentBlocks(
      buildProduct({
        dashboard: {
          keyMetrics: {
            movement_count: 6,
            inflows_total: 500_000,
            outflows_total: 320_000,
            net_flow: 180_000,
            avg_movement: 0,
          },
          topCategories: [{ name: 'Supermercado', amount: 120_000 }],
          alerts: [],
          movements: [
            { description: 'Sueldo', amount: 500_000, direction: 'income', date: '2026-01-02', category: 'Ingresos' },
            { description: 'Arriendo', amount: 200_000, direction: 'expense', date: '2026-01-03', category: 'Vivienda' },
            { description: 'Super', amount: 80_000, direction: 'expense', date: '2026-01-05', category: 'Supermercado' },
            { description: 'Cafe', amount: 40_000, direction: 'expense', date: '2026-01-08', category: 'Comida' },
          ],
        },
      }),
    );

    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks.every((block) => block.type === 'tx_chart')).toBe(true);
    expect(blocks.some((block) => block.type === 'tx_chart' && block.tx_chart.variant === 'flow_bar')).toBe(true);
    expect(
      blocks.some((block) => block.type === 'tx_chart' && block.tx_chart.variant === 'cumulative_cashflow'),
    ).toBe(true);
  });

  it('returns an empty list when there are no movements', () => {
    expect(
      buildTransactionProductSavedAgentBlocks(
        buildProduct({
          dashboard: {
            keyMetrics: { movement_count: 0, inflows_total: 0, outflows_total: 0, net_flow: 0, avg_movement: 0 },
            topCategories: [],
            alerts: [],
            movements: [],
          },
        }),
      ),
    ).toEqual([]);
  });
});
