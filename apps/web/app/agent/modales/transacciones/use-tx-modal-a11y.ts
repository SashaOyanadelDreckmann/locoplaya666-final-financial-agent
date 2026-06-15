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

function getFocusableElements(root: HTMLElement | null) {
  if (!root) return [] as HTMLElement[];
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (node) => !node.hasAttribute('aria-hidden'),
  );
}

export function useTxModalA11y(params: {
  isOpen: boolean;
  modalRef: RefObject<HTMLDivElement | null>;
  closeConfirmKind: TxCloseConfirmKind | null;
  dismissCloseConfirm: () => void;
  requestClose: () => void;
}) {
  const { isOpen, modalRef, closeConfirmKind, dismissCloseConfirm, requestClose } = params;
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const initialFocusDoneRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      const elementToRestore = restoreFocusRef.current;
      if (elementToRestore && document.contains(elementToRestore)) {
        window.requestAnimationFrame(() => elementToRestore.focus());
      }
      initialFocusDoneRef.current = false;
      return;
    }

    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const rafId = window.requestAnimationFrame(() => {
      if (initialFocusDoneRef.current) return;
      initialFocusDoneRef.current = true;
      const focusables = getFocusableElements(modalRef.current);
      const initialFocus = focusables[0] ?? modalRef.current;
      initialFocus?.focus({ preventScroll: true });
    });

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [isOpen, modalRef]);

  useEffect(() => {
    if (!isOpen) return;

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
      const focusables = getFocusableElements(modalRef.current);
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
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeConfirmKind, dismissCloseConfirm, isOpen, modalRef, requestClose]);
}
