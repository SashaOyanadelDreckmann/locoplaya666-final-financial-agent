'use client';

import { useCallback, useEffect, useRef } from 'react';

export function useTxActionSession(isOpen: boolean, selectedProductId: string | null) {
  const txSendLockRef = useRef(false);
  const txSessionIdRef = useRef(0);
  const txActionControllersRef = useRef<Set<AbortController>>(new Set());
  const previousActiveProductIdRef = useRef<string | null>(null);

  const invalidateTxSession = useCallback(() => {
    txSessionIdRef.current += 1;
    for (const controller of txActionControllersRef.current) {
      controller.abort();
    }
    txActionControllersRef.current.clear();
    txSendLockRef.current = false;
  }, []);

  const beginTxAction = useCallback(() => {
    const controller = new AbortController();
    txActionControllersRef.current.add(controller);
    return {
      sessionId: txSessionIdRef.current,
      controller,
      finish: () => txActionControllersRef.current.delete(controller),
    };
  }, []);

  const isTxActionStale = useCallback(
    (sessionId: number, productId: string) =>
      sessionId !== txSessionIdRef.current || !isOpen || selectedProductId !== productId,
    [isOpen, selectedProductId],
  );

  useEffect(() => {
    if (!isOpen) return;
    const nextProductId = selectedProductId;
    if (!nextProductId) return;
    if (previousActiveProductIdRef.current && previousActiveProductIdRef.current !== nextProductId) {
      invalidateTxSession();
    }
    previousActiveProductIdRef.current = nextProductId;
  }, [invalidateTxSession, isOpen, selectedProductId]);

  useEffect(() => () => invalidateTxSession(), [invalidateTxSession]);

  return {
    txSendLockRef,
    invalidateTxSession,
    beginTxAction,
    isTxActionStale,
  };
}
