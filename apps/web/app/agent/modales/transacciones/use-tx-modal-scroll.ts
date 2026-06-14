'use client';

import { useEffect, type RefObject } from 'react';
import { isTextInput } from '@/lib/interfaz/mobile-viewport-sync';

export function useTxModalScrollLock(params: {
  isOpen: boolean;
  scrollBodyRef: RefObject<HTMLDivElement | null>;
  modalRef: RefObject<HTMLDivElement | null>;
}) {
  const { isOpen, scrollBodyRef, modalRef } = params;

  useEffect(() => {
    if (!isOpen) return;

    const scrollBody = scrollBodyRef.current;
    const overlay = modalRef.current?.closest('.transactions-modal-overlay') as HTMLElement | null;
    if (!scrollBody) return;

    let preservedScrollTop = scrollBody.scrollTop;

    const pinOverlayTop = () => {
      if (overlay && overlay.scrollTop !== 0) {
        overlay.scrollTop = 0;
      }
    };

    const captureScroll = () => {
      preservedScrollTop = scrollBody.scrollTop;
    };

    const restoreUnlessTyping = () => {
      window.requestAnimationFrame(() => {
        pinOverlayTop();
        const active = document.activeElement;
        if (isTextInput(active) && scrollBody.contains(active)) return;
        if (Math.abs(scrollBody.scrollTop - preservedScrollTop) > 10) {
          scrollBody.scrollTop = preservedScrollTop;
        }
      });
    };

    pinOverlayTop();
    scrollBody.addEventListener('pointerdown', captureScroll, { capture: true });
    scrollBody.addEventListener('touchstart', captureScroll, { capture: true, passive: true });
    scrollBody.addEventListener('click', restoreUnlessTyping, { capture: true });
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target && isTextInput(target) && scrollBody.contains(target)) return;
      restoreUnlessTyping();
    };
    scrollBody.addEventListener('focusin', onFocusIn, { capture: true });

    const onOverlayScroll = () => pinOverlayTop();
    overlay?.addEventListener('scroll', onOverlayScroll, { passive: true });

    return () => {
      scrollBody.removeEventListener('pointerdown', captureScroll, { capture: true });
      scrollBody.removeEventListener('touchstart', captureScroll, { capture: true });
      scrollBody.removeEventListener('click', restoreUnlessTyping, { capture: true });
      scrollBody.removeEventListener('focusin', onFocusIn, { capture: true });
      overlay?.removeEventListener('scroll', onOverlayScroll);
    };
  }, [isOpen, modalRef, scrollBodyRef]);
}
