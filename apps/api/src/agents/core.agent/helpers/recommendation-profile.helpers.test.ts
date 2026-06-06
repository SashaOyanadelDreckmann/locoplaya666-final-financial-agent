import { describe, expect, it } from 'vitest';
import { buildRecommendationProfile } from './recommendation-profile.helpers';

describe('recommendation-profile.helpers', () => {
  it('does not mark income as missing when only incomeBand is available', () => {
    const profile = buildRecommendationProfile({
      activeChatId: 'chat-2',
      budgetSummary: { income: 0, expenses: 0, balance: 0 },
      intake: {
        incomeBand: '1M-2M',
        hasDebt: false,
        hasSavingsOrInvestments: true,
      },
      userMessage: '¿Me conviene APV?',
    });

    expect(profile.missing_critical_data).not.toContain('ingreso mensual');
    expect(profile.recommendation_scope).toContain('apv');
  });
});
