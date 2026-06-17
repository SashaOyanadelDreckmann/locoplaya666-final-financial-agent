import {
  mergeBudgetActionIntoRow,
  normalizeBudgetActionRowId,
  validateBudgetTableActions,
  type BudgetEditableField,
  type BudgetTableAction,
} from '@financial-agent/shared';
import type { BudgetRow } from '@/lib/presupuesto/filas.helpers';

export type BudgetPendingPreviewItem = {
  kind: BudgetTableAction['kind'];
  row: BudgetRow;
};

export function updateBudgetPendingActionsFromRowEdit(
  actions: BudgetTableAction[],
  budgetRows: BudgetRow[],
  rowId: string,
  field: BudgetEditableField,
  value: string | number,
): BudgetTableAction[] {
  const normalizedId = normalizeBudgetActionRowId(rowId);
  if (!normalizedId) return actions;

  const nextActions = actions.map((action) => {
    if (normalizeBudgetActionRowId(action.id) !== normalizedId) return action;
    if (action.kind === 'delete') return action;

    const updated: BudgetTableAction = { ...action };
    switch (field) {
      case 'category': {
        const category = String(value).trim();
        if (category) updated.category = category;
        break;
      }
      case 'type':
        updated.type = value === 'income' ? 'income' : 'expense';
        break;
      case 'amount':
        updated.amount = Math.max(0, Math.round(Number(value)));
        break;
      case 'cadence':
        updated.cadence = value === 'fixed' ? 'fixed' : 'variable';
        break;
      case 'paymentMethod':
        updated.payment_method =
          typeof value === 'string'
            ? (value as BudgetTableAction['payment_method'])
            : updated.payment_method;
        break;
      case 'movementType':
        updated.movement_type =
          typeof value === 'string'
            ? (value as BudgetTableAction['movement_type'])
            : updated.movement_type;
        break;
    }
    return updated;
  });

  return validateBudgetTableActions(nextActions, budgetRows);
}

export function buildBudgetPendingPreviewItems(
  actions: BudgetTableAction[],
  rows: BudgetRow[],
): BudgetPendingPreviewItem[] {
  const items: BudgetPendingPreviewItem[] = [];

  for (const action of actions) {
    const actionRowId = normalizeBudgetActionRowId(action.id);
    if (!actionRowId) continue;

    const existing =
      rows.find((row) => normalizeBudgetActionRowId(row.id) === actionRowId) ?? null;

    if (action.kind === 'delete') {
      if (existing) items.push({ kind: 'delete', row: existing });
      continue;
    }

    const merged = mergeBudgetActionIntoRow(existing, action);
    if (merged) items.push({ kind: action.kind, row: merged });
  }

  return items;
}
