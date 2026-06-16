import { useEffect, type RefObject } from 'react';

import {
  BUDGET_MOBILE_SWIPE_MAX_DRAG_PX,
  BUDGET_MOBILE_SWIPE_THRESHOLD_PX,
  BUDGET_VIEW_SLIDE_MS,
  resolveBudgetViewSwipeAxis,
  shouldSkipBudgetMobileGesture,
  shouldSkipBudgetViewSwipeHost,
} from './budget-modal.mobile-gesture.helpers';
import {
  canStepBudgetViewMode,
  stepBudgetViewMode,
} from './budget-modal.view-nav.helpers';
import type { BudgetViewMode } from './use-budget-modal-layout';
import { getBudgetTableViewMode } from './use-budget-modal-layout';

type UseBudgetViewSwipeOptions = {
  enabled: boolean;
  stageRef: RefObject<HTMLDivElement | null>;
  budgetViewMode: BudgetViewMode;
  isDesktopLayout: boolean;
  onViewModeChange: (mode: BudgetViewMode) => void;
};

function getBudgetViewSlideToken(direction: 'prev' | 'next'): 'forward' | 'backward' {
  return direction === 'next' ? 'forward' : 'backward';
}

/**
 * Horizontal swipe between budget views (assistant ↔ table on mobile; 3 modes on desktop).
 * Disabled while the user interacts with inputs or while row-deck drag is active.
 */
export function useBudgetViewSwipe({
  enabled,
  stageRef,
  budgetViewMode,
  isDesktopLayout,
  onViewModeChange,
}: UseBudgetViewSwipeOptions) {
  useEffect(() => {
    if (!enabled) return;

    const stage = stageRef.current;
    if (!stage) return;

    const tableViewMode = getBudgetTableViewMode(isDesktopLayout);

    let startX = 0;
    let startY = 0;
    let tracking = false;
    let axisLocked: 'x' | 'y' | null = null;
    let deltaX = 0;
    let deltaY = 0;
    let slideTimer: number | null = null;

    const isTableView = () => budgetViewMode === tableViewMode;

    const clearDragVisual = () => {
      stage.classList.remove('is-swipe-dragging');
      stage.style.setProperty('--budget-swipe-x', '0px');
    };

    const clearSlideVisual = () => {
      delete stage.dataset.budgetSlide;
      clearDragVisual();
    };

    const updateDrag = (value: number) => {
      stage.style.setProperty('--budget-swipe-x', `${value}px`);
      stage.classList.toggle('is-swipe-dragging', Math.abs(value) > 2);
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;

      const target = event.target;
      if (shouldSkipBudgetMobileGesture(target)) return;
      if (shouldSkipBudgetViewSwipeHost(target, isTableView())) return;

      const scrollHost = stage.querySelector<HTMLElement>('.budget-table-scroll-host');
      if (scrollHost?.classList.contains('is-row-swipe-dragging')) return;

      tracking = true;
      axisLocked = null;
      deltaX = 0;
      deltaY = 0;
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;

      if (slideTimer) {
        window.clearTimeout(slideTimer);
        slideTimer = null;
      }
      clearSlideVisual();
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!tracking || event.touches.length !== 1) return;

      deltaX = event.touches[0].clientX - startX;
      deltaY = event.touches[0].clientY - startY;

      if (!axisLocked) {
        axisLocked = resolveBudgetViewSwipeAxis(deltaX, deltaY, isTableView());
      }

      if (axisLocked !== 'x') return;

      let resisted = deltaX;
      if (deltaX < 0 && !canStepBudgetViewMode(budgetViewMode, 'next', isDesktopLayout)) {
        resisted = deltaX * 0.22;
      }
      if (deltaX > 0 && !canStepBudgetViewMode(budgetViewMode, 'prev', isDesktopLayout)) {
        resisted = deltaX * 0.22;
      }

      updateDrag(
        Math.max(
          -BUDGET_MOBILE_SWIPE_MAX_DRAG_PX,
          Math.min(BUDGET_MOBILE_SWIPE_MAX_DRAG_PX, resisted),
        ),
      );
      event.preventDefault();
    };

    const onTouchEnd = () => {
      if (!tracking) return;
      tracking = false;

      const wasHorizontal = axisLocked === 'x';
      axisLocked = null;

      if (!wasHorizontal) {
        clearDragVisual();
        deltaX = 0;
        deltaY = 0;
        return;
      }

      let direction: 'next' | 'prev' | null = null;
      if (deltaX <= -BUDGET_MOBILE_SWIPE_THRESHOLD_PX) direction = 'next';
      else if (deltaX >= BUDGET_MOBILE_SWIPE_THRESHOLD_PX) direction = 'prev';

      const nextMode = direction
        ? stepBudgetViewMode(budgetViewMode, direction, isDesktopLayout)
        : null;

      if (!nextMode || !direction) {
        clearDragVisual();
        deltaX = 0;
        deltaY = 0;
        return;
      }

      stage.dataset.budgetSlide = getBudgetViewSlideToken(direction);
      clearDragVisual();

      slideTimer = window.setTimeout(() => {
        onViewModeChange(nextMode);
        clearSlideVisual();
        slideTimer = null;
      }, BUDGET_VIEW_SLIDE_MS);

      deltaX = 0;
      deltaY = 0;
    };

    stage.addEventListener('touchstart', onTouchStart, { passive: true, capture: true });
    stage.addEventListener('touchmove', onTouchMove, { passive: false, capture: true });
    stage.addEventListener('touchend', onTouchEnd, { passive: true, capture: true });
    stage.addEventListener('touchcancel', onTouchEnd, { passive: true, capture: true });

    return () => {
      if (slideTimer) window.clearTimeout(slideTimer);
      stage.removeEventListener('touchstart', onTouchStart, true);
      stage.removeEventListener('touchmove', onTouchMove, true);
      stage.removeEventListener('touchend', onTouchEnd, true);
      stage.removeEventListener('touchcancel', onTouchEnd, true);
      clearSlideVisual();
    };
  }, [enabled, stageRef, budgetViewMode, isDesktopLayout, onViewModeChange]);
}
