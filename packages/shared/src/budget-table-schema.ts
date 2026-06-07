import type { BudgetRow } from './budget-rows';
import { canonicalBudgetRowId } from './budget-rows';

export type BudgetEditableField =
  | 'category'
  | 'type'
  | 'amount'
  | 'cadence'
  | 'paymentMethod'
  | 'movementType';

export type BudgetCadence = 'fixed' | 'variable';
export type BudgetPaymentMethod = 'transfer' | 'debit' | 'credit' | 'cash' | 'prepaid' | 'other';
export type BudgetMovementType =
  | 'income_main'
  | 'income_extra'
  | 'housing'
  | 'home_services'
  | 'food'
  | 'transport'
  | 'health'
  | 'education'
  | 'debt'
  | 'savings_investment'
  | 'taxes_fees'
  | 'leisure_other';

export type BudgetActionKind = 'add' | 'update' | 'delete';

export type BudgetTableAction = {
  kind: BudgetActionKind;
  id: string;
  category?: string;
  type?: 'income' | 'expense';
  amount?: number;
  cadence?: BudgetCadence;
  payment_method?: BudgetPaymentMethod;
  paymentMethod?: BudgetPaymentMethod;
  movement_type?: BudgetMovementType;
  movementType?: BudgetMovementType;
};

export const BUDGET_CADENCE_OPTIONS: Array<{ value: BudgetCadence; label: string }> = [
  { value: 'fixed', label: 'Fijo' },
  { value: 'variable', label: 'Variable' },
];

export const BUDGET_PAYMENT_OPTIONS: Array<{ value: BudgetPaymentMethod; label: string }> = [
  { value: 'transfer', label: 'Transferencia' },
  { value: 'debit', label: 'Débito' },
  { value: 'credit', label: 'Crédito' },
  { value: 'cash', label: 'Efectivo' },
  { value: 'prepaid', label: 'Prepago' },
  { value: 'other', label: 'Otro' },
];

export const BUDGET_MOVEMENT_TYPE_OPTIONS: Array<{ value: BudgetMovementType; label: string }> = [
  { value: 'income_main', label: 'Ingreso principal' },
  { value: 'income_extra', label: 'Ingreso adicional' },
  { value: 'housing', label: 'Vivienda' },
  { value: 'home_services', label: 'Servicios hogar' },
  { value: 'food', label: 'Alimentación' },
  { value: 'transport', label: 'Transporte' },
  { value: 'health', label: 'Salud' },
  { value: 'education', label: 'Educación' },
  { value: 'debt', label: 'Deudas' },
  { value: 'savings_investment', label: 'Ahorro/Inversión' },
  { value: 'taxes_fees', label: 'Impuestos/Comisiones' },
  { value: 'leisure_other', label: 'Ocio/Otros' },
];

export const BUDGET_TABLE_COLUMN_HELP =
  'Columnas editables: Movimiento (categoría), Tipo (ingreso/gasto), Monto, Recurrencia (fijo/variable), Medio de pago, Tipo de movimiento. Impacto es calculado.';

export function normalizeBudgetCadence(value: unknown, rowType: BudgetRow['type']): BudgetCadence | undefined {
  if (value === 'fixed' || value === 'variable') return value;
  if (value === 'oneoff') return 'variable';
  return rowType === 'income' ? 'fixed' : 'variable';
}

export function normalizeBudgetPaymentMethod(value: unknown, rowType: BudgetRow['type']): BudgetPaymentMethod | undefined {
  const allowed = new Set(BUDGET_PAYMENT_OPTIONS.map((item) => item.value));
  if (typeof value === 'string' && allowed.has(value as BudgetPaymentMethod)) return value as BudgetPaymentMethod;
  return rowType === 'income' ? 'transfer' : 'debit';
}

export function normalizeBudgetMovementType(value: unknown, rowType: BudgetRow['type']): BudgetMovementType | undefined {
  const allowed = new Set(BUDGET_MOVEMENT_TYPE_OPTIONS.map((item) => item.value));
  if (typeof value === 'string' && allowed.has(value as BudgetMovementType)) return value as BudgetMovementType;
  return rowType === 'income' ? 'income_main' : 'leisure_other';
}

export function normalizeBudgetActionRowId(rawId: unknown): string | null {
  const rowId = String(rawId ?? '').trim();
  if (!rowId) return null;
  return rowId.replace(/^expense[-_]custom[-_]?/i, 'expense-custom-');
}

export function buildBudgetTableSnapshot(rows: BudgetRow[]) {
  return rows.slice(0, 30).map((row) => ({
    id: row.id,
    category: row.category,
    type: row.type,
    amount: Math.max(0, Math.round(Number(row.amount ?? 0))),
    cadence: row.cadence === 'fixed' || row.cadence === 'variable' ? row.cadence : null,
    paymentMethod:
      row.paymentMethod && BUDGET_PAYMENT_OPTIONS.some((item) => item.value === row.paymentMethod)
        ? row.paymentMethod
        : null,
    movementType:
      row.movementType && BUDGET_MOVEMENT_TYPE_OPTIONS.some((item) => item.value === row.movementType)
        ? row.movementType
        : null,
  }));
}

export function mergeBudgetActionIntoRow(existing: BudgetRow | null, action: BudgetTableAction): BudgetRow | null {
  const id = normalizeBudgetActionRowId(action.id);
  if (!id) return null;
  const rowType =
    action.type === 'income' || action.type === 'expense'
      ? action.type
      : existing?.type ?? null;
  if (!rowType) return null;

  const category = String(action.category ?? existing?.category ?? '').trim();
  if (!category) return null;

  const amount =
    action.amount === undefined
      ? Math.max(0, Math.round(Number(existing?.amount ?? 0)))
      : Math.max(0, Math.round(Number(action.amount ?? 0)));

  const paymentRaw = action.payment_method ?? action.paymentMethod ?? existing?.paymentMethod;
  const movementRaw = action.movement_type ?? action.movementType ?? existing?.movementType;

  return {
    id,
    category,
    type: rowType,
    amount,
    cadence: normalizeBudgetCadence(action.cadence ?? existing?.cadence, rowType),
    paymentMethod: normalizeBudgetPaymentMethod(paymentRaw, rowType),
    movementType: normalizeBudgetMovementType(movementRaw, rowType),
    parentId: existing?.parentId,
  };
}

export function validateBudgetTableAction(
  action: BudgetTableAction,
  rows: BudgetRow[],
): { ok: true; action: BudgetTableAction } | { ok: false; reason: string } {
  const id = normalizeBudgetActionRowId(action.id);
  if (!id) return { ok: false, reason: 'missing_row_id' };
  const canonical = canonicalBudgetRowId(id);
  const exists = rows.some((row) => canonicalBudgetRowId(row.id) === canonical);

  if (action.kind === 'delete') {
    if (!exists) return { ok: false, reason: 'delete_unknown_row' };
    return { ok: true, action: { kind: 'delete', id: canonical } };
  }

  if (action.kind === 'update' && !exists) return { ok: false, reason: 'update_unknown_row' };

  const existing = rows.find((row) => canonicalBudgetRowId(row.id) === canonical) ?? null;
  const merged = mergeBudgetActionIntoRow(existing, { ...action, id: canonical });
  if (!merged) return { ok: false, reason: 'invalid_merge' };

  return {
    ok: true,
    action: {
      kind: action.kind === 'add' && exists ? 'update' : action.kind,
      id: canonical,
      category: merged.category,
      type: merged.type,
      amount: merged.amount,
      cadence: normalizeBudgetCadence(merged.cadence, merged.type),
      payment_method: merged.paymentMethod,
      movement_type: merged.movementType,
    },
  };
}

export function validateBudgetTableActions(actions: BudgetTableAction[], rows: BudgetRow[]): BudgetTableAction[] {
  const validated: BudgetTableAction[] = [];
  for (const action of actions.slice(0, 6)) {
    const result = validateBudgetTableAction(action, rows);
    if (result.ok) validated.push(result.action);
  }
  return validated;
}

export function summarizeBudgetActionBatch(actions: BudgetTableAction[]): string {
  if (actions.length === 0) return '';
  return actions
    .map((action) => {
      if (action.kind === 'delete') return `eliminar ${action.id}`;
      const parts = [
        action.kind === 'add' ? 'agregar' : 'actualizar',
        action.category ?? action.id,
        action.amount != null ? `$${Math.round(action.amount).toLocaleString('es-CL')}` : null,
        action.cadence ? `(${action.cadence})` : null,
        action.payment_method ? `[${action.payment_method}]` : null,
      ].filter(Boolean);
      return parts.join(' ');
    })
    .join('; ');
}
