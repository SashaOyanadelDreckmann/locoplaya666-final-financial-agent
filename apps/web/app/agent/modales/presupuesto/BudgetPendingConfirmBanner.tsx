'use client';

type BudgetPendingConfirmBannerProps = {
  summary: string;
  disabled?: boolean;
  onConfirm: () => void;
  onReject: () => void;
};

export function BudgetPendingConfirmBanner({
  summary,
  disabled = false,
  onConfirm,
  onReject,
}: BudgetPendingConfirmBannerProps) {
  return (
    <div className="budget-pending-confirm agent-confirm-surface agent-confirm-surface--inline" role="alert" aria-live="polite">
      <p className="budget-pending-confirm-copy agent-confirm-surface__copy">{summary}</p>
      <div className="budget-pending-confirm-actions agent-confirm-surface__actions">
        <button
          type="button"
          className="budget-chat-sync-button is-assistant-action is-pending-confirm-action agent-confirm-action"
          onClick={onReject}
          disabled={disabled}
        >
          Cancelar
        </button>
        <button
          type="button"
          className="budget-chat-sync-button is-assistant-action is-pending-confirm-action is-pending-confirm-emphasis agent-confirm-action is-emphasis"
          onClick={onConfirm}
          disabled={disabled}
        >
          Confirmar
        </button>
      </div>
    </div>
  );
}
