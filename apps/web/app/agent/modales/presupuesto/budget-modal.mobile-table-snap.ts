import {
  BUDGET_MOBILE_GESTURE_AXIS_LOCK_PX,
  BUDGET_MOBILE_SWIPE_THRESHOLD_PX,
} from './budget-modal.mobile-gesture.helpers';

export type MobileBudgetRowSnapCandidate = {
  scrollTop: number;
  height: number;
  rowId: string | null;
};

export function resolveDominantMobileBudgetRowScrollTop(
  viewportScrollTop: number,
  viewportHeight: number,
  rows: MobileBudgetRowSnapCandidate[],
): number | null {
  if (!rows.length || viewportHeight <= 0) return null;

  const viewportBottom = viewportScrollTop + viewportHeight;
  let bestScrollTop = rows[0].scrollTop;
  let bestVisible = -1;

  for (const row of rows) {
    const rowBottom = row.scrollTop + row.height;
    const visibleTop = Math.max(row.scrollTop, viewportScrollTop);
    const visibleBottom = Math.min(rowBottom, viewportBottom);
    const visibleHeight = Math.max(0, visibleBottom - visibleTop);
    if (
      visibleHeight > bestVisible
      || (visibleHeight === bestVisible && visibleHeight > 0 && row.scrollTop > bestScrollTop)
    ) {
      bestVisible = visibleHeight;
      bestScrollTop = row.scrollTop;
    }
  }

  return bestScrollTop;
}

export function resolveActiveMobileBudgetRowIndex(
  viewportScrollTop: number,
  viewportHeight: number,
  rows: MobileBudgetRowSnapCandidate[],
): number {
  if (!rows.length) return 0;

  const dominantTop = resolveDominantMobileBudgetRowScrollTop(
    viewportScrollTop,
    viewportHeight,
    rows,
  );
  if (dominantTop === null) return 0;

  let bestIndex = 0;
  let bestDistance = Infinity;
  for (let index = 0; index < rows.length; index += 1) {
    const distance = Math.abs(rows[index].scrollTop - dominantTop);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  return bestIndex;
}

export function resolveMobileBudgetRowStepScrollTop(
  viewportScrollTop: number,
  viewportHeight: number,
  rows: MobileBudgetRowSnapCandidate[],
  direction: 'next' | 'prev',
): number | null {
  if (!rows.length) return null;

  const currentIndex = resolveActiveMobileBudgetRowIndex(
    viewportScrollTop,
    viewportHeight,
    rows,
  );
  const nextIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
  if (nextIndex < 0 || nextIndex >= rows.length) return null;
  return rows[nextIndex].scrollTop;
}

export function resolveMobileBudgetRowStepDirection(
  deltaX: number,
  deltaY: number,
  axis: 'x' | 'y',
): 'next' | 'prev' | null {
  if (axis === 'y') {
    if (deltaY >= BUDGET_MOBILE_SWIPE_THRESHOLD_PX) return 'next';
    if (deltaY <= -BUDGET_MOBILE_SWIPE_THRESHOLD_PX) return 'prev';
    return null;
  }

  if (deltaX <= -BUDGET_MOBILE_SWIPE_THRESHOLD_PX) return 'next';
  if (deltaX >= BUDGET_MOBILE_SWIPE_THRESHOLD_PX) return 'prev';
  return null;
}

export type BudgetMobileRowGestureAxis = 'x' | 'y';

export function resolveBudgetMobileRowGestureAxis(
  deltaX: number,
  deltaY: number,
): BudgetMobileRowGestureAxis | null {
  if (
    Math.abs(deltaX) < BUDGET_MOBILE_GESTURE_AXIS_LOCK_PX
    && Math.abs(deltaY) < BUDGET_MOBILE_GESTURE_AXIS_LOCK_PX
  ) {
    return null;
  }

  return Math.abs(deltaX) > Math.abs(deltaY) ? 'x' : 'y';
}

export function readMobileBudgetRowSnapCandidates(
  wrap: HTMLElement,
  rowSelector = 'tbody tr.is-mobile-row-card',
): MobileBudgetRowSnapCandidate[] {
  const rows = wrap.querySelectorAll<HTMLElement>(rowSelector);
  const wrapRect = wrap.getBoundingClientRect();

  return Array.from(rows).map((row) => {
    const rowRect = row.getBoundingClientRect();
    return {
      scrollTop: wrap.scrollTop + (rowRect.top - wrapRect.top),
      height: row.offsetHeight,
      rowId: row.id ? row.id.replace(/^budget-row-/, '') : null,
    };
  });
}

export function shouldSkipMobileBudgetRowSnap(wrap: HTMLElement): boolean {
  const active = document.activeElement;
  if (!active || !wrap.contains(active)) return false;
  const tag = active.tagName;
  return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
}
