/** @jest-environment node */

import {
  resolveActiveMobileBudgetRowIndex,
  resolveMobileBudgetRowStepDirection,
  resolveMobileBudgetRowStepScrollTop,
  resolveDominantMobileBudgetRowScrollTop,
} from '../modales/presupuesto/budget-modal.mobile-table-snap';

describe('budget modal mobile table snap', () => {
  const slot = 300;
  const rows = [
    { scrollTop: 0, height: slot, rowId: 'a' },
    { scrollTop: 300, height: slot, rowId: 'b' },
    { scrollTop: 600, height: slot, rowId: 'c' },
  ];

  it('snaps to the row that occupies more viewport space when between two rows', () => {
    expect(resolveDominantMobileBudgetRowScrollTop(40, slot, rows)).toBe(0);
    expect(resolveDominantMobileBudgetRowScrollTop(150, slot, rows)).toBe(300);
    expect(resolveDominantMobileBudgetRowScrollTop(161, slot, rows)).toBe(300);
    expect(resolveDominantMobileBudgetRowScrollTop(440, slot, rows)).toBe(300);
    expect(resolveDominantMobileBudgetRowScrollTop(451, slot, rows)).toBe(600);
  });

  it('returns null when there are no rows', () => {
    expect(resolveDominantMobileBudgetRowScrollTop(0, slot, [])).toBeNull();
  });

  it('steps to the next and previous row slot', () => {
    expect(resolveMobileBudgetRowStepScrollTop(40, slot, rows, 'next')).toBe(300);
    expect(resolveMobileBudgetRowStepScrollTop(300, slot, rows, 'next')).toBe(600);
    expect(resolveMobileBudgetRowStepScrollTop(300, slot, rows, 'prev')).toBe(0);
    expect(resolveMobileBudgetRowStepScrollTop(600, slot, rows, 'next')).toBeNull();
    expect(resolveMobileBudgetRowStepScrollTop(0, slot, rows, 'prev')).toBeNull();
  });

  it('maps vertical and horizontal swipe directions to the same row step', () => {
    expect(resolveMobileBudgetRowStepDirection(0, 60, 'y')).toBe('next');
    expect(resolveMobileBudgetRowStepDirection(0, -60, 'y')).toBe('prev');
    expect(resolveMobileBudgetRowStepDirection(-60, 0, 'x')).toBe('next');
    expect(resolveMobileBudgetRowStepDirection(60, 0, 'x')).toBe('prev');
  });

  it('resolves the active row index from the dominant slot', () => {
    expect(resolveActiveMobileBudgetRowIndex(150, slot, rows)).toBe(1);
    expect(resolveActiveMobileBudgetRowIndex(451, slot, rows)).toBe(2);
  });
});
