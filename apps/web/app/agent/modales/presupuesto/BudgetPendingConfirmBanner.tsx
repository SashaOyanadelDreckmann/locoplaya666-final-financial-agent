'use client';

import type { CSSProperties } from 'react';
import { useCallback, useMemo } from 'react';
import type { BudgetRow } from '@/lib/presupuesto/filas.helpers';
import type {
  BudgetEditableField,
  BudgetPendingConfirmation,
  BudgetTableAction,
} from '@financial-agent/shared';
import { BudgetPendingProposalPreview } from '@/components/ui/budget-intelligence-table';
import {
  buildBudgetPendingPreviewItems,
  updateBudgetPendingActionsFromRowEdit,
} from '@/lib/presupuesto/budget-pending-preview.helpers';
import { DEFAULT_BUDGET_TABLE_STYLE } from './budget-modal.helpers';
import { colorForBudgetRow, rowStyleForBudgetRow } from './budget-modal.shared';

type BudgetPendingConfirmBannerProps = {
  pending: BudgetPendingConfirmation;
  budgetRows: BudgetRow[];
  budgetTotals: { income: number; expenses: number; balance: number };
  budgetTableStyle?: string;
  formatBudgetAmount?: (value: number) => string;
  disabled?: boolean;
  onPendingChange?: (pending: BudgetPendingConfirmation) => void;
  focusBudgetField?: (target: EventTarget | null) => void;
  onConfirm: () => void;
  onReject: () => void;
};

const defaultFormatBudgetAmount = (value: number) => `$${Math.round(value).toLocaleString('es-CL')}`;

export function BudgetPendingConfirmBanner({
  pending,
  budgetRows,
  budgetTotals,
  budgetTableStyle = DEFAULT_BUDGET_TABLE_STYLE,
  formatBudgetAmount = defaultFormatBudgetAmount,
  disabled = false,
  onPendingChange,
  focusBudgetField,
  onConfirm,
  onReject,
}: BudgetPendingConfirmBannerProps) {
  const previewItems = useMemo(
    () => buildBudgetPendingPreviewItems(pending.actions as BudgetTableAction[], budgetRows),
    [budgetRows, pending.actions],
  );

  const rowStyle = useMemo(
    () => (row: BudgetRow): CSSProperties => rowStyleForBudgetRow(row, budgetRows),
    [budgetRows],
  );

  const handleUpdatePreviewRow = useCallback(
    (rowId: string, field: BudgetEditableField, value: string | number) => {
      if (!onPendingChange || disabled) return;
      const nextActions = updateBudgetPendingActionsFromRowEdit(
        pending.actions as BudgetTableAction[],
        budgetRows,
        rowId,
        field,
        value,
      );
      if (nextActions.length === 0) return;
      onPendingChange({ ...pending, actions: nextActions });
    },
    [budgetRows, disabled, onPendingChange, pending],
  );

  return (
    <div
      className="budget-pending-confirm agent-confirm-surface agent-confirm-surface--inline"
      role="alert"
      aria-live="polite"
    >
      {previewItems.length > 0 && onPendingChange && !disabled ? (
        <p className="budget-pending-confirm-hint">Revisa, edita y confirma</p>
      ) : null}
      {previewItems.length > 0 ? (
        <BudgetPendingProposalPreview
          items={previewItems}
          budgetTableStyle={budgetTableStyle}
          formatBudgetAmount={formatBudgetAmount}
          colorForBudgetRow={colorForBudgetRow}
          rowStyle={rowStyle}
          editable={Boolean(onPendingChange) && !disabled}
          onUpdateRow={handleUpdatePreviewRow}
          focusBudgetField={focusBudgetField}
        />
      ) : (
        <p className="budget-pending-confirm-copy agent-confirm-surface__copy">{pending.summary}</p>
      )}

      <div className="budget-pending-confirm-actions agent-confirm-surface__actions">
        <button
          type="button"
          className="budget-chat-sync-button is-assistant-action is-pending-confirm-action agent-confirm-action"
          onClick={onReject}
          disabled={disabled}
        >
          Rechazar
        </button>
        <button
          type="button"
          className="budget-chat-sync-button is-assistant-action is-pending-confirm-action is-pending-confirm-emphasis agent-confirm-action is-emphasis"
          onClick={onConfirm}
          disabled={disabled}
        >
          Aceptar
        </button>
      </div>
    </div>
  );
}
