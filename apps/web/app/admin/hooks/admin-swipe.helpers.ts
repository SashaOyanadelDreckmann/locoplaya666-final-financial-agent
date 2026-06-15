export const ADMIN_SWIPE_THRESHOLD_PX = 56;
export const ADMIN_SWIPE_MAX_DRAG_PX = 120;
export const ADMIN_SWIPE_SLIDE_MS = 220;

const SWIPE_SKIP_SELECTOR = [
  'input',
  'textarea',
  'select',
  'button',
  'a',
  'pre',
  '.admin-scroll-x',
  '.admin-table-wrap',
  '.admin-explorer-nav',
  '.admin-json',
].join(',');

export function shouldSkipAdminSwipe(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest(SWIPE_SKIP_SELECTOR));
}

export function resolveAdminSwipeAxis(deltaX: number, deltaY: number): 'x' | 'y' | null {
  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);
  if (absX < 8 && absY < 8) return null;
  if (absX < absY * 1.15) return 'y';
  if (absY < absX * 1.15) return 'x';
  return null;
}
