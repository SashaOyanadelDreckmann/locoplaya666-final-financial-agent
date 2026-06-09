import { describe, expect, it } from 'vitest';

import { buildInterviewPlan } from './interview.flow';

describe('buildInterviewPlan', () => {
  it('includes products in the canonical interview path', () => {
    const plan = buildInterviewPlan({
      hasDebt: true,
      hasSavingsOrInvestments: true,
    } as any);

    expect(plan.blocksToExplore).toContain('products');
    expect(plan.blocksToExplore.indexOf('products')).toBeGreaterThan(plan.blocksToExplore.indexOf('debt'));
    expect(plan.blocksToExplore.indexOf('products')).toBeLessThan(plan.blocksToExplore.indexOf('goals'));
  });

  it('omits debt when the intake declares no debt', () => {
    const plan = buildInterviewPlan({
      hasDebt: false,
      hasSavingsOrInvestments: false,
    } as any);

    expect(plan.blocksToExplore).toContain('products');
    expect(plan.blocksToExplore).not.toContain('debt');
  });
});
