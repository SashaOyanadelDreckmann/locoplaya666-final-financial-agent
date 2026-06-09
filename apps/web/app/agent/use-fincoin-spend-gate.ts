'use client';

import { useCallback } from 'react';
import {
  FINCOIN_SPEND_BLOCKED_MESSAGE,
  FINCOIN_SPEND_BLOCKED_MODAL_MESSAGE,
  isFincoinSpendBlocked,
} from '@/lib/fincoin-gate';

export function useFincoinSpendGate(params: {
  depleted: boolean;
  onOpenUsage: () => void;
  onNotify?: (message: string) => void;
}) {
  const blockSpend = useCallback(
    (options?: { context?: 'modal' | 'upload' | 'chat'; silent?: boolean }) => {
      if (!isFincoinSpendBlocked(params.depleted)) return false;
      if (!options?.silent) {
        params.onOpenUsage();
        params.onNotify?.(
          options?.context === 'modal'
            ? FINCOIN_SPEND_BLOCKED_MODAL_MESSAGE
            : FINCOIN_SPEND_BLOCKED_MESSAGE,
        );
      }
      return true;
    },
    [params.depleted, params.onNotify, params.onOpenUsage],
  );

  return {
    spendBlocked: params.depleted,
    blockSpend,
    blockedMessage: FINCOIN_SPEND_BLOCKED_MESSAGE,
    blockedModalMessage: FINCOIN_SPEND_BLOCKED_MODAL_MESSAGE,
  };
}
