/** Scroll the transactions modal body so the post-format continue area is visible (mobile). */
export function revealTransactionsEvidenceContinueStep(
  anchor: HTMLElement | null,
  options?: { behavior?: ScrollBehavior },
): void {
  if (!anchor || typeof window === 'undefined') return;

  const behavior = options?.behavior ?? 'smooth';
  const scrollHost = anchor.closest('.tx-scroll-body') as HTMLElement | null;
  if (!scrollHost) {
    anchor.scrollIntoView({ behavior, block: 'nearest' });
    return;
  }

  const hostRect = scrollHost.getBoundingClientRect();
  const anchorRect = anchor.getBoundingClientRect();
  const revealPadding = 20;
  const bottomOverflow = anchorRect.bottom - hostRect.bottom + revealPadding;
  const topOverflow = hostRect.top + revealPadding - anchorRect.top;

  if (bottomOverflow <= 0 && topOverflow <= 0) return;

  const delta = bottomOverflow > 0 ? bottomOverflow : -topOverflow;
  scrollHost.scrollTo({
    top: Math.max(0, scrollHost.scrollTop + delta),
    behavior,
  });
}
