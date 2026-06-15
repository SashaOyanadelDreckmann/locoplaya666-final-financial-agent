export const BUDGET_MOBILE_SWIPE_THRESHOLD_PX = 56;
export const BUDGET_MOBILE_SWIPE_MAX_DRAG_PX = 112;
export const BUDGET_MOBILE_GESTURE_AXIS_LOCK_PX = 8;

export function shouldSkipBudgetMobileGesture(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false;
  const element = target as { closest?: (selector: string) => unknown };
  if (typeof element.closest !== 'function') return false;
  const interactive = element.closest(
    'input, textarea, select, button, a, label, .budget-pill-button, .budget-row-delete, .bcc-hero-send',
  );
  return Boolean(interactive);
}
