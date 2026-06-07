/** Shared visual/layout viewport tokens for mobile browser keyboard handling. */

import { MOBILE_SHELL_MEDIA } from '@/lib/viewport-mode';

export const MOBILE_KEYBOARD_HEIGHT_RATIO = 0.78;
export const MAX_CHROME_BOTTOM = 72;
export const MAX_CHROME_TOP = 88;

/** Typical visible viewport ratio once the mobile browser keyboard is up (portrait). */
export const MOBILE_INPUT_KEYBOARD_VISIBLE_RATIO = 0.5;

const INPUT_VIEWPORT_SYNC_DELAYS_MS = [0, 16, 64, 160, 280] as const;

export function isTextInput(el: Element | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

export function isMobileBrowserViewport(root: HTMLElement = document.documentElement) {
  if (typeof window === 'undefined') return false;
  return (
    !root.classList.contains('pwa-standalone') &&
    window.matchMedia(MOBILE_SHELL_MEDIA).matches
  );
}

export function isMobileInputEngaged(root: HTMLElement = document.documentElement) {
  return root.classList.contains('mobile-input-engaged');
}

/** @deprecated Use setMobileInputEngaged */
export const isAgentComposerEngaged = isMobileInputEngaged;

export function setMobileInputEngaged(
  engaged: boolean,
  root: HTMLElement = document.documentElement
) {
  root.classList.toggle('mobile-input-engaged', engaged);
  document.body?.classList.toggle('mobile-input-engaged', engaged);
  applyMobileViewportTokens(root);
}

/** @deprecated Use setMobileInputEngaged */
export const setAgentComposerEngaged = setMobileInputEngaged;

export function readMobileViewportMetrics() {
  const vv = window.visualViewport;
  const layoutH = window.innerHeight;
  const visibleH = vv?.height ?? layoutH;
  const offsetTop = vv?.offsetTop ?? 0;
  const gap = Math.max(0, layoutH - visibleH - offsetTop);
  const focusedInput = isTextInput(document.activeElement);
  const keyboardLikelyOpen =
    focusedInput &&
    (gap > MAX_CHROME_BOTTOM || visibleH < layoutH * MOBILE_KEYBOARD_HEIGHT_RATIO);

  return {
    layoutH,
    visibleH,
    offsetTop,
    gap,
    focusedInput,
    keyboardLikelyOpen,
  };
}

export function applyMobileViewportTokens(root: HTMLElement = document.documentElement) {
  const { layoutH, visibleH, offsetTop, gap, keyboardLikelyOpen } = readMobileViewportMetrics();
  const inputEngaged = isMobileInputEngaged(root);
  const keyboardLayoutActive = keyboardLikelyOpen || inputEngaged;

  root.style.setProperty('--screen-h', `${layoutH}px`);
  root.style.setProperty('--fa-app-height', `${layoutH}px`);

  if (inputEngaged && !keyboardLikelyOpen) {
    root.style.setProperty(
      '--visual-vh',
      `${Math.round(layoutH * MOBILE_INPUT_KEYBOARD_VISIBLE_RATIO)}px`
    );
  } else {
    root.style.setProperty('--visual-vh', `${visibleH}px`);
  }

  if (!isMobileBrowserViewport(root)) {
    root.classList.remove('browser-keyboard-open');
    root.style.setProperty('--browser-vv-offset-top', '0px');
    root.style.setProperty('--browser-vv-offset-bottom', '0px');
    root.style.setProperty('--browser-keyboard-offset-top', '0px');
    return { keyboardLikelyOpen: false, inputEngaged };
  }

  root.classList.toggle('browser-keyboard-open', keyboardLayoutActive);
  root.style.setProperty('--browser-keyboard-offset-top', `${offsetTop}px`);

  if (keyboardLayoutActive) {
    root.style.setProperty('--browser-vv-offset-top', '0px');
    root.style.setProperty('--browser-vv-offset-bottom', '0px');
    return { keyboardLikelyOpen, inputEngaged };
  }

  const topInset = Math.min(Math.max(0, offsetTop), MAX_CHROME_TOP);
  const bottomInset = Math.min(gap, MAX_CHROME_BOTTOM);
  root.style.setProperty('--browser-vv-offset-top', `${topInset}px`);
  root.style.setProperty('--browser-vv-offset-bottom', `${bottomInset}px`);

  return { keyboardLikelyOpen: false, inputEngaged };
}

export function clearMobileViewportTokens(root: HTMLElement = document.documentElement) {
  root.classList.remove('browser-keyboard-open');
  root.classList.remove('mobile-input-engaged');
  document.body?.classList.remove('mobile-input-engaged');
  root.style.removeProperty('--screen-h');
  root.style.removeProperty('--visual-vh');
  root.style.removeProperty('--browser-vv-offset-top');
  root.style.removeProperty('--browser-vv-offset-bottom');
  root.style.removeProperty('--browser-keyboard-offset-top');
}

export function findScrollableParent(el: HTMLElement): HTMLElement | null {
  let parent = el.parentElement;
  while (parent && parent !== document.documentElement) {
    const style = window.getComputedStyle(parent);
    const overflowY = style.overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') {
      if (parent.scrollHeight > parent.clientHeight + 1) return parent;
    }
    parent = parent.parentElement;
  }
  return null;
}

function scrollContainerBy(container: HTMLElement, deltaY: number) {
  if (Math.abs(deltaY) < 1) return;
  container.scrollTop += deltaY;
}

/** Place the focused field just above the visible keyboard band — no browser scroll jump. */
export function scrollInputAboveKeyboard(el: HTMLElement, padding = 14) {
  if (typeof window === 'undefined' || !isMobileBrowserViewport()) return;

  applyMobileViewportTokens();

  if (el.closest('.agent-mobile-composer-dock')) {
    return;
  }

  const vv = window.visualViewport;
  if (!vv) return;

  const rect = el.getBoundingClientRect();
  const visibleTop = vv.offsetTop + padding;
  const visibleBottom = vv.offsetTop + vv.height - padding;

  let deltaY = 0;
  if (rect.bottom > visibleBottom) {
    deltaY += rect.bottom - visibleBottom;
  }
  if (rect.top < visibleTop) {
    deltaY += rect.top - visibleTop;
  }

  if (Math.abs(deltaY) < 1) return;

  const scrollParent =
    findScrollableParent(el) ??
    (el.closest('.auth-shell') as HTMLElement | null) ??
    (el.closest('.agent-modal-overlay') as HTMLElement | null) ??
    (el.closest('.intake-main') as HTMLElement | null);

  if (scrollParent) {
    scrollContainerBy(scrollParent, deltaY);
    return;
  }

  window.scrollBy(0, deltaY);
}

export function scheduleInputViewportSync(el: HTMLElement) {
  const run = () => {
    if (document.activeElement !== el && !el.contains(document.activeElement)) return;
    scrollInputAboveKeyboard(el);
  };

  run();
  window.requestAnimationFrame(run);
  for (const delay of INPUT_VIEWPORT_SYNC_DELAYS_MS) {
    window.setTimeout(run, delay);
  }
}

export function focusMobileInput(el: HTMLElement | null) {
  if (!el || typeof el.focus !== 'function') return;

  if (!isMobileBrowserViewport()) {
    el.focus();
    return;
  }

  setMobileInputEngaged(true);
  el.focus({ preventScroll: true });
  scheduleInputViewportSync(el);
}

export function prepareMobileInputEngagement(el: HTMLElement | null) {
  if (!el || !isMobileBrowserViewport()) return;
  setMobileInputEngaged(true);
}
