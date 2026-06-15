import { useEffect, type RefObject } from 'react';

import { canStepAdminTab, stepAdminTab, type AdminTabId } from '../helpers/admin-format';
import {
  ADMIN_SWIPE_MAX_DRAG_PX,
  ADMIN_SWIPE_SLIDE_MS,
  ADMIN_SWIPE_THRESHOLD_PX,
  resolveAdminSwipeAxis,
  shouldSkipAdminSwipe,
} from './admin-swipe.helpers';

type Options = {
  enabled: boolean;
  hostRef: RefObject<HTMLElement | null>;
  activeTab: AdminTabId;
  onTabChange: (tab: AdminTabId) => void;
};

export function useAdminTabSwipe({ enabled, hostRef, activeTab, onTabChange }: Options) {
  useEffect(() => {
    if (!enabled) return;

    const host = hostRef.current;
    if (!host) return;

    let startX = 0;
    let startY = 0;
    let tracking = false;
    let axisLocked: 'x' | 'y' | null = null;
    let deltaX = 0;
    let slideTimer: number | null = null;

    const clearDrag = () => {
      host.classList.remove('is-admin-tab-swipe-dragging');
      host.style.removeProperty('--admin-tab-swipe-x');
    };

    const clearSlide = () => {
      delete host.dataset.adminTabSlide;
      clearDrag();
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      if (shouldSkipAdminSwipe(event.target)) return;

      tracking = true;
      axisLocked = null;
      deltaX = 0;
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;

      if (slideTimer) {
        window.clearTimeout(slideTimer);
        slideTimer = null;
      }
      clearSlide();
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!tracking || event.touches.length !== 1) return;

      deltaX = event.touches[0].clientX - startX;
      const deltaY = event.touches[0].clientY - startY;

      if (!axisLocked) {
        axisLocked = resolveAdminSwipeAxis(deltaX, deltaY);
      }
      if (axisLocked !== 'x') return;

      let resisted = deltaX;
      if (deltaX < 0 && !canStepAdminTab(activeTab, 'next')) resisted = deltaX * 0.2;
      if (deltaX > 0 && !canStepAdminTab(activeTab, 'prev')) resisted = deltaX * 0.2;

      const clamped = Math.max(-ADMIN_SWIPE_MAX_DRAG_PX, Math.min(ADMIN_SWIPE_MAX_DRAG_PX, resisted));
      host.style.setProperty('--admin-tab-swipe-x', `${clamped}px`);
      host.classList.toggle('is-admin-tab-swipe-dragging', Math.abs(clamped) > 2);
      event.preventDefault();
    };

    const onTouchEnd = () => {
      if (!tracking) return;
      tracking = false;

      const wasHorizontal = axisLocked === 'x';
      axisLocked = null;
      if (!wasHorizontal) {
        clearDrag();
        deltaX = 0;
        return;
      }

      let direction: 'prev' | 'next' | null = null;
      if (deltaX <= -ADMIN_SWIPE_THRESHOLD_PX) direction = 'next';
      else if (deltaX >= ADMIN_SWIPE_THRESHOLD_PX) direction = 'prev';

      const nextTab = direction ? stepAdminTab(activeTab, direction) : null;
      if (!nextTab || nextTab === activeTab || !direction) {
        clearDrag();
        deltaX = 0;
        return;
      }

      host.dataset.adminTabSlide = direction === 'next' ? 'forward' : 'backward';
      clearDrag();

      slideTimer = window.setTimeout(() => {
        onTabChange(nextTab);
        clearSlide();
        slideTimer = null;
      }, ADMIN_SWIPE_SLIDE_MS);

      deltaX = 0;
    };

    host.addEventListener('touchstart', onTouchStart, { passive: true, capture: true });
    host.addEventListener('touchmove', onTouchMove, { passive: false, capture: true });
    host.addEventListener('touchend', onTouchEnd, { passive: true, capture: true });
    host.addEventListener('touchcancel', onTouchEnd, { passive: true, capture: true });

    return () => {
      if (slideTimer) window.clearTimeout(slideTimer);
      host.removeEventListener('touchstart', onTouchStart, true);
      host.removeEventListener('touchmove', onTouchMove, true);
      host.removeEventListener('touchend', onTouchEnd, true);
      host.removeEventListener('touchcancel', onTouchEnd, true);
      clearSlide();
    };
  }, [activeTab, enabled, hostRef, onTabChange]);
}
