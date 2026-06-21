'use client';

import { useCallback } from 'react';
import {
  FINCOIN_SPEND_BLOCKED_MESSAGE,
  FINCOIN_SPEND_BLOCKED_MODAL_MESSAGE,
  isFincoinSpendBlocked,
} from '@/lib/compartido/fincoin-gate';

export function useFincoinSpendGate(params: {
  depleted: boolean;
  onOpenUsage: () => void;
  onNotify?: (message: string) => void;
}) {
  const { depleted, onOpenUsage, onNotify } = params;

  const blockSpend = useCallback(
    (options?: { context?: 'modal' | 'upload' | 'chat'; silent?: boolean }) => {
      if (!isFincoinSpendBlocked(depleted)) return false;
      if (!options?.silent) {
        onOpenUsage();
        onNotify?.(
          options?.context === 'modal'
            ? FINCOIN_SPEND_BLOCKED_MODAL_MESSAGE
            : FINCOIN_SPEND_BLOCKED_MESSAGE,
        );
      }
      return true;
    },
    [depleted, onNotify, onOpenUsage],
  );

  return {
    spendBlocked: depleted,
    blockSpend,
    blockedMessage: FINCOIN_SPEND_BLOCKED_MESSAGE,
    blockedModalMessage: FINCOIN_SPEND_BLOCKED_MODAL_MESSAGE,
  };
}
