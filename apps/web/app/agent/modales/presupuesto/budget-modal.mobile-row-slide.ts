export const BUDGET_MOBILE_ROW_SLIDE_EXIT_MS = 280;
export const BUDGET_MOBILE_ROW_SLIDE_ENTER_MS = 320;

export function getBudgetMobileRowSlideExitToken(direction: 'next' | 'prev'): 'forward' | 'backward' {
  return direction === 'next' ? 'forward' : 'backward';
}

export function getBudgetMobileRowSlideEnterToken(direction: 'next' | 'prev'): 'enter-forward' | 'enter-backward' {
  return direction === 'next' ? 'enter-forward' : 'enter-backward';
}
