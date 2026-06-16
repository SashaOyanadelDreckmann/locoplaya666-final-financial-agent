/**
 * Mobile keyboard focus — shared dismiss / tap-outside contract (browser + PWA).
 * Keeps typing surfaces clean: blur on send, blur on tap outside, restore viewport.
 */

import {
  applyMobileViewportTokens,
  clearComposerTypingVisual,
  isComposerTypingSnap,
  isMobileInputEngaged,
  isTextInput,
  restoreAgentShellViewport,
  setMobileInputEngaged,
} from '@/lib/interfaz/mobile-viewport-sync';
import { shouldUseMobileShell } from '@/lib/interfaz/viewport-mode';

const SEND_CONTROL_SELECTOR =
  '.composer-send-btn, .bcc-hero-send, .tx-composer-send, button[type="submit"]';

const TYPING_SURFACE_SELECTOR = [
  'input:not([type="hidden"]):not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[contenteditable="true"]',
  '.agent-mobile-composer-dock',
  '.bcc-hero-input-wrap',
  '.tx-composer-pro',
  '.tx-minimal-composer',
].join(', ');

export function isMobileTypingContext(): boolean {
  if (typeof window === 'undefined') return false;
  return shouldUseMobileShell();
}

export function shouldPreserveMobileKeyboard(target: Element | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  if (target.closest(SEND_CONTROL_SELECTOR)) return false;
  return Boolean(target.closest(TYPING_SURFACE_SELECTOR));
}

export function isMobileKeyboardActive(root: HTMLElement = document.documentElement): boolean {
  if (typeof document === 'undefined') return false;
  if (isTextInput(document.activeElement)) return true;
  return (
    isMobileInputEngaged(root) ||
    isComposerTypingSnap(root) ||
    root.classList.contains('browser-keyboard-open')
  );
}

export function dismissMobileKeyboard(root: HTMLElement = document.documentElement): void {
  if (typeof document === 'undefined') return;

  const active = document.activeElement;
  if (active instanceof HTMLElement && isTextInput(active)) {
    active.blur();
  }

  clearComposerTypingVisual(root);
  setMobileInputEngaged(false, root);
  applyMobileViewportTokens(root);

  if (!root.classList.contains('agent-route-active')) return;

  window.requestAnimationFrame(() => {
    restoreAgentShellViewport(root);
  });
}

export function handleMobileKeyboardOutsideTap(
  target: Element | null,
  root: HTMLElement = document.documentElement,
): void {
  if (!isMobileTypingContext()) return;
  if (!isMobileKeyboardActive(root)) return;
  if (shouldPreserveMobileKeyboard(target)) return;
  dismissMobileKeyboard(root);
}
