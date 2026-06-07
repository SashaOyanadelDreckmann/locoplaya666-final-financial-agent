import { useLayoutEffect, useRef, type RefObject } from 'react';

/** Clone copies on each side of the real deck — 2 = prepend×2 + real + append×2. */
export const PANEL_LOOP_SIDE_COPIES = 2;

type LoopMetrics = {
  firstRealLeft: number;
  firstAppendLeft: number;
  segmentWidth: number;
  cardCount: number;
  homeScrollLeft: number;
  minScrollLeft: number;
};

const LOOP_EDGE_EPS = 6;
const PROFILE_ORIGIN = 0;

type LoopOptions = {
  panelGridRef: RefObject<HTMLDivElement | null>;
  cardCount: number;
  leftNeighborOrigin: number;
  profileOrigin?: number;
  sideCopies?: number;
  resetKey: number;
};

function expectedChildCount(cardCount: number, sideCopies: number) {
  return cardCount * (sideCopies * 2 + 1);
}

function readLoopMetrics(el: HTMLElement, options: LoopOptions): LoopMetrics | null {
  const sideCopies = options.sideCopies ?? PANEL_LOOP_SIDE_COPIES;
  const { cardCount } = options;
  if (cardCount <= 0) return null;

  const children = Array.from(el.children) as HTMLElement[];
  const expected = expectedChildCount(cardCount, sideCopies);
  if (children.length < expected) return null;

  const profileOrigin = options.profileOrigin ?? PROFILE_ORIGIN;
  const realStart = sideCopies * cardCount;
  const appendStart = (sideCopies + 1) * cardCount;

  const firstReal = children[realStart + profileOrigin];
  const firstAppend = children[appendStart + profileOrigin];
  if (!firstReal || !firstAppend) return null;

  const segmentWidth = firstAppend.offsetLeft - firstReal.offsetLeft;
  if (segmentWidth <= 0) return null;

  const homeScrollLeft = computeHomeScrollLeft(el, options, firstReal, sideCopies);
  if (homeScrollLeft == null) return null;

  const minScrollLeft = firstReal.offsetLeft - segmentWidth + LOOP_EDGE_EPS;

  return {
    firstRealLeft: firstReal.offsetLeft,
    firstAppendLeft: firstAppend.offsetLeft,
    segmentWidth,
    cardCount,
    homeScrollLeft,
    minScrollLeft,
  };
}

function computeHomeScrollLeft(
  el: HTMLElement,
  options: LoopOptions,
  firstReal: HTMLElement,
  sideCopies: number
): number | null {
  const { cardCount, leftNeighborOrigin } = options;

  const leftPrepend = el.querySelector<HTMLElement>(
    `[data-loop-segment="prepend-1"][data-loop-origin="${leftNeighborOrigin}"]`
  );

  if (!leftPrepend || leftPrepend.offsetWidth <= 0 || firstReal.offsetWidth <= 0) return null;

  const appendStart = (sideCopies + 1) * cardCount;
  const firstAppend = el.children[appendStart] as HTMLElement | undefined;
  if (!firstAppend) return null;

  const segmentWidth = firstAppend.offsetLeft - firstReal.offsetLeft;
  if (segmentWidth <= 0) return null;

  const peek = Math.max(96, Math.round(leftPrepend.offsetWidth * 0.68));
  const targetFromLeft = leftPrepend.offsetLeft + leftPrepend.offsetWidth - peek;
  const targetFromProfile = firstReal.offsetLeft - peek;
  const minScrollLeft = firstReal.offsetLeft - segmentWidth + LOOP_EDGE_EPS;

  return Math.max(minScrollLeft, Math.min(targetFromLeft, targetFromProfile));
}

function jumpScroll(el: HTMLElement, nextLeft: number) {
  const prevBehavior = el.style.scrollBehavior;
  el.style.scrollBehavior = 'auto';
  el.scrollLeft = nextLeft;
  el.style.scrollBehavior = prevBehavior;
}

function findClosestCard(el: HTMLElement) {
  const cards = Array.from(el.children) as HTMLElement[];
  if (cards.length === 0) return null;

  const viewportCenter = el.scrollLeft + el.clientWidth / 2;
  let closest: HTMLElement | null = null;
  let minDistance = Number.POSITIVE_INFINITY;

  for (const card of cards) {
    const cardCenter = card.offsetLeft + card.offsetWidth / 2;
    const distance = Math.abs(cardCenter - viewportCenter);
    if (distance < minDistance) {
      minDistance = distance;
      closest = card;
    }
  }

  return closest;
}

function syncFrontCard(el: HTMLElement, options: LoopOptions) {
  const cards = Array.from(el.children) as HTMLElement[];
  if (cards.length === 0) return;

  const profileOrigin = options.profileOrigin ?? PROFILE_ORIGIN;
  const sideCopies = options.sideCopies ?? PANEL_LOOP_SIDE_COPIES;
  const cardCount = options.cardCount;
  const realStart = sideCopies * cardCount;
  const profileInReal = cards[realStart + profileOrigin];

  let front = findClosestCard(el);

  if (profileInReal) {
    const viewportCenter = el.scrollLeft + el.clientWidth / 2;
    const profileCenter = profileInReal.offsetLeft + profileInReal.offsetWidth / 2;
    if (Math.abs(profileCenter - viewportCenter) < profileInReal.offsetWidth * 0.55) {
      front = profileInReal;
    }
  }

  for (const card of cards) {
    card.classList.remove('is-mobile-front', 'is-mobile-left', 'is-mobile-right');
    if (!front) continue;
    if (card === front) {
      card.classList.add('is-mobile-front');
    } else if (card.offsetLeft < front.offsetLeft) {
      card.classList.add('is-mobile-left');
    } else {
      card.classList.add('is-mobile-right');
    }
  }
}

function normalizeLoopScroll(
  el: HTMLElement,
  metrics: LoopMetrics,
  adjustingRef: { current: boolean }
): boolean {
  if (adjustingRef.current) return false;

  let nextLeft = el.scrollLeft;
  let changed = false;
  const maxLeft = metrics.firstAppendLeft - LOOP_EDGE_EPS;
  let guard = 0;

  while (nextLeft >= maxLeft && guard < 10) {
    nextLeft -= metrics.segmentWidth;
    changed = true;
    guard += 1;
  }

  guard = 0;
  while (nextLeft < metrics.minScrollLeft && guard < 10) {
    nextLeft += metrics.segmentWidth;
    changed = true;
    guard += 1;
  }

  if (!changed) return false;

  adjustingRef.current = true;
  jumpScroll(el, nextLeft);
  adjustingRef.current = false;
  return true;
}

function applyHomeScroll(el: HTMLElement, options: LoopOptions): boolean {
  const metrics = readLoopMetrics(el, options);
  if (!metrics) return false;

  jumpScroll(el, metrics.homeScrollLeft);
  syncFrontCard(el, options);

  return Math.abs(el.scrollLeft - metrics.homeScrollLeft) <= 8;
}

export function useMobilePanelInfiniteLoop(options: LoopOptions) {
  const homeReadyRef = useRef(false);

  useLayoutEffect(() => {
    const el = options.panelGridRef.current;
    if (!el || options.cardCount <= 0) {
      homeReadyRef.current = false;
      return;
    }

    const loopOptions: LoopOptions = {
      ...options,
      profileOrigin: options.profileOrigin ?? PROFILE_ORIGIN,
      sideCopies: options.sideCopies ?? PANEL_LOOP_SIDE_COPIES,
    };

    const adjustingRef = { current: false };
    homeReadyRef.current = false;

    const tryApplyHomeScroll = () => {
      if (homeReadyRef.current) return true;
      const applied = applyHomeScroll(el, loopOptions);
      if (applied) homeReadyRef.current = true;
      return applied;
    };

    const runNormalize = () => {
      if (!homeReadyRef.current || adjustingRef.current) return;
      const metrics = readLoopMetrics(el, loopOptions);
      if (!metrics) return;
      if (normalizeLoopScroll(el, metrics, adjustingRef)) {
        syncFrontCard(el, loopOptions);
      }
    };

    const scheduleInitialScroll = () => {
      let attempts = 0;
      const run = () => {
        if (homeReadyRef.current) return;
        attempts += 1;
        const applied = tryApplyHomeScroll();
        if (!applied && attempts < 40) {
          window.requestAnimationFrame(run);
        }
      };
      run();
      window.setTimeout(run, 0);
      window.setTimeout(run, 60);
      window.setTimeout(run, 160);
      window.setTimeout(run, 360);
    };

    const onScroll = () => {
      if (adjustingRef.current) return;
      if (homeReadyRef.current) {
        const metrics = readLoopMetrics(el, loopOptions);
        if (metrics) normalizeLoopScroll(el, metrics, adjustingRef);
      }
      syncFrontCard(el, loopOptions);
    };

    const onScrollEnd = () => {
      runNormalize();
    };

    const onTouchEnd = () => {
      window.setTimeout(onScrollEnd, 0);
      window.setTimeout(onScrollEnd, 48);
      window.setTimeout(onScrollEnd, 120);
    };

    scheduleInitialScroll();

    const mutationObserver = new MutationObserver(() => {
      if (!homeReadyRef.current && el.children.length >= expectedChildCount(loopOptions.cardCount, loopOptions.sideCopies!)) {
        tryApplyHomeScroll();
      }
    });
    mutationObserver.observe(el, { childList: true });

    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            if (!homeReadyRef.current) {
              tryApplyHomeScroll();
              return;
            }
            onScrollEnd();
          })
        : null;
    resizeObserver?.observe(el);

    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('scrollend', onScrollEnd, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      mutationObserver.disconnect();
      resizeObserver?.disconnect();
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('scrollend', onScrollEnd);
      el.removeEventListener('touchend', onTouchEnd);
      homeReadyRef.current = false;
    };
  }, [
    options.panelGridRef,
    options.cardCount,
    options.leftNeighborOrigin,
    options.profileOrigin,
    options.sideCopies,
    options.resetKey,
  ]);

  return {
    pauseLoop: (_resumeDelay = 2600) => {
      /* manual-only carousel */
    },
  };
}
