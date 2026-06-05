import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../rate-limiter', () => ({
  checkRateLimit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../telemetry', () => ({
  createMetricsCollector: vi.fn(() => ({
    recordSuccess: vi.fn(() => ({ latency_ms: 1, timestamp: Date.now() })),
    recordError: vi.fn(() => ({ latency_ms: 1, timestamp: Date.now() })),
  })),
  recordToolMetrics: vi.fn(),
}));

import { budgetAnalyzerTool } from './budgetAnalyzer.tool';

describe('budgetAnalyzerTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps savings_actual distinct from savings_capacity', async () => {
    const result = await budgetAnalyzerTool.run({
      monthlyIncome: 2000000,
      expenses: [
        { category: 'Arriendo', amount: 1200000, type: 'needs' },
        { category: 'Supermercado', amount: 200000, type: 'wants' },
        { category: 'Cuota', amount: 300000, type: 'debt' },
        { category: 'Ahorro', amount: 100000, type: 'savings' },
      ],
      emergencyFund: 250000,
      hasPension: true,
      dependents: 0,
    });

    expect(result.tool_call.status).toBe('success');
    expect(result.data.summary.savings_actual).toBe(100000);
    expect(result.data.summary.savings_capacity).toBe(200000);
    expect(result.data.summary.rule_50_30_20.savings_actual).toBe(100000);
    expect(result.data.summary.rule_50_30_20.savings_capacity).toBe(200000);
    expect(result.data.summary.rule_50_30_20.savings_gap).toBe(300000);
  });

  it('keeps the health summary stable in deficit cases', async () => {
    const result = await budgetAnalyzerTool.run({
      monthlyIncome: 1500000,
      totalFixedExpenses: 1100000,
      totalVariableExpenses: 500000,
      totalDebtPayments: 200000,
      currentSavings: 50000,
      emergencyFund: 100000,
      hasPension: false,
      dependents: 1,
    });

    expect(result.tool_call.status).toBe('success');
    expect(result.data.summary.balance).toBe(-350000);
    expect(result.data.summary.health_score).toBeGreaterThanOrEqual(0);
    expect(result.data.summary.recommendations[0]?.priority).toBe(1);
  });
});
