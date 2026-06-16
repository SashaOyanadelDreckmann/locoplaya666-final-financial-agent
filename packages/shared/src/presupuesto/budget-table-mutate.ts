import type { BudgetRow } from './budget-rows';
import { canonicalBudgetRowId, MAX_BUDGET_ROWS } from './budget-rows';
import type { BudgetTableAction } from './budget-table-schema';
import {
  applyValidatedBudgetTableAction,
  buildBudgetTableSnapshot,
  summarizeBudgetActionBatch,
  validateBudgetTableActions,
} from './budget-table-schema';
import type { BudgetPendingConfirmation } from './budget-chat-session';
import { buildPendingConfirmation } from './budget-chat-session';

export type LegacyBudgetUpdate = {
  label: string;
  type: 'income' | 'expense';
  amount: number;
  category?: string;
};

export type BudgetTablePatch = {
  actions: BudgetTableAction[];
  requires_confirmation: boolean;
  summary: string;
  pending_confirmation: BudgetPendingConfirmation | null;
};

export function normalizeBudgetLookupKey(value: string): string {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function resolveBudgetRowIdForMutation(
  rows: BudgetRow[],
  hint: {
    id?: string;
    label?: string;
    category?: string;
    type: 'income' | 'expense';
  },
): string {
  const explicitId = String(hint.id ?? '').trim();
  if (explicitId) return canonicalBudgetRowId(explicitId);

  const normalizedLabel = normalizeBudgetLookupKey(hint.label ?? hint.category ?? '');
  if (normalizedLabel) {
    const existing = rows.find((row) => {
      if (row.type !== hint.type) return false;
      const rowCategory = normalizeBudgetLookupKey(row.category);
      const rowNote = normalizeBudgetLookupKey(row.note ?? '');
      return (
        rowCategory === normalizedLabel ||
        rowNote === normalizedLabel ||
        rowCategory.includes(normalizedLabel) ||
        rowNote.includes(normalizedLabel)
      );
    });
    if (existing) return canonicalBudgetRowId(existing.id);
  }

  const slug = normalizeBudgetLookupKey(hint.label ?? hint.category ?? 'movimiento')
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  const prefix = hint.type === 'income' ? 'income' : 'expense';
  const base = slug ? `${prefix}_${slug}` : `${prefix}_custom`;
  let candidate = base;
  let suffix = 1;
  const taken = new Set(rows.map((row) => canonicalBudgetRowId(row.id)));
  while (taken.has(canonicalBudgetRowId(candidate))) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }
  return canonicalBudgetRowId(candidate);
}

export function legacyBudgetUpdatesToActions(
  rows: BudgetRow[],
  updates: LegacyBudgetUpdate[],
): BudgetTableAction[] {
  const proposed: BudgetTableAction[] = [];
  for (const update of updates.slice(0, MAX_BUDGET_ROWS)) {
    const label = String(update.label ?? '').trim();
    const amount = Math.round(Number(update.amount));
    const type = update.type === 'income' ? 'income' : 'expense';
    if (!label || !Number.isFinite(amount)) continue;
    const id = resolveBudgetRowIdForMutation(rows, {
      label,
      category: update.category,
      type,
    });
    const exists = rows.some((row) => canonicalBudgetRowId(row.id) === id);
    proposed.push({
      kind: exists ? 'update' : 'add',
      id,
      category: update.category?.trim() || label,
      type,
      amount,
    });
  }
  return validateBudgetTableActions(proposed, rows);
}

export function inferBudgetTableConfirmationRequired(
  actions: BudgetTableAction[],
  modelFlag = false,
): boolean {
  if (actions.length === 0) return false;
  if (modelFlag) return true;
  if (actions.some((action) => action.kind === 'delete')) return true;
  if (actions.length >= 4) return true;
  if (actions.filter((action) => action.kind === 'add').length >= 3) return true;
  return false;
}

export function buildBudgetTablePatch(
  rows: BudgetRow[],
  proposed: BudgetTableAction[],
  options?: { modelRequiresConfirmation?: boolean },
): BudgetTablePatch {
  const validated = validateBudgetTableActions(proposed, rows);
  const requires_confirmation = inferBudgetTableConfirmationRequired(
    validated,
    Boolean(options?.modelRequiresConfirmation),
  );
  const summary = summarizeBudgetActionBatch(validated, rows);

  if (requires_confirmation && validated.length > 0) {
    return {
      actions: [],
      requires_confirmation: true,
      summary,
      pending_confirmation: buildPendingConfirmation(validated, rows),
    };
  }

  return {
    actions: validated,
    requires_confirmation: false,
    summary,
    pending_confirmation: null,
  };
}

export function previewBudgetRowsAfterActions(rows: BudgetRow[], actions: BudgetTableAction[]): BudgetRow[] {
  let next = [...rows];
  for (const action of actions) {
    next = applyValidatedBudgetTableAction(next, action);
  }
  return next.slice(0, MAX_BUDGET_ROWS);
}

export function parseBudgetTableActionsJson(raw: unknown): BudgetTableAction[] {
  if (!Array.isArray(raw)) return [];
  const actions: BudgetTableAction[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const kind = record.kind;
    const id = String(record.id ?? '').trim();
    if ((kind !== 'add' && kind !== 'update' && kind !== 'delete') || !id) continue;
    actions.push({
      kind,
      id,
      category: typeof record.category === 'string' ? record.category : undefined,
      type: record.type === 'income' || record.type === 'expense' ? record.type : undefined,
      amount: record.amount === undefined ? undefined : Number(record.amount),
      cadence:
        record.cadence === 'fixed' || record.cadence === 'variable' ? record.cadence : undefined,
      payment_method:
        typeof record.payment_method === 'string'
          ? (record.payment_method as BudgetTableAction['payment_method'])
          : undefined,
      movement_type:
        typeof record.movement_type === 'string'
          ? (record.movement_type as BudgetTableAction['movement_type'])
          : undefined,
    });
  }
  return actions;
}

export function extractBudgetTableActionsFromTag(text: string): BudgetTableAction[] {
  const match = text.match(/<BUDGET_TABLE_ACTIONS>\s*(\[[\s\S]*?\])\s*<\/BUDGET_TABLE_ACTIONS>/i);
  if (!match) return [];
  try {
    return parseBudgetTableActionsJson(JSON.parse(match[1]));
  } catch {
    return [];
  }
}

export function budgetRowsFromUiSnapshot(raw: unknown): BudgetRow[] {
  if (!Array.isArray(raw)) return [];
  const rows: BudgetRow[] = [];
  for (const [index, row] of raw.entries()) {
    if (!row || typeof row !== 'object') continue;
    const record = row as Record<string, unknown>;
    const type = record.type === 'income' ? 'income' : record.type === 'expense' ? 'expense' : null;
    if (!type) continue;
    const category = String(record.category ?? '').trim();
    rows.push({
      id:
        typeof record.id === 'string' && record.id.trim()
          ? canonicalBudgetRowId(record.id)
          : `row_${index}`,
      category: category || (type === 'income' ? 'Ingreso' : 'Gasto'),
      type,
      amount: Math.max(0, Math.round(Number(record.amount ?? 0))),
      ...(typeof record.note === 'string' ? { note: record.note } : {}),
      ...(record.cadence === 'fixed' || record.cadence === 'variable'
        ? { cadence: record.cadence }
        : {}),
      ...(typeof record.paymentMethod === 'string'
        ? { paymentMethod: record.paymentMethod as BudgetRow['paymentMethod'] }
        : {}),
      ...(typeof record.movementType === 'string'
        ? { movementType: record.movementType as BudgetRow['movementType'] }
        : {}),
    });
  }
  return rows.slice(0, MAX_BUDGET_ROWS);
}

export function extractBudgetTablePatchFromToolData(
  data: unknown,
  rows: BudgetRow[],
): BudgetTablePatch | null {
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  if (record.patch && typeof record.patch === 'object') {
    const patch = record.patch as BudgetTablePatch;
    if (Array.isArray(patch.actions) || patch.pending_confirmation) return patch;
  }
  const proposed = parseBudgetTableActionsJson(record.proposed_actions ?? record.actions);
  if (proposed.length === 0) return null;
  return buildBudgetTablePatch(rows, proposed, {
    modelRequiresConfirmation: Boolean(record.model_requires_confirmation),
  });
}

export function extractBudgetTablePatchFromToolOutputs(
  toolOutputs: Array<{ tool: string; data: unknown }> | undefined,
  rows: BudgetRow[],
): BudgetTablePatch | null {
  if (!Array.isArray(toolOutputs)) return null;
  for (let index = toolOutputs.length - 1; index >= 0; index -= 1) {
    const output = toolOutputs[index];
    if (output.tool !== 'finance.budget_table_actions') continue;
    const patch = extractBudgetTablePatchFromToolData(output.data, rows);
    if (patch) return patch;
  }
  return null;
}

export function toBudgetTableSnapshotInput(rows: BudgetRow[]) {
  return buildBudgetTableSnapshot(rows);
}
