import { ApiHttpError } from '../api/envelope';
import {
  hasMeaningfulIntake,
  resolveAuthRedirectPath,
} from '@/lib/sesion/sessionAccess';

describe('intake access helpers', () => {
  it('rejects empty or partial intake envelopes', () => {
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

  it('accepts a completed intake questionnaire', () => {
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

  it('routes pending approval users to waiting screen', () => {
    const err = new ApiHttpError({
      status: 403,
      message: 'pending',
      code: 'ACCOUNT_PENDING_APPROVAL',
    });
    expect(resolveAuthRedirectPath(err)).toBe('/waiting-approval');
    expect(resolveAuthRedirectPath(new Error('network'))).toBe('/login');
  });
});
