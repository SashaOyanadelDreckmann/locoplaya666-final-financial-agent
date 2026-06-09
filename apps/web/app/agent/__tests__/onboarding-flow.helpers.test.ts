/** @jest-environment node */

import { buildOnboardingFlowCta, BUDGET_ROWS_TARGET } from '../onboarding-flow.helpers';

describe('buildOnboardingFlowCta', () => {
  it('prompts for transactions when evidence is missing', () => {
    const model = buildOnboardingFlowCta(
      {
        productsCompleted: false,
        transactionsCompleted: false,
        budgetUnlocked: false,
        budgetCompleted: false,
        budgetRowsCompleted: 0,
        interviewUnlocked: false,
        diagnosisCompleted: false,
      },
      'Sasha',
    );
    expect(model?.section).toBe('transactions');
    expect(model?.headline).toContain('Sasha');
    expect(model?.buttonLabel).toBe('Agregar cartolas');
  });

  it('shows budget progress when evidence exists', () => {
    const model = buildOnboardingFlowCta(
      {
        productsCompleted: true,
        transactionsCompleted: true,
        budgetUnlocked: true,
        budgetCompleted: false,
        budgetRowsCompleted: 1,
        interviewUnlocked: false,
        diagnosisCompleted: false,
      },
      'Sasha',
    );
    expect(model?.section).toBe('budget');
    expect(model?.progressLabel).toBe(`1/${BUDGET_ROWS_TARGET} filas`);
    expect(model?.progressRatio).toBe(1 / BUDGET_ROWS_TARGET);
  });

  it('returns null when diagnosis is complete', () => {
    expect(
      buildOnboardingFlowCta({
        productsCompleted: true,
        transactionsCompleted: true,
        budgetUnlocked: true,
        budgetCompleted: true,
        budgetRowsCompleted: 3,
        interviewUnlocked: true,
        diagnosisCompleted: true,
      }),
    ).toBeNull();
  });
});
