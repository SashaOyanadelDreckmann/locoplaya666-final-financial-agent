/** @jest-environment node */

import {
  resolveBudgetViewSwipeAxis,
  shouldSkipBudgetMobileGesture,
  shouldSkipBudgetViewSwipeHost,
} from '../modales/presupuesto/budget-modal.mobile-gesture.helpers';

describe('budget modal mobile gesture helpers', () => {
  it('prefers vertical axis on table chrome when the gesture is ambiguous', () => {
    expect(resolveBudgetViewSwipeAxis(10, 12, true)).toBe('y');
    expect(resolveBudgetViewSwipeAxis(20, 14, true)).toBe('x');
    expect(resolveBudgetViewSwipeAxis(0, 0, true)).toBeNull();
  });

  it('allows horizontal axis sooner on assistant view', () => {
    expect(resolveBudgetViewSwipeAxis(12, 10, false)).toBe('x');
    expect(resolveBudgetViewSwipeAxis(10, 12, false)).toBe('y');
  });

  it('only skips the table scroll host while table view is active', () => {
    const mockScrollHost = {
      closest: (selector: string) => (selector === '.budget-table-scroll-host' ? {} : null),
    } as unknown as EventTarget;
    const mockHeader = {
      closest: () => null,
    } as unknown as EventTarget;
    expect(shouldSkipBudgetViewSwipeHost(mockScrollHost, true)).toBe(true);
    expect(shouldSkipBudgetViewSwipeHost(mockHeader, true)).toBe(false);
    expect(shouldSkipBudgetViewSwipeHost(mockScrollHost, false)).toBe(false);
  });

  it('skips interactive controls so row editing stays usable', () => {
    const mockInput = {
      closest: () => ({ tagName: 'INPUT' }),
    } as unknown as EventTarget;
    const mockDiv = {
      closest: () => null,
    } as unknown as EventTarget;
    expect(shouldSkipBudgetMobileGesture(mockInput)).toBe(true);
    expect(shouldSkipBudgetMobileGesture(mockDiv)).toBe(false);
  });
});
