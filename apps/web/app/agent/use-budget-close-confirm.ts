'use client';

import { useCallback, useEffect, useState } from 'react';

export type BudgetCloseConfirmKind = 'busy' | 'pending';

export function useBudgetCloseConfirm(params: {
  isOpen: boolean;
  onClose: () => void;
  isBusy: boolean;
  hasPendingConfirmation: boolean;
  clearPendingConfirmation: () => void;
}) {
  const { isOpen, onClose, isBusy, hasPendingConfirmation, clearPendingConfirmation } = params;
  const [closeConfirmKind, setCloseConfirmKind] = useState<BudgetCloseConfirmKind | null>(null);

  useEffect(() => {
    if (!isOpen) setCloseConfirmKind(null);
  }, [isOpen]);

  const dismissCloseConfirm = useCallback(() => {
    setCloseConfirmKind(null);
  }, []);

  const forceClose = useCallback(() => {
    setCloseConfirmKind(null);
    onClose();
  }, [onClose]);

  const confirmClose = useCallback(() => {
    clearPendingConfirmation();
    forceClose();
  }, [clearPendingConfirmation, forceClose]);

  const requestClose = useCallback(() => {
    if (closeConfirmKind) {
      dismissCloseConfirm();
      return;
    }
    if (isBusy) {
      setCloseConfirmKind('busy');
      return;
    }
    if (hasPendingConfirmation) {
      setCloseConfirmKind('pending');
      return;
    }
    forceClose();
  }, [closeConfirmKind, dismissCloseConfirm, forceClose, hasPendingConfirmation, isBusy]);

  return {
    closeConfirmKind,
    dismissCloseConfirm,
    requestClose,
    confirmClose,
    forceClose,
  };
}
