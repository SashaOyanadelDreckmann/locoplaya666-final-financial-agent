'use client';

import { useEffect } from 'react';

import {
  applyMobileViewportTokens,
  engageComposerTypingLayout,
  isAuthIntakeElement,
  isComposerDockElement,
  isMobileBrowserViewport,
  isMobileFormRouteViewport,
  isTextInput,
  clearComposerTypingVisual,
  scheduleComposerViewportSync,
  scheduleInputViewportSync,
  setMobileInputEngaged,
} from '@/lib/mobile-viewport-sync';

const COMPOSER_BLUR_SETTLE_MS = 320;

export default function MobileInputViewportSync() {
  useEffect(() => {
    let blurTimer: ReturnType<typeof setTimeout> | null = null;
    let activeInput: HTMLElement | null = null;

    const engageAuthIntakeInput = (el: HTMLElement) => {
      setMobileInputEngaged(true);
      applyMobileViewportTokens();
      scheduleInputViewportSync(el);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
      const target = event.target as Element | null;
      if (!isTextInput(target)) return;
      if (isComposerDockElement(target)) return;
      if (!isAuthIntakeElement(target)) return;
      if (!isMobileFormRouteViewport()) return;

      const el = target as HTMLElement;
      activeInput = el;
      engageAuthIntakeInput(el);

      if (document.activeElement !== el) {
        el.focus({ preventScroll: true });
      }
    };

    const onFocusIn = (event: FocusEvent) => {
      if (blurTimer) {
        clearTimeout(blurTimer);
        blurTimer = null;
      }

      const target = event.target as Element | null;
      if (!isTextInput(target)) return;

      activeInput = target as HTMLElement;
      if (isComposerDockElement(target)) {
        if (!isMobileBrowserViewport()) return;
        engageComposerTypingLayout();
        return;
      }

      if (!isMobileFormRouteViewport()) return;

      engageAuthIntakeInput(activeInput);
    };

    const onFocusOut = (event: FocusEvent) => {
      const from = event.target as Element | null;
      const to = event.relatedTarget as Element | null;
      if (isComposerDockElement(to)) return;

      const leavingComposer = isComposerDockElement(from);
      const blurDelay = leavingComposer ? COMPOSER_BLUR_SETTLE_MS : 120;

      blurTimer = setTimeout(() => {
        if (isTextInput(document.activeElement)) return;
        if (isComposerDockElement(document.activeElement)) return;
        activeInput = null;
        clearComposerTypingVisual();
        setMobileInputEngaged(false);
        applyMobileViewportTokens();
      }, blurDelay);
    };

    const vv = window.visualViewport;
    const onViewportChange = () => {
      applyMobileViewportTokens();

      if (!activeInput || document.activeElement !== activeInput) return;

      if (isComposerDockElement(activeInput)) {
        scheduleComposerViewportSync();
        return;
      }

      scheduleInputViewportSync(activeInput);
    };

    document.addEventListener('pointerdown', onPointerDown, { capture: true });
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    vv?.addEventListener('resize', onViewportChange);
    vv?.addEventListener('scroll', onViewportChange);

    return () => {
      if (blurTimer) clearTimeout(blurTimer);
      activeInput = null;
      document.removeEventListener('pointerdown', onPointerDown, { capture: true });
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      vv?.removeEventListener('resize', onViewportChange);
      vv?.removeEventListener('scroll', onViewportChange);
    };
  }, []);

  return null;
}
