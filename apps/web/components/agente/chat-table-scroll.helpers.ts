export type ChatTableScrollState = {
  canScrollX: boolean;
  canScrollY: boolean;
  atStartX: boolean;
  atEndX: boolean;
  atStartY: boolean;
  atEndY: boolean;
};

const SCROLL_EPSILON = 2;

export function readChatTableScrollState(el: HTMLElement): ChatTableScrollState {
  const maxX = Math.max(0, el.scrollWidth - el.clientWidth);
  const maxY = Math.max(0, el.scrollHeight - el.clientHeight);
  const scrollLeft = el.scrollLeft;
  const scrollTop = el.scrollTop;

  return {
    canScrollX: maxX > SCROLL_EPSILON,
    canScrollY: maxY > SCROLL_EPSILON,
    atStartX: scrollLeft <= SCROLL_EPSILON,
    atEndX: scrollLeft >= maxX - SCROLL_EPSILON,
    atStartY: scrollTop <= SCROLL_EPSILON,
    atEndY: scrollTop >= maxY - SCROLL_EPSILON,
  };
}

export function buildChatTableScrollHint(state: ChatTableScrollState): string | null {
  if (!state.canScrollX && !state.canScrollY) return null;
  if (state.canScrollX && state.canScrollY) return 'Desliza para explorar la tabla';
  if (state.canScrollX) return 'Desliza para ver más columnas';
  return 'Desliza para ver más filas';
}

export function buildChatTableScrollHostClassName(
  wrapClassName: string,
  state: ChatTableScrollState,
  hintVisible: boolean,
  hintDismissed: boolean,
): string {
  const classes = ['chat-table-scroll-host', wrapClassName];
  if (state.canScrollX) classes.push('is-scrollable-x');
  if (state.canScrollY) classes.push('is-scrollable-y');
  if (state.atStartX) classes.push('is-at-scroll-start-x');
  if (state.atEndX) classes.push('is-at-scroll-end-x');
  if (state.atStartY) classes.push('is-at-scroll-start-y');
  if (state.atEndY) classes.push('is-at-scroll-end-y');
  if (hintVisible) classes.push('is-hint-visible');
  if (hintDismissed) classes.push('is-hint-dismissed');
  return classes.filter(Boolean).join(' ');
}
