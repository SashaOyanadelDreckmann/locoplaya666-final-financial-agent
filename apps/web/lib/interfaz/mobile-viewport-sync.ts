/** Shared visual/layout viewport tokens for mobile browser keyboard handling. */

import { MOBILE_SHELL_MEDIA, syncPwaStandaloneClass } from '@/lib/interfaz/viewport-mode';

const PWA_BROWSER_CLASS_BLOCKLIST = [
  'browser-keyboard-open',
  'composer-typing-snap',
  'keyboard-opening',
  'browser-chrome-vignette-suspended',
  'browser-chrome-vignette-tablet-off',
] as const;

export const MOBILE_KEYBOARD_HEIGHT_RATIO = 0.78;
export const MAX_CHROME_BOTTOM = 72;
export const MAX_CHROME_TOP = 88;

const INPUT_VIEWPORT_SYNC_DELAYS_MS = [0, 16, 64, 160, 280, 400, 520] as const;
const COMPOSER_VV_SYNC_DELAYS_MS = [0, 8, 16, 24, 32, 48, 64, 96, 128, 160, 200, 280, 400, 520] as const;

export function isTextInput(el: Element | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

export function isPwaStandaloneViewport(root: HTMLElement = document.documentElement) {
  if (typeof window === 'undefined') return false;
  return syncPwaStandaloneClass(root);
}

export function isMobileBrowserViewport(root: HTMLElement = document.documentElement) {
  if (typeof window === 'undefined') return false;
  return !isPwaStandaloneViewport(root) && window.matchMedia(MOBILE_SHELL_MEDIA).matches;
}

export function suppressPwaBrowserChrome(root: HTMLElement = document.documentElement) {
  if (!isPwaStandaloneViewport(root)) return;

  for (const className of PWA_BROWSER_CLASS_BLOCKLIST) {
    root.classList.remove(className);
    document.body?.classList.remove(className);
  }

  document
    .querySelectorAll<HTMLElement>('.browser-chrome-vignette-top, .browser-chrome-vignette-bottom')
    .forEach((node) => {
      node.style.display = 'none';
      node.style.visibility = 'hidden';
      node.style.opacity = '0';
      node.style.height = '0';
      node.style.maxHeight = '0';
      node.style.pointerEvents = 'none';
    });
}

export function isMobileInputEngaged(root: HTMLElement = document.documentElement) {
  return root.classList.contains('mobile-input-engaged');
}

export function isComposerTypingSnap(root: HTMLElement = document.documentElement) {
  return (
    root.classList.contains('composer-typing-snap') ||
    Boolean(document.body?.classList.contains('composer-typing-snap'))
  );
}

function isComposerFocused() {
  const active = document.activeElement;
  return isTextInput(active) && isComposerDockElement(active);
}

function resolveKeyboardLikelyOpen(
  metrics: ReturnType<typeof readMobileViewportMetrics>
) {
  const { layoutH, visibleH, gap, focusedInput } = metrics;
  if (!focusedInput) return false;

  if (gap > MAX_CHROME_BOTTOM || visibleH < layoutH * MOBILE_KEYBOARD_HEIGHT_RATIO) {
    return true;
  }

  /* Composer: softer threshold while the keyboard is animating up. */
  if (isComposerFocused()) {
    return gap > 20 || visibleH < layoutH * 0.94;
  }

  /* Auth / intake — match PWA feel; keyboard animates over several frames. */
  if (isAuthIntakeFocused()) {
    return gap > 20 || visibleH < layoutH * 0.94;
  }

  return false;
}

export function setMobileInputEngaged(
  engaged: boolean,
  root: HTMLElement = document.documentElement
) {
  root.classList.toggle('mobile-input-engaged', engaged);
  document.body?.classList.toggle('mobile-input-engaged', engaged);
  if (!engaged && !isComposerFocused()) {
    root.classList.remove('composer-typing-snap');
    document.body?.classList.remove('composer-typing-snap');
  }
  applyMobileViewportTokens(root);
}

export function isComposerDockElement(el: Element | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  return Boolean(el.closest('.agent-mobile-composer-dock'));
}

export function isAuthIntakeElement(el: Element | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  return Boolean(el.closest('.auth-shell') || el.closest('.intake-shell'));
}

export function isTransactionsModalElement(el: Element | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  return Boolean(el.closest('.transactions-modal'));
}

export function findTransactionsScrollHost(el: HTMLElement): HTMLElement | null {
  return el.closest('.transactions-modal .tx-scroll-body') as HTMLElement | null;
}

function isAuthIntakeFocused() {
  const active = document.activeElement;
  return isTextInput(active) && isAuthIntakeElement(active);
}

export function isAuthIntakeRoute(root: HTMLElement = document.documentElement) {
  return (
    root.classList.contains('auth-route-active') ||
    root.classList.contains('intake-route-active') ||
    Boolean(document.body?.classList.contains('auth-route-active')) ||
    Boolean(document.body?.classList.contains('intake-route-active'))
  );
}

/** Mobile shell auth/intake — browser or PWA add-to-home. */
export function isMobileFormRouteViewport(root: HTMLElement = document.documentElement) {
  if (typeof window === 'undefined') return false;
  if (!window.matchMedia(MOBILE_SHELL_MEDIA).matches) return false;
  if (!isAuthIntakeRoute(root)) return false;
  return isMobileBrowserViewport(root) || isPwaStandaloneViewport(root);
}

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
  const metrics = readMobileViewportMetrics();
  const { layoutH, visibleH, offsetTop, gap } = metrics;
  const keyboardLikelyOpen = resolveKeyboardLikelyOpen(metrics);
  const inputEngaged = isMobileInputEngaged(root);
  const keyboardInset = Math.max(0, layoutH - visibleH - offsetTop);

  root.style.setProperty('--screen-h', `${layoutH}px`);
  root.style.setProperty('--fa-app-height', `${layoutH}px`);

  if (isPwaStandaloneViewport(root)) {
    suppressPwaBrowserChrome(root);
    const measuredFull = Math.max(
      layoutH,
      visibleH + offsetTop,
      typeof window.screen?.availHeight === 'number' ? window.screen.availHeight : 0
    );
    root.style.setProperty('--pwa-measured-h', `${measuredFull}px`);
    root.style.setProperty('--visual-vh', 'var(--pwa-full-viewport-h, 100lvh)');
    root.style.setProperty('--screen-h', 'var(--pwa-full-viewport-h, 100lvh)');
    root.style.setProperty('--keyboard-inset-bottom', '0px');
    root.style.setProperty('--browser-vv-offset-top', '0px');
    root.style.setProperty('--browser-vv-offset-bottom', '0px');
    root.style.setProperty('--browser-keyboard-offset-top', '0px');
    root.style.setProperty('--fa-app-height', 'var(--pwa-full-viewport-h, 100lvh)');
    return { keyboardLikelyOpen: false, inputEngaged };
  }

  root.style.setProperty('--visual-vh', `${visibleH}px`);
  root.style.setProperty('--keyboard-inset-bottom', `${keyboardInset}px`);

  if (!isMobileBrowserViewport(root)) {
    root.classList.remove('browser-keyboard-open');
    root.style.setProperty('--browser-vv-offset-top', '0px');
    root.style.setProperty('--browser-vv-offset-bottom', '0px');
    root.style.setProperty('--browser-keyboard-offset-top', '0px');
    return { keyboardLikelyOpen: false, inputEngaged };
  }

  /* Auth/intake: keep photo + shell stable; inner scroll only (PWA parity). */
  if (!isAuthIntakeRoute(root)) {
    root.classList.toggle('browser-keyboard-open', keyboardLikelyOpen);
  } else {
    root.classList.remove('browser-keyboard-open');
  }
  root.style.setProperty('--browser-keyboard-offset-top', `${offsetTop}px`);

  if (keyboardLikelyOpen) {
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
  root.classList.remove('composer-typing-snap');
  document.body?.classList.remove('mobile-input-engaged');
  document.body?.classList.remove('composer-typing-snap');
  root.style.removeProperty('--screen-h');
  root.style.removeProperty('--visual-vh');
  root.style.removeProperty('--browser-vv-offset-top');
  root.style.removeProperty('--browser-vv-offset-bottom');
  root.style.removeProperty('--browser-keyboard-offset-top');
  root.style.removeProperty('--keyboard-inset-bottom');
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
  if (typeof window === 'undefined') return;
  const allowPwaFormScroll =
    isPwaStandaloneViewport() && isAuthIntakeElement(el);
  if (!isMobileBrowserViewport() && !allowPwaFormScroll) return;

  applyMobileViewportTokens();

  if (el.closest('.agent-mobile-composer-dock')) {
    return;
  }

  const metrics = readMobileViewportMetrics();
  const keyboardLikelyOpen = resolveKeyboardLikelyOpen(metrics);
  if (!keyboardLikelyOpen) return;

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
    findTransactionsScrollHost(el) ??
    findScrollableParent(el) ??
    (el.closest('.auth-shell') as HTMLElement | null) ??
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

export function scheduleComposerViewportSync() {
  const run = () => {
    if (!isComposerTypingSnap() && !isComposerFocused()) return;
    applyMobileViewportTokens();
    if (isComposerFocused()) {
      setMobileInputEngaged(true);
    }
  };

  run();
  window.requestAnimationFrame(run);
  for (const delay of COMPOSER_VV_SYNC_DELAYS_MS) {
    window.setTimeout(run, delay);
  }
}

export function prepareComposerTypingVisual(root: HTMLElement = document.documentElement) {
  if (!isMobileBrowserViewport()) return;
  root.classList.add('composer-typing-snap');
  document.body?.classList.add('composer-typing-snap');
}

export function engageComposerTypingLayout(root: HTMLElement = document.documentElement) {
  if (!isMobileBrowserViewport()) return;
  prepareComposerTypingVisual(root);
  applyMobileViewportTokens(root);
  scheduleComposerViewportSync();
}

export function clearComposerTypingVisual(root: HTMLElement = document.documentElement) {
  root.classList.remove('composer-typing-snap');
  document.body?.classList.remove('composer-typing-snap');
}

export function snapAgentComposerTypingLayout() {
  engageComposerTypingLayout();
}

export function focusMobileInput(el: HTMLElement | null) {
  if (!el || typeof el.focus !== 'function') return;

  if (!isMobileBrowserViewport()) {
    el.focus();
    return;
  }

  if (isComposerDockElement(el)) {
    el.focus({ preventScroll: true });
    if (document.activeElement === el) {
      engageComposerTypingLayout();
    }
    return;
  }

  el.focus({ preventScroll: true });

  if (isTransactionsModalElement(el)) {
    setMobileInputEngaged(true);
    applyMobileViewportTokens();
    scheduleInputViewportSync(el);
  }
}
