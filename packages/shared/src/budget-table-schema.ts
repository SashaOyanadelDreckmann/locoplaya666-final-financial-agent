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

  const cadence =
    action.cadence !== undefined
      ? normalizeBudgetCadence(action.cadence, rowType)
      : existing?.cadence
        ? normalizeBudgetCadence(existing.cadence, rowType)
        : undefined;
  const paymentMethod =
    paymentRaw !== undefined
      ? normalizeBudgetPaymentMethod(paymentRaw, rowType)
      : existing?.paymentMethod
        ? normalizeBudgetPaymentMethod(existing.paymentMethod, rowType)
        : undefined;
  const movementType =
    movementRaw !== undefined
      ? normalizeBudgetMovementType(movementRaw, rowType)
      : existing?.movementType
        ? normalizeBudgetMovementType(existing.movementType, rowType)
        : undefined;

  return {
    id,
    category,
    type: rowType,
    amount,
    cadence,
    paymentMethod,
    movementType,
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

export const MAX_BUDGET_TABLE_ACTIONS = 30;

export function validateBudgetTableActions(actions: BudgetTableAction[], rows: BudgetRow[]): BudgetTableAction[] {
  const validated: BudgetTableAction[] = [];
  for (const action of actions.slice(0, MAX_BUDGET_TABLE_ACTIONS)) {
    const result = validateBudgetTableAction(action, rows);
    if (result.ok) validated.push(result.action);
  }
  return validated;
}

function labelCadence(value: BudgetCadence | undefined): string | null {
  if (!value) return null;
  return BUDGET_CADENCE_OPTIONS.find((item) => item.value === value)?.label ?? null;
}

function labelPayment(value: BudgetPaymentMethod | undefined): string | null {
  if (!value) return null;
  return BUDGET_PAYMENT_OPTIONS.find((item) => item.value === value)?.label ?? null;
}

function labelMovement(value: BudgetMovementType | undefined): string | null {
  if (!value) return null;
  return BUDGET_MOVEMENT_TYPE_OPTIONS.find((item) => item.value === value)?.label ?? null;
}

export function summarizeBudgetActionBatch(actions: BudgetTableAction[], rows: BudgetRow[] = []): string {
  if (actions.length === 0) return '';
  const rowById = new Map(rows.map((row) => [canonicalBudgetRowId(row.id), row]));

  if (actions.length > 1 && actions.every((action) => action.kind === 'delete')) {
    return `Eliminar ${actions.length} movimientos de la tabla`;
  }

  return actions
    .map((action) => {
      const row = rowById.get(canonicalBudgetRowId(action.id));
      const label = row?.category ?? action.category ?? 'Movimiento';
      if (action.kind === 'delete') return `Eliminar ${label}`;
      const parts = [
        action.kind === 'add' ? 'Agregar' : 'Actualizar',
        label,
        action.amount != null ? `$${Math.round(action.amount).toLocaleString('es-CL')}` : null,
        labelCadence(action.cadence) ? `recurrencia ${labelCadence(action.cadence)}` : null,
        labelPayment(action.payment_method ?? action.paymentMethod)
          ? `pago ${labelPayment(action.payment_method ?? action.paymentMethod)}`
          : null,
        labelMovement(action.movement_type ?? action.movementType)
          ? `tipo ${labelMovement(action.movement_type ?? action.movementType)}`
          : null,
      ].filter(Boolean);
      return parts.join(' · ');
    })
    .join('; ');
}

function normalizeBudgetParseText(answer: string): string {
  return String(answer ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function parseBudgetCadenceFromAnswer(answer: string): BudgetCadence | null {
  const text = normalizeBudgetParseText(answer);
  if (/\b(fijo|fija|fijos|siempre igual|mismo monto|recurrente|dejalo fijo|dejala fija|ponlo fijo|ponla fija)\b/.test(text)) {
    return 'fixed';
  }
  if (/\b(variable|variables|cambia|distinto|depende|varia|dejalo variable|dejala variable|ponlo variable|ponla variable)\b/.test(text)) {
    return 'variable';
  }
  return null;
}

export function parseBudgetPaymentFromAnswer(answer: string): BudgetPaymentMethod | null {
  const text = normalizeBudgetParseText(answer);
  if (/\b(transferencia|transfer|abono|deposito|cuenta rut|rut\b)\b/.test(text)) return 'transfer';
  if (/\b(debito|débito|redcompra|cuenta corriente|cuenta vista|tarjeta de debito|tarjeta debito)\b/.test(text)) {
    return 'debit';
  }
  if (/\b(credito|crédito|tarjeta de credito|tarjeta credito|visa|mastercard|tc\b)\b/.test(text)) return 'credit';
  if (/\b(efectivo|cash|caja)\b/.test(text)) return 'cash';
  if (/\b(prepago|prepaid|tarjeta prepago)\b/.test(text)) return 'prepaid';
  if (/\b(otro medio|otro metodo|otro método)\b/.test(text)) return 'other';
  if (/\b(pago con|medio de pago|forma de pago)\b/.test(text) && /\bdebito\b/.test(text)) return 'debit';
  if (/\b(pago con|medio de pago|forma de pago)\b/.test(text) && /\bcredito\b/.test(text)) return 'credit';
  if (/\b(pago con|medio de pago|forma de pago)\b/.test(text) && /\btransfer/.test(text)) return 'transfer';
  return null;
}

export function parseBudgetMovementFromAnswer(answer: string): BudgetMovementType | null {
  const text = normalizeBudgetParseText(answer);
  const explicitMovementIntent =
    /\b(categor[ií]a|tipo de movimiento|tipo movimiento|clasifica|clasificar|etiqueta|ponle tipo|pon tipo|dejalo como|dejala como)\b/.test(
      text,
    ) ||
    (/\bcomo\b/.test(text) &&
      /\b(ingreso|vivienda|servicios|alimentaci|transporte|salud|educaci|deuda|ahorro|impuesto|ocio)\b/.test(text));

  if (!explicitMovementIntent) return null;

  for (const option of BUDGET_MOVEMENT_TYPE_OPTIONS) {
    const label = normalizeBudgetParseText(option.label);
    if (label && new RegExp(`\\b${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text)) {
      return option.value;
    }
  }

  if (/\b(ingreso principal|sueldo|salario|liquido|neto)\b/.test(text)) return 'income_main';
  if (/\b(ingreso extra|adicional|freelance|honorarios|bono)\b/.test(text)) return 'income_extra';
  if (/\b(vivienda|arriendo|dividendo|hipoteca|casa|hogar)\b/.test(text)) return 'housing';
  if (/\b(servicios|internet|luz|agua|gas)\b/.test(text)) return 'home_services';
  if (/\b(alimentacion|comida|supermercado|restaurant)\b/.test(text)) return 'food';
  if (/\b(transporte|bencina|combustible|uber|metro|bus)\b/.test(text)) return 'transport';
  if (/\b(salud|farmacia|medico|isapre|fonasa)\b/.test(text)) return 'health';
  if (/\b(educacion|colegio|universidad|curso)\b/.test(text)) return 'education';
  if (/\b(deuda|cuota|prestamo|hipotecario)\b/.test(text)) return 'debt';
  if (/\b(ahorro|inversion|fondo|apv|deposito a plazo)\b/.test(text)) return 'savings_investment';
  if (/\b(impuesto|comision|patente|contribucion)\b/.test(text)) return 'taxes_fees';
  if (/\b(ocio|entretenimiento|viaje|otros|regalo)\b/.test(text)) return 'leisure_other';
  return null;
}

export function parseBudgetCategoryRenameFromAnswer(answer: string): string | null {
  const raw = String(answer ?? '').trim();
  if (!raw) return null;
  const renameMatch = raw.match(
    /(?:renombra(?:\s+a)?|llama(?:\s+a)?|cambia(?:\s+el)?\s+nombre(?:\s+a)?|deja(?:r)?\s+como|ponle(?:\s+nombre)?|nombra(?:\s+lo)?(?:\s+como)?)\s+["'«]?([^"'»?.!]{2,48})/i,
  );
  const candidate = renameMatch?.[1]?.trim();
  if (!candidate) return null;
  const normalized = normalizeBudgetParseText(candidate);
  if (/\b(fijo|variable|debito|credito|transferencia|efectivo)\b/.test(normalized)) return null;
  return candidate.charAt(0).toUpperCase() + candidate.slice(1);
}

export function parseBudgetTypeFromAnswer(answer: string): 'income' | 'expense' | null {
  const text = normalizeBudgetParseText(answer);
  if (/\b(ingreso|ingresos|entrada|entradas|abono|abonos|sueldo|salario|liquido|neto)\b/.test(text)) {
    return 'income';
  }
  if (/\b(gasto|gastos|egreso|egresos|salida|salidas|cargo|cargos)\b/.test(text)) {
    return 'expense';
  }
  return null;
}

export function parseBudgetCategoryFromAnswer(
  answer: string,
  options?: { currentCategory?: string; allowAffirmative?: boolean },
): string | null {
  const renamed = parseBudgetCategoryRenameFromAnswer(answer);
  if (renamed) return renamed;

  const text = normalizeBudgetParseText(answer).trim();
  if (!text) return null;

  if (options?.allowAffirmative !== false) {
    if (
      /^(si|sí|ok|dale|confirmo|confirmar|correcto|as[ií] est[aá]|esta bien|est[aá] bien|dejalo|dejala|dejemos|ese|esa|exacto|perfecto|listo)$/.test(
        text,
      )
    ) {
      const current = String(options?.currentCategory ?? '').trim();
      return current.length > 0 ? current : null;
    }
  }

  if (/\d/.test(text)) return null;
  if (parseBudgetCadenceFromAnswer(answer) || parseBudgetPaymentFromAnswer(answer) || parseBudgetMovementFromAnswer(answer)) {
    return null;
  }

  const raw = String(answer ?? '').trim();
  if (raw.length >= 2 && raw.length <= 48 && !/^\d/.test(raw)) {
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }

  return null;
}

export type BudgetFieldPatch = {
  cadence?: BudgetCadence;
  payment_method?: BudgetPaymentMethod;
  movement_type?: BudgetMovementType;
  category?: string;
  type?: 'income' | 'expense';
};

export function parseBudgetFieldPatchFromAnswer(answer: string, options?: { currentCategory?: string }): BudgetFieldPatch {
  const patch: BudgetFieldPatch = {};
  const cadence = parseBudgetCadenceFromAnswer(answer);
  const payment = parseBudgetPaymentFromAnswer(answer);
  const movement = parseBudgetMovementFromAnswer(answer);
  const category =
    parseBudgetCategoryRenameFromAnswer(answer) ??
    parseBudgetCategoryFromAnswer(answer, { currentCategory: options?.currentCategory, allowAffirmative: false });
  const type = parseBudgetTypeFromAnswer(answer);
  if (cadence) patch.cadence = cadence;
  if (payment) patch.payment_method = payment;
  if (movement) patch.movement_type = movement;
  if (category) patch.category = category;
  if (type) patch.type = type;
  return patch;
}

export function hasBudgetFieldSignals(answer: string, options?: { currentCategory?: string }): boolean {
  const patch = parseBudgetFieldPatchFromAnswer(answer, options);
  return Boolean(patch.cadence || patch.payment_method || patch.movement_type || patch.category || patch.type);
}
