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

  it('offers interview CTA only when budget gate is complete', () => {
    const model = buildOnboardingFlowCta(
      {
        productsCompleted: true,
        transactionsCompleted: true,
        budgetUnlocked: true,
        budgetCompleted: true,
        budgetRowsCompleted: 3,
        interviewUnlocked: true,
        diagnosisCompleted: false,
      },
      'Sasha',
    );
    expect(model?.section).toBe('interview');
    expect(model?.buttonLabel).toBe('Iniciar entrevista');
    expect(model?.body).toContain('máx. 3 min');
    expect(model?.body).not.toContain('~4 min');
    expect(model?.steps.find((step) => step.id === 'interview')?.current).toBe(true);
  });

  it('stays on budget while interview remains locked with fewer than 3 rows', () => {
    const model = buildOnboardingFlowCta(
      {
        productsCompleted: true,
        transactionsCompleted: true,
        budgetUnlocked: true,
        budgetCompleted: false,
        budgetRowsCompleted: 2,
        interviewUnlocked: false,
        diagnosisCompleted: false,
      },
      'Sasha',
    );
    expect(model?.section).toBe('budget');
    expect(model?.buttonLabel).toContain('presupuesto');
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
