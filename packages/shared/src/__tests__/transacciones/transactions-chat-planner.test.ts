import { describe, expect, it } from 'vitest';
import {
  buildTransactionStarterChips,
  formatRetrievalSignalsLabel,
  planDeterministicTransactionAnswer,
} from '../../transacciones/transactions-chat-planner';
import { extractQuestionSignals } from '../../transacciones/transactions-chat';

const sampleDashboard = {
  period: { from: '2025-01-01', to: '2025-01-31' },
  currency: 'CLP',
  keyMetrics: {
    inflows_total: 1_800_000,
    outflows_total: 1_200_000,
    net_flow: 600_000,
    avg_movement: 25_000,
    movement_count: 48,
    table_rows_verified: 40,
  },
  topCategories: [
    { name: 'Supermercado', amount: 320_000 },
    { name: 'Transporte', amount: 180_000 },
  ],
  topMerchants: [
    { merchant: 'Jumbo', amount: 220_000 },
    { merchant: 'Uber', amount: 95_000 },
  ],
  alerts: ['Posible cargo duplicado en Uber'],
  movements: [
    {
      date: '2025-01-05',
      merchant: 'Jumbo',
      description: 'JUMBO',
      amount: -82_340,
      direction: 'expense',
      category: 'Supermercado',
    },
    {
      date: '2025-02-01',
      merchant: 'Sueldo',
      description: 'ABONO',
      amount: 1_800_000,
      direction: 'income',
      category: 'Ingresos',
    },
  ],
};

describe('transactions-chat-planner', () => {
  it('builds contextual starter chips from dashboard data', () => {
    const chips = buildTransactionStarterChips(sampleDashboard, 6);
    expect(chips.length).toBeGreaterThan(0);
    expect(chips.some((chip) => chip.label.includes('Jumbo'))).toBe(true);
    expect(chips.some((chip) => chip.question.includes('egresos'))).toBe(true);
  });

  it('answers outflow totals deterministically', () => {
    const answer = planDeterministicTransactionAnswer('¿Cuánto fueron mis egresos totales?', sampleDashboard);
    expect(answer?.reply).toContain('$1.200.000');
    expect(answer?.suggestedFollowups.length).toBeGreaterThan(0);
    expect(answer?.source).toBe('deterministic');
  });

  it('answers merchant-specific questions deterministically', () => {
    const answer = planDeterministicTransactionAnswer('¿Cuánto gasté en Jumbo?', sampleDashboard);
    expect(answer?.reply.toLowerCase()).toContain('jumbo');
    expect(answer?.referencedMovementKeys.length).toBeGreaterThan(0);
  });

  it('formats retrieval signal labels', () => {
    const signals = extractQuestionSignals('movimientos de Uber en enero');
    const label = formatRetrievalSignalsLabel(signals, 'targeted', 3);
    expect(label).toContain('Búsqueda focalizada');
    expect(label).toContain('uber');
  });
});
