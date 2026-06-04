import {
  hasMeaningfulIntake,
  resolveServerBackendBase,
} from '@/lib/sessionAccess';

describe('sessionAccess server helpers', () => {
  it('prefers configured API origin for backend base', () => {
    const base = resolveServerBackendBase({
      requestOrigin: 'https://financieramente.up.railway.app',
      forwardedHost: 'financieramente.up.railway.app',
      forwardedProto: 'https',
    });
    expect(base).toMatch(/^https?:\/\//);
  });

  it('falls back to same-origin /backend proxy when host is available', () => {
    const previous = { ...process.env };
    for (const key of [
      'NEXT_PUBLIC_AGENT_API_URL',
      'NEXT_PUBLIC_API_URL',
      'NEXT_PUBLIC_API_ORIGIN',
      'INTERNAL_API_ORIGIN',
      'API_ORIGIN',
    ]) {
      delete process.env[key];
    }

    const base = resolveServerBackendBase({
      requestOrigin: 'https://app.example.com',
      forwardedHost: 'app.example.com',
      forwardedProto: 'https',
    });
    expect(base).toBe('https://app.example.com/backend');

    process.env = previous;
  });

  it('keeps meaningful intake guard aligned with questionnaire completion', () => {
    expect(hasMeaningfulIntake({ intake: {} })).toBe(false);
    expect(
      hasMeaningfulIntake({
        intake: {
          employmentStatus: 'employed',
          incomeBand: '600k-1M',
          expensesCoverage: 'tight',
          tracksExpenses: 'sometimes',
          hasSavingsOrInvestments: false,
          hasDebt: false,
          financialKnowledge: { interest: false },
          riskReaction: 'hold',
          selfRatedUnderstanding: 4,
          moneyStressLevel: 5,
        },
      }),
    ).toBe(true);
  });
});
