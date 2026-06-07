'use client';

import { useEffect } from 'react';

import {
  applyMobileViewportTokens,
  isMobileBrowserViewport,
  isTextInput,
  scheduleInputViewportSync,
  setMobileInputEngaged,
} from '@/lib/mobile-viewport-sync';

export default function MobileInputViewportSync() {
  useEffect(() => {
    let blurTimer: ReturnType<typeof setTimeout> | null = null;
    let activeInput: HTMLElement | null = null;

    const onPointerDown = (event: PointerEvent) => {
      if (!isMobileBrowserViewport()) return;
      if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;

      const target = event.target as Element | null;
      if (!isTextInput(target)) return;

      activeInput = target as HTMLElement;
      setMobileInputEngaged(true);
    };

    const onFocusIn = (event: FocusEvent) => {
      if (blurTimer) {
        clearTimeout(blurTimer);
        blurTimer = null;
      }

      const target = event.target as Element | null;
      if (!isTextInput(target)) return;
      if (!isMobileBrowserViewport()) return;

      activeInput = target as HTMLElement;
      setMobileInputEngaged(true);
      scheduleInputViewportSync(activeInput);
    };

    const onFocusOut = () => {
      blurTimer = setTimeout(() => {
        if (isTextInput(document.activeElement)) return;
        activeInput = null;
        setMobileInputEngaged(false);
        applyMobileViewportTokens();
      }, 120);
    };

    const vv = window.visualViewport;
    const onViewportChange = () => {
      if (activeInput && document.activeElement === activeInput) {
        applyMobileViewportTokens();
        scheduleInputViewportSync(activeInput);
        return;
      }
      applyMobileViewportTokens();
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    vv?.addEventListener('resize', onViewportChange);
    vv?.addEventListener('scroll', onViewportChange);

    return () => {
      if (blurTimer) clearTimeout(blurTimer);
      activeInput = null;
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      vv?.removeEventListener('resize', onViewportChange);
      vv?.removeEventListener('scroll', onViewportChange);
    };
  }, []);

  return null;
}
