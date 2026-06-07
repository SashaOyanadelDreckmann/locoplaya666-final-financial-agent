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
    <div className="budget-pending-confirm" role="alert" aria-live="polite">
      <p className="budget-pending-confirm-copy">{summary}</p>
      <div className="budget-pending-confirm-actions">
        <button type="button" className="continue-ghost" onClick={onReject} disabled={disabled}>
          Cancelar
        </button>
        <button type="button" className="button-primary" onClick={onConfirm} disabled={disabled}>
          Confirmar
        </button>
      </div>
    </div>
  );
}
