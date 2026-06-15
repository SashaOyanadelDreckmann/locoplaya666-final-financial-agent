export const BUDGET_MOBILE_SWIPE_THRESHOLD_PX = 56;
export const BUDGET_MOBILE_SWIPE_MAX_DRAG_PX = 112;
export const BUDGET_MOBILE_GESTURE_AXIS_LOCK_PX = 8;
export const BUDGET_MOBILE_HORIZONTAL_RATIO_VIEW_TABLE = 1.35;
export const BUDGET_MOBILE_HORIZONTAL_RATIO_VIEW_ASSISTANT = 1.05;
export const BUDGET_VIEW_SLIDE_MS = 420;

export type BudgetMobileViewSwipeAxis = 'x' | 'y';

export function resolveBudgetViewSwipeAxis(
  deltaX: number,
  deltaY: number,
  isTableView: boolean,
): BudgetMobileViewSwipeAxis | null {
  if (
    Math.abs(deltaX) < BUDGET_MOBILE_GESTURE_AXIS_LOCK_PX
    && Math.abs(deltaY) < BUDGET_MOBILE_GESTURE_AXIS_LOCK_PX
  ) {
    return null;
  }

  const ratio = isTableView
    ? BUDGET_MOBILE_HORIZONTAL_RATIO_VIEW_TABLE
    : BUDGET_MOBILE_HORIZONTAL_RATIO_VIEW_ASSISTANT;
  if (Math.abs(deltaX) >= Math.abs(deltaY) * ratio) return 'x';
  if (Math.abs(deltaY) > Math.abs(deltaX)) return 'y';
  return null;
}

export function shouldSkipBudgetViewSwipeHost(
  target: EventTarget | null,
  isTableView: boolean,
): boolean {
  if (!isTableView) return false;
  if (!target || typeof target !== 'object') return false;
  const element = target as { closest?: (selector: string) => unknown };
  if (typeof element.closest !== 'function') return false;
  return Boolean(element.closest('.budget-table-scroll-host'));
}

export function shouldSkipBudgetMobileGesture(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false;
  const element = target as { closest?: (selector: string) => unknown };
  if (typeof element.closest !== 'function') return false;
  const interactive = element.closest(
    'input, textarea, select, button, a, label, .budget-pill-button, .budget-row-delete, .bcc-hero-send',
  );
  return Boolean(interactive);
}
