'use client';

import { useEffect, type MutableRefObject } from 'react';

type Params = {
  isOpen: boolean;
  modalRef: MutableRefObject<HTMLDivElement | null>;
  closeButtonRef: MutableRefObject<HTMLButtonElement | null>;
  restoreFocusRef: MutableRefObject<HTMLElement | null>;
  canDismissOverlay: boolean;
  onDismiss: () => void;
  isGeneratingDiagnosis: boolean;
  isFinalizingCall: boolean;
  voiceConnecting: boolean;
  voiceConnected: boolean;
  voicePaused: boolean;
};

export function useInterviewModalA11y(params: Params) {
  const {
    isOpen,
    modalRef,
    closeButtonRef,
    restoreFocusRef,
    canDismissOverlay,
    onDismiss,
    isGeneratingDiagnosis,
    isFinalizingCall,
    voiceConnecting,
    voiceConnected,
    voicePaused,
  } = params;

  useEffect(() => {
    if (!isOpen) return;

    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTimer = window.setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 0);

    const getFocusableElements = () => {
      if (!modalRef.current) return [] as HTMLElement[];
      return Array.from<HTMLElement>(
        modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true');
    };

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (isGeneratingDiagnosis || isFinalizingCall || voiceConnecting) return;
        event.preventDefault();
        if (canDismissOverlay) onDismiss();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable: HTMLElement[] = getFocusableElements();
      if (focusable.length === 0) {
        event.preventDefault();
        modalRef.current?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const insideModal = activeElement ? modalRef.current?.contains(activeElement) : false;

      if (!insideModal) {
        event.preventDefault();
        first.focus();
        return;
      }

      if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
        return;
      }

      if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (restoreFocusRef.current && document.contains(restoreFocusRef.current)) {
        restoreFocusRef.current.focus();
      }
    };
  }, [
    canDismissOverlay,
    closeButtonRef,
    isFinalizingCall,
    isGeneratingDiagnosis,
    isOpen,
    modalRef,
    onDismiss,
    restoreFocusRef,
    voiceConnected,
    voiceConnecting,
    voicePaused,
  ]);
}
