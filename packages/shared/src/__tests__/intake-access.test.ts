import { describe, expect, it } from 'vitest';

import { hasCompletedIntakeAccess, hasMeaningfulIntake } from '../intake/intake-access';

describe('intake access', () => {
  it('rejects empty or partial questionnaire envelopes', () => {
    expect(hasMeaningfulIntake(null)).toBe(false);
    expect(hasMeaningfulIntake({ intake: {} })).toBe(false);
    expect(
      hasMeaningfulIntake({
        intake: {
          employmentStatus: 'employed',
          incomeBand: '600k-1M',
        },
      }),
    ).toBe(false);
  });

  it('accepts a completed questionnaire', () => {
    expect(
      hasMeaningfulIntake({
        intake: {
          employmentStatus: 'employed',
          incomeBand: '600k-1M',
          expensesCoverage: 'tight',
          tracksExpenses: 'sometimes',
          hasSavingsOrInvestments: false,
          hasDebt: false,
          financialKnowledge: { interest: false, CAE: false, inflation: false },
          riskReaction: 'hold',
          selfRatedUnderstanding: 4,
          moneyStressLevel: 5,
        },
      }),
    ).toBe(true);
  });

  it('grants agent access with minimal employment + income only', () => {
    expect(
      hasCompletedIntakeAccess({
        intake: {
          employmentStatus: 'employed',
          incomeBand: '600k-1M',
        },
      }),
    ).toBe(true);
    expect(hasCompletedIntakeAccess(null)).toBe(false);
  });
});
