'use client';

import { useEffect } from 'react';

import {
  applyMobileViewportTokens,
  engageComposerTypingLayout,
  isAuthIntakeElement,
  isBudgetModalElement,
  isComposerDockElement,
  isMobileBrowserViewport,
  isMobileFormRouteViewport,
  isPwaStandaloneViewport,
  isTransactionsModalElement,
  isTextInput,
  clearComposerTypingVisual,
  pinComposerDocumentScroll,
  restoreAgentShellViewport,
  scheduleComposerViewportSync,
  syncAgentComposerBrowserKeyboardState,
  preemptiveMobileTypingEngage,
  scheduleInputViewportSync,
  setMobileInputEngaged,
} from '@/lib/interfaz/mobile-viewport-sync';
import {
  handleMobileKeyboardOutsideTap,
  isMobileTypingContext,
} from '@/lib/interfaz/mobile-keyboard-focus';

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

    const engageTransactionsInput = (el: HTMLElement) => {
      setMobileInputEngaged(true);
      applyMobileViewportTokens();
      scheduleInputViewportSync(el);
    };

    const engageBudgetInput = (el: HTMLElement) => {
      setMobileInputEngaged(true);
      applyMobileViewportTokens();
      scheduleInputViewportSync(el);
    };

    const isMobileKeyboardSurface = () =>
      isMobileBrowserViewport() || (isMobileTypingContext() && isPwaStandaloneViewport());

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
      const target = event.target as Element | null;

      handleMobileKeyboardOutsideTap(target);

      if (target?.closest('.agent-mobile-composer-dock')) {
        preemptiveMobileTypingEngage(target);
        if (isTextInput(target)) {
          activeInput = target as HTMLElement;
        }
        return;
      }

      if (!isTextInput(target)) return;

      const el = target as HTMLElement;
      preemptiveMobileTypingEngage(el);

      if (isTransactionsModalElement(target)) {
        if (!isMobileKeyboardSurface()) return;
        activeInput = el;
        engageTransactionsInput(el);
        if (document.activeElement !== el) {
          el.focus({ preventScroll: true });
        }
        return;
      }

      if (isBudgetModalElement(target)) {
        if (!isMobileKeyboardSurface()) return;
        activeInput = el;
        engageBudgetInput(el);
        if (document.activeElement !== el) {
          el.focus({ preventScroll: true });
        }
        return;
      }

      if (!isAuthIntakeElement(target)) return;
      if (!isMobileFormRouteViewport()) return;

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
        if (isMobileBrowserViewport() || isPwaStandaloneViewport()) {
          if (isMobileBrowserViewport()) {
            pinComposerDocumentScroll();
            engageComposerTypingLayout();
          } else {
            setMobileInputEngaged(true);
            applyMobileViewportTokens();
          }
        }
        return;
      }

      if (isTransactionsModalElement(target)) {
        if (!isMobileKeyboardSurface()) return;
        engageTransactionsInput(activeInput);
        return;
      }

      if (isBudgetModalElement(target)) {
        if (!isMobileKeyboardSurface()) return;
        engageBudgetInput(activeInput);
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
        if (document.documentElement.classList.contains('agent-route-active')) {
          restoreAgentShellViewport();
        }
      }, blurDelay);
    };

    const vv = window.visualViewport;
    const onViewportChange = () => {
      applyMobileViewportTokens();

      if (activeInput && isComposerDockElement(activeInput) && isMobileBrowserViewport()) {
        pinComposerDocumentScroll();
        syncAgentComposerBrowserKeyboardState();
      }

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
