import type { BankProduct } from '@/app/agent/transactions/types';

export type TransactionAuthorizationDraft = {
  bank?: string;
  label?: string;
  simulationAccepted?: boolean;
};

export type TransactionAuthorizationState = {
  bank: string;
  label: string;
  simulationAccepted: boolean;
  canContinue: boolean;
};

export function deriveTransactionAuthorizationState(
  product: Pick<BankProduct, 'bank' | 'label' | 'simulationAccepted'> | null | undefined,
  draft?: TransactionAuthorizationDraft,
): TransactionAuthorizationState {
  const bank = String(draft?.bank ?? product?.bank ?? '').trim();
  const label = String(draft?.label ?? product?.label ?? '').trim();
  const simulationAccepted = Boolean(draft?.simulationAccepted ?? product?.simulationAccepted ?? false);
  return {
    bank,
    label,
    simulationAccepted,
    canContinue: Boolean(bank) && Boolean(label) && simulationAccepted,
  };
}
