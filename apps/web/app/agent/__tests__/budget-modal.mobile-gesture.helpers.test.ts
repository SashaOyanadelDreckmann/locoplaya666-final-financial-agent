/** @jest-environment node */

import { shouldSkipBudgetMobileGesture } from '../modales/presupuesto/budget-modal.mobile-gesture.helpers';

describe('budget modal mobile gesture helpers', () => {
  it('skips interactive controls so row editing stays usable', () => {
    const mockInput = {
      closest: () => ({ tagName: 'INPUT' }),
    };
    const mockDiv = {
      closest: () => null,
    };
    expect(shouldSkipBudgetMobileGesture(mockInput)).toBe(true);
    expect(shouldSkipBudgetMobileGesture(mockDiv)).toBe(false);
  });
});
