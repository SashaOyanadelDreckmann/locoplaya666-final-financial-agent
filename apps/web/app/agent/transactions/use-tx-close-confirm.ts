'use client';

import { useCallback, useEffect, useState } from 'react';

export type TxCloseConfirmKind = 'busy' | 'draft';

export function useTxCloseConfirm(params: {
  isOpen: boolean;
  onClose: () => void;
  onInvalidateSession: () => void;
  hasPendingDraft: boolean;
  isBusy: boolean;
  clearDraft: () => void;
}) {
  const { isOpen, onClose, onInvalidateSession, hasPendingDraft, isBusy, clearDraft } = params;
  const [closeConfirmKind, setCloseConfirmKind] = useState<TxCloseConfirmKind | null>(null);

  useEffect(() => {
    if (!isOpen) setCloseConfirmKind(null);
  }, [isOpen]);

  const dismissCloseConfirm = useCallback(() => {
    setCloseConfirmKind(null);
  }, []);

  const finalizeClose = useCallback(() => {
    onInvalidateSession();
    setCloseConfirmKind(null);
    onClose();
  }, [onClose, onInvalidateSession]);

  const requestClose = useCallback(() => {
    if (closeConfirmKind) {
      dismissCloseConfirm();
      return;
    }
    if (isBusy) {
      setCloseConfirmKind('busy');
      return;
    }
    if (hasPendingDraft) {
      setCloseConfirmKind('draft');
      return;
    }
    finalizeClose();
  }, [closeConfirmKind, dismissCloseConfirm, finalizeClose, hasPendingDraft, isBusy]);

  const confirmClose = useCallback(() => {
    clearDraft();
    finalizeClose();
  }, [clearDraft, finalizeClose]);

  return {
    closeConfirmKind,
    dismissCloseConfirm,
    requestClose,
    confirmClose,
  };
}
