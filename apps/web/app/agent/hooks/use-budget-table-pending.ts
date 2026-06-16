'use client';

import { useCallback, useState } from 'react';
import {
  isBudgetConfirmationAnswer,
  isBudgetRejectionAnswer,
  type BudgetPendingConfirmation,
  type BudgetTableAction,
  type BudgetTablePatch,
} from '@financial-agent/shared';

export function useBudgetTablePending(
  applyBudgetTableActions: (actions: BudgetTableAction[]) => void,
) {
  const [pending, setPending] = useState<BudgetPendingConfirmation | null>(null);

  const consumeBudgetTablePatch = useCallback(
    (patch: BudgetTablePatch | null | undefined) => {
      if (!patch) return;
      if (patch.requires_confirmation && patch.pending_confirmation) {
        setPending(patch.pending_confirmation);
        return;
      }
      setPending(null);
      if (patch.actions.length > 0) {
        applyBudgetTableActions(patch.actions);
      }
    },
    [applyBudgetTableActions],
  );

  const confirmPending = useCallback(() => {
    const actions = pending?.actions ?? [];
    if (actions.length === 0) {
      setPending(null);
      return false;
    }
    applyBudgetTableActions(actions);
    setPending(null);
    return true;
  }, [applyBudgetTableActions, pending]);

  const rejectPending = useCallback(() => {
    setPending(null);
  }, []);

  const tryResolvePendingFromAnswer = useCallback(
    (answer: string): boolean => {
      if (!pending) return false;
      if (isBudgetConfirmationAnswer(answer)) {
        confirmPending();
        return true;
      }
      if (isBudgetRejectionAnswer(answer)) {
        rejectPending();
        return true;
      }
      return false;
    },
    [confirmPending, pending, rejectPending],
  );

  return {
    pending,
    setPending,
    consumeBudgetTablePatch,
    confirmPending,
    rejectPending,
    tryResolvePendingFromAnswer,
    hasPending: Boolean(pending),
  };
}
