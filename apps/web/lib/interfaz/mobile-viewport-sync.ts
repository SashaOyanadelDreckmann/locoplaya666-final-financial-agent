/** Shared visual/layout viewport tokens for mobile browser keyboard handling. */

import {
  MOBILE_SHELL_MEDIA,
  shouldUseMobileShell,
  syncPwaStandaloneClass,
} from '@/lib/interfaz/viewport-mode';

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
  if (isPwaStandaloneViewport(root)) return false;
  return shouldUseMobileShell();
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

  /* Budget modal chat + table cells — same soft threshold while the keyboard animates. */
  if (isBudgetModalFocused()) {
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
  return Boolean(el.closest('.agent-mobile-composer-dock, .transactions-modal .tx-composer-field, .transactions-modal .tx-minimal-composer-input'));
}

export function isAuthIntakeElement(el: Element | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  return Boolean(el.closest('.auth-shell') || el.closest('.intake-shell'));
}

export function isTransactionsModalElement(el: Element | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  return Boolean(el.closest('.transactions-modal'));
}

export function isBudgetModalElement(el: Element | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  return Boolean(el.closest('.budget-modal'));
}

export function isBudgetAssistantComposerElement(el: Element | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  return Boolean(el.closest('.budget-modal .bcc-hero-compose'));
}

export function findTransactionsScrollHost(el: HTMLElement): HTMLElement | null {
  return el.closest('.transactions-modal .tx-scroll-body') as HTMLElement | null;
}

export function findBudgetScrollHost(el: HTMLElement): HTMLElement | null {
  const wrap = el.closest('.budget-modal .budget-table-wrap') as HTMLElement | null;
  if (wrap) return wrap;
  return el.closest('.budget-modal .budget-table-scroll-host') as HTMLElement | null;
}

function isAuthIntakeFocused() {
  const active = document.activeElement;
  return isTextInput(active) && isAuthIntakeElement(active);
}

function isBudgetModalFocused() {
  const active = document.activeElement;
  return isTextInput(active) && isBudgetModalElement(active);
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

const AGENT_SHELL_SCROLL_LOCK_SELECTORS = [
  '.app-shell',
  '.mobile-scale-frame',
  'main.agent-layout',
  'section.agent-chat',
  '.agent-chat-body',
] as const;

export function isAgentModalOpen(root: HTMLElement = document.documentElement) {
  if (typeof document === 'undefined') return false;
  if (!root.classList.contains('agent-route-active')) return false;
  return Boolean(document.querySelector('.agent-modal-overlay, .social-modal-overlay'));
}

export function isAgentKeyboardTransitionActive(root: HTMLElement = document.documentElement) {
  if (isMobileInputEngaged(root) || isComposerTypingSnap(root)) return true;
  if (root.classList.contains('browser-keyboard-open')) return true;
  if (document.body?.classList.contains('browser-keyboard-open')) return true;
  if (root.classList.contains('keyboard-opening')) return true;
  if (document.body?.classList.contains('keyboard-opening')) return true;
  if (isComposerFocused()) return true;
  return resolveKeyboardLikelyOpen(readMobileViewportMetrics());
}

/** Only restore shell scroll when idle — never while the keyboard/composer is animating. */
export function shouldRestoreAgentShellViewport(root: HTMLElement = document.documentElement) {
  if (typeof window === 'undefined') return false;
  if (!root.classList.contains('agent-route-active')) return false;
  if (isAgentModalOpen(root)) return false;
  if (isAgentKeyboardTransitionActive(root)) return false;
  return true;
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
    const modalOpen = isAgentModalOpen(root);
    const measuredFull = modalOpen
      ? Math.max(
          layoutH,
          visibleH + offsetTop,
          typeof window.screen?.availHeight === 'number' ? window.screen.availHeight : 0
        )
      : Math.max(layoutH, visibleH + offsetTop);
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

/** Reset document/visual viewport drift on the agent shell (mobile PWA + browser). */
export function restoreAgentShellViewport(root: HTMLElement = document.documentElement) {
  if (typeof window === 'undefined') return;
  if (!shouldRestoreAgentShellViewport(root)) return;

  window.scrollTo(0, 0);
  root.scrollTop = 0;
  document.body.scrollTop = 0;

  for (const selector of AGENT_SHELL_SCROLL_LOCK_SELECTORS) {
    document.querySelectorAll<HTMLElement>(selector).forEach((node) => {
      if (node.scrollTop !== 0) node.scrollTop = 0;
      if (node.scrollLeft !== 0) node.scrollLeft = 0;
    });
  }

  applyMobileViewportTokens(root);

  window.requestAnimationFrame(() => {
    window.scrollTo(0, 0);
    applyMobileViewportTokens(root);
  });
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

  if (
    el.closest(
      '.agent-mobile-composer-dock, .transactions-modal .tx-composer-pro, .transactions-modal .tx-minimal-composer, .budget-modal .bcc-hero-compose',
    )
  ) {
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
    findBudgetScrollHost(el) ??
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
  setMobileInputEngaged(true, root);
  applyMobileViewportTokens(root);
  scheduleComposerViewportSync();
}

/** Preemptive typing session — snap layout on first touch, before the keyboard animates. */
export function preemptiveMobileTypingEngage(
  target: Element | null,
  root: HTMLElement = document.documentElement,
) {
  if (typeof window === 'undefined' || !target) return;
  if (!shouldUseMobileShell()) return;

  const el = target instanceof HTMLElement ? target : null;
  const composerDock = target.closest('.agent-mobile-composer-dock');

  if (composerDock) {
    if (isMobileBrowserViewport(root)) {
      engageComposerTypingLayout(root);
      return;
    }
    if (isPwaStandaloneViewport(root)) {
      setMobileInputEngaged(true, root);
      applyMobileViewportTokens(root);
    }
    return;
  }

  if (!el || !isTextInput(el)) return;

  if (isComposerDockElement(el)) {
    if (isMobileBrowserViewport(root)) engageComposerTypingLayout(root);
    return;
  }

  if (isTransactionsModalElement(el) || isBudgetModalElement(el) || isAuthIntakeElement(el)) {
    setMobileInputEngaged(true, root);
    applyMobileViewportTokens(root);
    scheduleInputViewportSync(el);
  }
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

  if (isComposerDockElement(el)) {
    if (isMobileBrowserViewport()) {
      engageComposerTypingLayout();
    } else if (shouldUseMobileShell() && isPwaStandaloneViewport()) {
      setMobileInputEngaged(true);
      applyMobileViewportTokens();
    }
    el.focus({ preventScroll: true });
    if (isMobileBrowserViewport()) scheduleComposerViewportSync();
    return;
  }

  if (!shouldUseMobileShell()) {
    el.focus();
    return;
  }

  if (isTransactionsModalElement(el) || isBudgetModalElement(el)) {
    setMobileInputEngaged(true);
    applyMobileViewportTokens();
    el.focus({ preventScroll: true });
    scheduleInputViewportSync(el);
    return;
  }

  el.focus({ preventScroll: true });
}
