import { describe, expect, it } from 'vitest';
import { buildFinancialFact, dedupeFacts, normalizeMonthlyAmount } from '@financial-agent/shared';
import { detectContextConflicts } from './context-consistency.service';

describe('context-consistency.service', () => {
  it('normalizes annual amounts to monthly', () => {
    expect(normalizeMonthlyAmount(1_200_000, 'annual')).toBe(100_000);
  });

  it('detects intake vs budget income mismatch', () => {
    const facts = [
      buildFinancialFact({
        subject: 'user.income',
        predicate: 'declared_monthly_income',
        value: 1_500_000,
        sourceKind: 'intake',
        sourceId: 'questionnaire',
        sourceVersion: 'v1',
        contentHash: 'a',
        unit: 'CLP',
        cadence: 'monthly',
      }),
      buildFinancialFact({
        subject: 'budget.totals',
        predicate: 'monthly_income',
        value: 900_000,
        sourceKind: 'budget',
        sourceId: 'panel',
        sourceVersion: 'v1',
        contentHash: 'b',
        unit: 'CLP',
        cadence: 'monthly',
      }),
    ];
    const conflicts = detectContextConflicts({
      facts,
      contextVersion: 'ctx-test',
    });
    expect(conflicts.some((c) => c.explanationCode === 'INTAKE_BUDGET_INCOME_MISMATCH')).toBe(true);
    expect(conflicts.every((c) => c.autoResolvable === false)).toBe(true);
  });

  it('does not flag budget edits after diagnosis as a conflict', () => {
    const conflicts = detectContextConflicts({
      facts: [],
      contextVersion: 'ctx-test',
    });
    expect(conflicts.some((c) => c.explanationCode === 'DIAGNOSTIC_BUDGET_STALE')).toBe(false);
  });

  it('dedupes facts by id keeping newest observation', () => {
    const older = buildFinancialFact({
      subject: 'budget.totals',
      predicate: 'monthly_income',
      value: 1,
      sourceKind: 'budget',
      sourceId: 'panel',
      sourceVersion: 'v1',
      contentHash: 'a',
      observedAt: '2020-01-01T00:00:00.000Z',
    });
    const newer = { ...older, value: 2, observedAt: '2026-01-01T00:00:00.000Z' };
    const deduped = dedupeFacts([older, newer]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.value).toBe(2);
  });
});
