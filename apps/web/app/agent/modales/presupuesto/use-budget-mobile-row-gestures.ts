import { useEffect, type MutableRefObject, type RefObject } from 'react';

import {
  computeBudgetMobileRowDeckTransforms,
  resolveBudgetMobileRowDeckPeekDirection,
} from './budget-modal.mobile-row-deck';
import {
  BUDGET_MOBILE_SWIPE_MAX_DRAG_PX,
  shouldSkipBudgetMobileGesture,
} from './budget-modal.mobile-gesture.helpers';
import {
  BUDGET_MOBILE_ROW_SLIDE_EXIT_MS,
  getBudgetMobileRowSlideExitToken,
} from './budget-modal.mobile-row-slide';
import {
  readMobileBudgetRowSnapCandidates,
  resolveActiveMobileBudgetRowIndex,
  resolveBudgetMobileRowGestureAxis,
  resolveDominantMobileBudgetRowScrollTop,
  resolveMobileBudgetRowStepDirection,
  resolveMobileBudgetRowStepScrollTop,
  shouldSkipMobileBudgetRowSnap,
} from './budget-modal.mobile-table-snap';

type UseBudgetMobileRowGesturesOptions = {
  enabled: boolean;
  scrollHostRef: RefObject<HTMLElement | null>;
  suppressRef: MutableRefObject<boolean>;
  onActiveRowChange: (rowId: string | null) => void;
};

const ROW_DECK_ACTIVE_CLASS = 'is-row-swipe-active';
const ROW_DECK_PEEK_CLASS = 'is-row-swipe-peek';
const ROW_DECK_EXIT_CLASS = 'is-row-swipe-exiting';
const ROW_DECK_RELEASING_CLASS = 'is-row-swipe-releasing';
const ROW_DECK_DRAGGING_CLASS = 'is-row-deck-dragging';

type DeckSession = {
  activeRow: HTMLElement;
  peekRow: HTMLElement | null;
  peekDirection: 'next' | 'prev' | null;
};

function readRowElements(wrap: HTMLElement): HTMLElement[] {
  return Array.from(wrap.querySelectorAll<HTMLElement>('tbody tr.is-mobile-row-card'));
}

function clearRowDeck(wrap: HTMLElement, scrollHost: HTMLElement) {
  for (const row of readRowElements(wrap)) {
    row.classList.remove(
      ROW_DECK_ACTIVE_CLASS,
      ROW_DECK_PEEK_CLASS,
      ROW_DECK_EXIT_CLASS,
      ROW_DECK_RELEASING_CLASS,
    );
    row.style.removeProperty('--budget-row-active-x');
    row.style.removeProperty('--budget-row-active-scale');
    row.style.removeProperty('--budget-row-active-opacity');
    row.style.removeProperty('--budget-row-peek-x');
    row.style.removeProperty('--budget-row-peek-scale');
    row.style.removeProperty('--budget-row-peek-opacity');
    row.style.removeProperty('z-index');
    row.style.removeProperty('position');
    row.style.removeProperty('top');
    row.style.removeProperty('left');
    row.style.removeProperty('width');
    row.style.removeProperty('pointer-events');
  }
  wrap.classList.remove(ROW_DECK_DRAGGING_CLASS);
  scrollHost.classList.remove('is-row-swipe-dragging');
  scrollHost.style.setProperty('--budget-row-swipe-x', '0px');
}

function applyDeckTransforms(
  activeRow: HTMLElement,
  peekRow: HTMLElement | null,
  transforms: ReturnType<typeof computeBudgetMobileRowDeckTransforms>,
) {
  activeRow.style.setProperty('--budget-row-active-x', `${transforms.activeX}px`);
  activeRow.style.setProperty('--budget-row-active-scale', `${transforms.activeScale}`);
  activeRow.style.setProperty('--budget-row-active-opacity', `${transforms.activeOpacity}`);

  if (!peekRow) return;

  peekRow.style.setProperty('--budget-row-peek-x', `${transforms.peekX}px`);
  peekRow.style.setProperty('--budget-row-peek-scale', `${transforms.peekScale}`);
  peekRow.style.setProperty('--budget-row-peek-opacity', `${transforms.peekOpacity}`);
}

function pinPeekRowBehindActive(
  wrap: HTMLElement,
  activeRow: HTMLElement,
  peekRow: HTMLElement,
) {
  peekRow.classList.add(ROW_DECK_PEEK_CLASS);
  peekRow.style.position = 'absolute';
  peekRow.style.top = `${activeRow.offsetTop - wrap.scrollTop}px`;
  peekRow.style.left = `${activeRow.offsetLeft}px`;
  peekRow.style.width = `${activeRow.offsetWidth}px`;
  peekRow.style.zIndex = '2';
  peekRow.style.pointerEvents = 'none';
}

export function useBudgetMobileRowGestures({
  enabled,
  scrollHostRef,
  suppressRef,
  onActiveRowChange,
}: UseBudgetMobileRowGesturesOptions) {
  useEffect(() => {
    if (!enabled) return;

    const scrollHost = scrollHostRef.current;
    if (!scrollHost) return;

    const wrap = scrollHost.querySelector<HTMLElement>('.budget-table-wrap');
    if (!wrap) return;

    const gestureRoot = scrollHost;

    let startX = 0;
    let startY = 0;
    let tracking = false;
    let isTouching = false;
    let axisLocked: 'x' | 'y' | null = null;
    let deltaX = 0;
    let deltaY = 0;
    let startScrollTop = 0;
    let snapTimer: number | null = null;
    let snapFrame: number | null = null;
    let slideTimer: number | null = null;
    let releaseTimer: number | null = null;
    let deckSession: DeckSession | null = null;

    const syncActiveRow = () => {
      const candidates = readMobileBudgetRowSnapCandidates(wrap);
      const index = resolveActiveMobileBudgetRowIndex(
        wrap.scrollTop,
        wrap.clientHeight,
        candidates,
      );
      const rowId = candidates[index]?.rowId ?? null;
      if (rowId) onActiveRowChange(rowId);
    };

    const beginDeckSession = (value: number) => {
      const candidates = readMobileBudgetRowSnapCandidates(wrap);
      const currentIndex = resolveActiveMobileBudgetRowIndex(
        wrap.scrollTop,
        wrap.clientHeight,
        candidates,
      );
      const rows = readRowElements(wrap);
      const activeRow = rows[currentIndex] ?? null;
      if (!activeRow) return null;

      const canNext =
        resolveMobileBudgetRowStepScrollTop(
          wrap.scrollTop,
          wrap.clientHeight,
          candidates,
          'next',
        ) !== null;
      const canPrev =
        resolveMobileBudgetRowStepScrollTop(
          wrap.scrollTop,
          wrap.clientHeight,
          candidates,
          'prev',
        ) !== null;
      const peekDirection = resolveBudgetMobileRowDeckPeekDirection(value, canNext, canPrev);

      wrap.classList.add(ROW_DECK_DRAGGING_CLASS);
      activeRow.classList.add(ROW_DECK_ACTIVE_CLASS);
      activeRow.style.zIndex = '3';

      let peekRow: HTMLElement | null = null;
      if (peekDirection) {
        const peekIndex = peekDirection === 'next' ? currentIndex + 1 : currentIndex - 1;
        peekRow = rows[peekIndex] ?? null;
        if (peekRow) pinPeekRowBehindActive(wrap, activeRow, peekRow);
      }

      return { activeRow, peekRow, peekDirection } satisfies DeckSession;
    };

    const updateHorizontalDrag = (value: number) => {
      scrollHost.style.setProperty('--budget-row-swipe-x', `${value}px`);
      scrollHost.classList.toggle('is-row-swipe-dragging', Math.abs(value) > 2);

      if (!deckSession) {
        deckSession = beginDeckSession(value);
      }
      if (!deckSession) return;

      const transforms = computeBudgetMobileRowDeckTransforms({
        deltaX: value,
        hostWidth: scrollHost.clientWidth,
        peekDirection: deckSession.peekDirection ?? null,
      });
      applyDeckTransforms(deckSession.activeRow, deckSession.peekRow, transforms);
    };

    const releaseHorizontalDrag = () => {
      if (!deckSession) {
        clearRowDeck(wrap, scrollHost);
        return;
      }

      scrollHost.classList.remove('is-row-swipe-dragging');
      deckSession.activeRow.classList.add(ROW_DECK_RELEASING_CLASS);
      deckSession.peekRow?.classList.add(ROW_DECK_RELEASING_CLASS);

      applyDeckTransforms(deckSession.activeRow, deckSession.peekRow, {
        activeX: 0,
        activeScale: 1,
        activeOpacity: 1,
        peekX: 0,
        peekScale: 1,
        peekOpacity: 0,
      });

      if (releaseTimer) window.clearTimeout(releaseTimer);
      releaseTimer = window.setTimeout(() => {
        deckSession = null;
        clearRowDeck(wrap, scrollHost);
      }, 260);
    };

    const clearSlideState = () => {
      if (slideTimer) window.clearTimeout(slideTimer);
      slideTimer = null;
      delete scrollHost.dataset.budgetRowSlide;
      deckSession = null;
      clearRowDeck(wrap, scrollHost);
    };

    const scrollToTopVertical = (targetTop: number) => {
      if (Math.abs(wrap.scrollTop - targetTop) < 2) return;

      suppressRef.current = true;
      wrap.scrollTo({ top: targetTop, behavior: 'smooth' });
      window.setTimeout(() => {
        suppressRef.current = false;
        syncActiveRow();
      }, 360);
    };

    const commitHorizontalRowStep = (
      direction: 'next' | 'prev',
      targetTop: number,
    ) => {
      if (!deckSession) {
        deckSession = beginDeckSession(direction === 'next' ? -80 : 80);
      }
      if (!deckSession) return;

      suppressRef.current = true;
      scrollHost.classList.remove('is-row-swipe-dragging');
      scrollHost.style.setProperty('--budget-row-swipe-x', '0px');

      deckSession.activeRow.classList.remove(ROW_DECK_RELEASING_CLASS);
      deckSession.activeRow.classList.add(ROW_DECK_EXIT_CLASS);
      deckSession.activeRow.style.setProperty('--budget-row-active-x', '0px');
      deckSession.activeRow.style.setProperty('--budget-row-active-scale', '1');
      deckSession.activeRow.style.setProperty('--budget-row-active-opacity', '1');

      if (deckSession.peekRow) {
        deckSession.peekRow.classList.remove(ROW_DECK_RELEASING_CLASS);
        deckSession.peekRow.style.setProperty('--budget-row-peek-x', '0px');
        deckSession.peekRow.style.setProperty('--budget-row-peek-scale', '1');
        deckSession.peekRow.style.setProperty('--budget-row-peek-opacity', '1');
      }

      scrollHost.dataset.budgetRowSlide = getBudgetMobileRowSlideExitToken(direction);

      slideTimer = window.setTimeout(() => {
        clearRowDeck(wrap, scrollHost);
        wrap.scrollTo({ top: targetTop, behavior: 'auto' });
        delete scrollHost.dataset.budgetRowSlide;
        syncActiveRow();
        deckSession = null;
        suppressRef.current = false;
      }, BUDGET_MOBILE_ROW_SLIDE_EXIT_MS);
    };

    const snapToDominantRow = () => {
      if (suppressRef.current || isTouching) return;
      if (shouldSkipMobileBudgetRowSnap(wrap)) return;

      const candidates = readMobileBudgetRowSnapCandidates(wrap);
      const targetTop = resolveDominantMobileBudgetRowScrollTop(
        wrap.scrollTop,
        wrap.clientHeight,
        candidates,
      );
      if (targetTop === null) return;
      scrollToTopVertical(targetTop);
    };

    const scheduleSnap = () => {
      if (snapTimer) window.clearTimeout(snapTimer);
      snapTimer = window.setTimeout(snapToDominantRow, 90);
    };

    const canStepHorizontally = (direction: 'next' | 'prev') => {
      const candidates = readMobileBudgetRowSnapCandidates(wrap);
      return resolveMobileBudgetRowStepScrollTop(
        wrap.scrollTop,
        wrap.clientHeight,
        candidates,
        direction,
      ) !== null;
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      if (!gestureRoot.contains(event.target as Node)) return;
      if (shouldSkipBudgetMobileGesture(event.target)) return;

      isTouching = true;
      tracking = true;
      axisLocked = null;
      deltaX = 0;
      deltaY = 0;
      deckSession = null;
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
      startScrollTop = wrap.scrollTop;
      if (snapTimer) window.clearTimeout(snapTimer);
      if (snapFrame !== null) window.cancelAnimationFrame(snapFrame);
      if (releaseTimer) window.clearTimeout(releaseTimer);
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!tracking || event.touches.length !== 1) return;

      deltaX = event.touches[0].clientX - startX;
      deltaY = event.touches[0].clientY - startY;

      if (!axisLocked) {
        axisLocked = resolveBudgetMobileRowGestureAxis(deltaX, deltaY);
      }

      if (axisLocked === 'x') {
        let resisted = deltaX;
        if (deltaX < 0 && !canStepHorizontally('next')) {
          resisted = deltaX * 0.18;
        }
        if (deltaX > 0 && !canStepHorizontally('prev')) {
          resisted = deltaX * 0.18;
        }

        updateHorizontalDrag(
          Math.max(-BUDGET_MOBILE_SWIPE_MAX_DRAG_PX, Math.min(BUDGET_MOBILE_SWIPE_MAX_DRAG_PX, resisted)),
        );
        event.preventDefault();
      }
    };

    const onTouchEnd = () => {
      isTouching = false;
      tracking = false;

      if (shouldSkipMobileBudgetRowSnap(wrap)) {
        axisLocked = null;
        deckSession = null;
        clearRowDeck(wrap, scrollHost);
        return;
      }

      const candidates = readMobileBudgetRowSnapCandidates(wrap);
      let handled = false;
      const wasHorizontal = axisLocked === 'x';

      if (wasHorizontal) {
        const direction = resolveMobileBudgetRowStepDirection(deltaX, deltaY, 'x');
        if (direction) {
          const targetTop = resolveMobileBudgetRowStepScrollTop(
            wrap.scrollTop,
            wrap.clientHeight,
            candidates,
            direction,
          );
          if (targetTop !== null) {
            commitHorizontalRowStep(direction, targetTop);
            handled = true;
          }
        }
        if (!handled) {
          releaseHorizontalDrag();
        }
      } else if (axisLocked === 'y') {
        const direction = resolveMobileBudgetRowStepDirection(deltaX, deltaY, 'y');
        const scrolledVertically = Math.abs(wrap.scrollTop - startScrollTop) > 16;
        if (direction && !scrolledVertically) {
          const targetTop = resolveMobileBudgetRowStepScrollTop(
            wrap.scrollTop,
            wrap.clientHeight,
            candidates,
            direction,
          );
          if (targetTop !== null) {
            scrollToTopVertical(targetTop);
            handled = true;
          }
        }
        deckSession = null;
        clearRowDeck(wrap, scrollHost);
      } else {
        deckSession = null;
        clearRowDeck(wrap, scrollHost);
      }

      axisLocked = null;
      deltaX = 0;
      deltaY = 0;

      if (!handled && !wasHorizontal) {
        snapFrame = window.requestAnimationFrame(() => {
          snapFrame = window.requestAnimationFrame(scheduleSnap);
        });
      }
    };

    const onScroll = () => {
      if (isTouching) return;
      scheduleSnap();
    };

    gestureRoot.addEventListener('touchstart', onTouchStart, { passive: true, capture: true });
    gestureRoot.addEventListener('touchmove', onTouchMove, { passive: false, capture: true });
    gestureRoot.addEventListener('touchend', onTouchEnd, { passive: true, capture: true });
    gestureRoot.addEventListener('touchcancel', onTouchEnd, { passive: true, capture: true });
    wrap.addEventListener('scroll', onScroll, { passive: true });
    wrap.addEventListener('scrollend', snapToDominantRow, { passive: true });

    return () => {
      if (snapTimer) window.clearTimeout(snapTimer);
      if (snapFrame !== null) window.cancelAnimationFrame(snapFrame);
      if (slideTimer) window.clearTimeout(slideTimer);
      if (releaseTimer) window.clearTimeout(releaseTimer);
      gestureRoot.removeEventListener('touchstart', onTouchStart, true);
      gestureRoot.removeEventListener('touchmove', onTouchMove, true);
      gestureRoot.removeEventListener('touchend', onTouchEnd, true);
      gestureRoot.removeEventListener('touchcancel', onTouchEnd, true);
      wrap.removeEventListener('scroll', onScroll);
      wrap.removeEventListener('scrollend', snapToDominantRow);
      deckSession = null;
      clearRowDeck(wrap, scrollHost);
      clearSlideState();
    };
  }, [enabled, onActiveRowChange, scrollHostRef, suppressRef]);
}
