'use client';

import { useEffect, useRef, type ReactNode } from 'react';

import {
  ADMIN_SWIPE_MAX_DRAG_PX,
  ADMIN_SWIPE_THRESHOLD_PX,
  resolveAdminSwipeAxis,
  shouldSkipAdminSwipe,
} from '../hooks/admin-swipe.helpers';

type Props = {
  list: ReactNode;
  detail: ReactNode;
  showDetail: boolean;
  onBack: () => void;
  detailLabel?: string;
  listLabel?: string;
};

export function AdminSplitPane({
  list,
  detail,
  showDetail,
  onBack,
  detailLabel = 'Detalle',
  listLabel = 'Lista',
}: Props) {
  const detailRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const panel = detailRef.current;
    if (!panel || !showDetail) return;

    let startX = 0;
    let startY = 0;
    let tracking = false;
    let axisLocked: 'x' | 'y' | null = null;
    let deltaX = 0;

    const clearDrag = () => {
      panel.classList.remove('is-admin-split-swipe-dragging');
      panel.style.removeProperty('--admin-split-swipe-x');
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      if (shouldSkipAdminSwipe(event.target)) return;

      tracking = true;
      axisLocked = null;
      deltaX = 0;
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
      clearDrag();
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!tracking || event.touches.length !== 1) return;

      deltaX = event.touches[0].clientX - startX;
      const deltaY = event.touches[0].clientY - startY;
      if (!axisLocked) axisLocked = resolveAdminSwipeAxis(deltaX, deltaY);
      if (axisLocked !== 'x' || deltaX < 0) return;

      const clamped = Math.min(ADMIN_SWIPE_MAX_DRAG_PX, deltaX);
      panel.style.setProperty('--admin-split-swipe-x', `${clamped}px`);
      panel.classList.toggle('is-admin-split-swipe-dragging', clamped > 2);
      event.preventDefault();
    };

    const onTouchEnd = () => {
      if (!tracking) return;
      tracking = false;
      axisLocked = null;

      if (deltaX >= ADMIN_SWIPE_THRESHOLD_PX) {
        onBack();
      }
      clearDrag();
      deltaX = 0;
    };

    panel.addEventListener('touchstart', onTouchStart, { passive: true });
    panel.addEventListener('touchmove', onTouchMove, { passive: false });
    panel.addEventListener('touchend', onTouchEnd, { passive: true });
    panel.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      panel.removeEventListener('touchstart', onTouchStart);
      panel.removeEventListener('touchmove', onTouchMove);
      panel.removeEventListener('touchend', onTouchEnd);
      panel.removeEventListener('touchcancel', onTouchEnd);
      clearDrag();
    };
  }, [onBack, showDetail]);

  return (
    <div className={`admin-split-pane ${showDetail ? 'is-detail-open' : ''}`}>
      <section className="admin-split-pane__list" aria-label={listLabel}>
        {list}
      </section>
      <section
        ref={detailRef}
        className="admin-split-pane__detail"
        aria-label={detailLabel}
        aria-hidden={!showDetail}
      >
        {showDetail ? (
          <button type="button" className="admin-split-back" onClick={onBack}>
            <span aria-hidden>←</span>
            <span>Volver a {listLabel.toLowerCase()}</span>
          </button>
        ) : null}
        {detail}
      </section>
    </div>
  );
}
