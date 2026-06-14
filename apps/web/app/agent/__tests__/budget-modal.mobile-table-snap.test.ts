/** @jest-environment node */

import {
  resolveDominantMobileBudgetRowScrollTop,
} from '../modales/presupuesto/budget-modal.mobile-table-snap';

describe('budget modal mobile table snap', () => {
  const slot = 300;
  const rows = [
    { scrollTop: 0, height: slot },
    { scrollTop: 300, height: slot },
    { scrollTop: 600, height: slot },
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
});
