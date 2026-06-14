'use client';

import { useEffect, useRef, type RefObject } from 'react';
import type { TxCloseConfirmKind } from './use-tx-close-confirm';

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export function useTxModalA11y(params: {
  isOpen: boolean;
  modalRef: RefObject<HTMLDivElement | null>;
  closeConfirmKind: TxCloseConfirmKind | null;
  dismissCloseConfirm: () => void;
  requestClose: () => void;
}) {
  const { isOpen, modalRef, closeConfirmKind, dismissCloseConfirm, requestClose } = params;
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const getFocusableElements = () => {
      const root = modalRef.current;
      if (!root) return [] as HTMLElement[];
      return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (node) => !node.hasAttribute('aria-hidden'),
      );
    };

    const rafId = window.requestAnimationFrame(() => {
      const focusables = getFocusableElements();
      const initialFocus = focusables[0] ?? modalRef.current;
      initialFocus?.focus({ preventScroll: true });
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        if (closeConfirmKind) {
          dismissCloseConfirm();
          return;
        }
        requestClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusables = getFocusableElements();
      if (focusables.length === 0) {
        event.preventDefault();
        modalRef.current?.focus({ preventScroll: true });
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const inside = Boolean(active && modalRef.current?.contains(active));

      if (!inside) {
        event.preventDefault();
        first.focus({ preventScroll: true });
        return;
      }
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
        return;
      }
      if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('keydown', onKeyDown);
      const elementToRestore = restoreFocusRef.current;
      if (elementToRestore && document.contains(elementToRestore)) {
        window.requestAnimationFrame(() => elementToRestore.focus());
      }
    };
  }, [closeConfirmKind, dismissCloseConfirm, isOpen, modalRef, requestClose]);
}
