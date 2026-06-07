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

export function isGenericTransactionProductLabel(label: string): boolean {
  return /^producto\s+\d+$/i.test(String(label ?? '').trim());
}

export function deriveTransactionAuthorizationState(
  product: Pick<BankProduct, 'bank' | 'label' | 'simulationAccepted'> | null | undefined,
  draft?: TransactionAuthorizationDraft,
): TransactionAuthorizationState {
  const draftBank = draft?.bank !== undefined ? String(draft.bank).trim() : '';
  const bank = draftBank || String(product?.bank ?? '').trim();
  const draftLabel = draft?.label !== undefined ? String(draft.label).trim() : '';
  const label = draftLabel || String(product?.label ?? '').trim();
  const simulationAccepted = Boolean(draft?.simulationAccepted ?? product?.simulationAccepted ?? false);
  return {
    bank,
    label,
    simulationAccepted,
    canContinue:
      Boolean(bank) &&
      Boolean(label) &&
      simulationAccepted &&
      !isGenericTransactionProductLabel(label),
  };
}

export function buildTransactionAuthorizationBlockMessage(
  state: Pick<TransactionAuthorizationState, 'bank' | 'label' | 'simulationAccepted'>,
): string {
  const missing: string[] = [];
  if (!state.bank.trim()) missing.push('institución');
  if (!state.label.trim() || isGenericTransactionProductLabel(state.label)) {
    missing.push('plantilla de producto');
  }
  if (!state.simulationAccepted) missing.push('consentimiento simulado');
  if (missing.length === 0) return 'No se pudo autorizar el producto.';
  return `Completa ${missing.join(', ')} para autorizar.`;
}
