/** @jest-environment node */

import {
  getBudgetMobileRowSlideEnterToken,
  getBudgetMobileRowSlideExitToken,
} from '../modales/presupuesto/budget-modal.mobile-row-slide';

describe('budget modal mobile row slide', () => {
  it('maps next and prev row steps to lateral slide tokens', () => {
    expect(getBudgetMobileRowSlideExitToken('next')).toBe('forward');
    expect(getBudgetMobileRowSlideExitToken('prev')).toBe('backward');
    expect(getBudgetMobileRowSlideEnterToken('next')).toBe('enter-forward');
    expect(getBudgetMobileRowSlideEnterToken('prev')).toBe('enter-backward');
  });
});
