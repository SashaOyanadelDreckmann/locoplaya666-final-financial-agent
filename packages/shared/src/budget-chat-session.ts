import type { BudgetTableAction } from './budget-table-schema';
import { summarizeBudgetActionBatch } from './budget-table-schema';

export type BudgetPendingConfirmation = {
  actions: BudgetTableAction[];
  summary: string;
};

export type BudgetChatSessionState = {
  pendingConfirmation: BudgetPendingConfirmation | null;
};

export function emptyBudgetChatSession(): BudgetChatSessionState {
  return { pendingConfirmation: null };
}

export function buildPendingConfirmation(actions: BudgetTableAction[]): BudgetPendingConfirmation | null {
  if (actions.length === 0) return null;
  return {
    actions,
    summary: summarizeBudgetActionBatch(actions),
  };
}

export function isBudgetConfirmationAnswer(answer: string): boolean {
  const text = String(answer ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return /^(si|sí|sip|ok|dale|listo|ya|confirmo|confirmar|de acuerdo|perfecto|aplica|aplicar|hazlo|acepto|claro)$/.test(text);
}

export function isBudgetRejectionAnswer(answer: string): boolean {
  const text = String(answer ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return /^(no|nop|cancela|cancelar|mejor no|otro|cambiar|espera)$/.test(text);
}
