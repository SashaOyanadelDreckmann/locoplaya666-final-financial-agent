export type MobileBudgetRowSnapCandidate = {
  scrollTop: number;
  height: number;
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
    };
  });
}

export function shouldSkipMobileBudgetRowSnap(wrap: HTMLElement): boolean {
  const active = document.activeElement;
  if (!active || !wrap.contains(active)) return false;
  const tag = active.tagName;
  return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
}
