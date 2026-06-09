import type { BudgetRow } from './budget-rows';
import { canonicalBudgetRowId, getEffectiveBudgetRows } from './budget-rows';
import { extractInferenceQuestionText, inferBudgetFocusRowId } from './budget-chat-focus';
import {
  BUDGET_MOVEMENT_TYPE_OPTIONS,
  normalizeBudgetMovementType,
  type BudgetMovementType,
} from './budget-table-schema';

export type BudgetChatTurn = { q: string; a: string };

export type BudgetProductSnapshot = {
  label?: string;
  bank?: string;
  productType?: string;
  dashboardSummary?: string;
  alerts?: string[];
  topCategories?: Array<{ name: string; amount: number }>;
  keyMetrics?: {
    inflows_total?: number;
    outflows_total?: number;
    net_flow?: number;
    movement_count?: number;
  };
};

export type BudgetIntakeSnapshot = {
  age?: unknown;
  employmentStatus?: string;
  exactMonthlyIncome?: number;
  incomeBand?: string;
  hasDebt?: boolean;
  hasSavingsOrInvestments?: boolean;
  intakeContext?: string;
};

export type RowTransactionHint = {
  rowId: string;
  estimatedMonthly: number;
  matchedCategories: string[];
  sourceLabels: string[];
  confidence: 'high' | 'medium' | 'low';
};

export type BudgetRowSuggestion = {
  kind: 'update' | 'add';
  rowId: string;
  category: string;
  type: 'income' | 'expense';
  suggestedAmount: number;
  reason: string;
  movementType?: BudgetRow['movementType'];
};

export type BudgetAssistantContext = {
  intake: BudgetIntakeSnapshot;
  products: BudgetProductSnapshot[];
  chatAnswers: BudgetChatTurn[];
  rowHints: Map<string, RowTransactionHint>;
  unmappedCategories: Array<{ name: string; amount: number; sourceLabel: string }>;
  totalInflows: number;
  totalOutflows: number;
  discussedRowIds: Set<string>;
};

const CORE_ROW_ORDER = [
  'income_salary',
  'expense_rent',
  'expense_food',
  'expense_transport',
  'expense_services',
  'expense_debt',
  'expense_savings',
  'expense_other',
] as const;

const ROW_MOVEMENT_TYPES: Record<string, BudgetRow['movementType']> = {
  income_salary: 'income_main',
  income_extra: 'income_extra',
  expense_rent: 'housing',
  expense_food: 'food',
  expense_transport: 'transport',
  expense_services: 'home_services',
  expense_debt: 'debt',
  expense_savings: 'savings_investment',
  expense_other: 'leisure_other',
};

export function formatBudgetClp(value: number): string {
  return Math.max(0, Math.round(Number(value) || 0)).toLocaleString('es-CL');
}

function normalizeCategoryLabel(value: string): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ');
}

function slugifyCategory(value: string): string {
  return normalizeCategoryLabel(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function extractAmountFromText(text: string): number | null {
  const normalized = String(text ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\bclp\b/gi, '')
    .replace(/\$/g, '')
    .trim();
  const match = normalized.match(/([+-]?\d[\d., ]{0,15})(?:\s*(k|mil|m|mm|millones?))?/i);
  if (!match) return null;
  let numeric = match[1].replace(/\s+/g, '');
  const multiplierTag = String(match[2] ?? '').toLowerCase();
  if (numeric.includes('.') && numeric.includes(',')) {
    numeric = numeric.replace(/\./g, '').replace(',', '.');
  } else if ((numeric.match(/\./g) ?? []).length > 1) {
    numeric = numeric.replace(/\./g, '');
  } else if ((numeric.match(/,/g) ?? []).length > 1) {
    numeric = numeric.replace(/,/g, '');
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(numeric) || /^\d{1,3}(?:,\d{3})+$/.test(numeric)) {
    numeric = numeric.replace(/[.,]/g, '');
  } else {
    numeric = numeric.replace(',', '.');
  }
  const value = Number(numeric);
  if (!Number.isFinite(value)) return null;
  let multiplier = 1;
  if (multiplierTag === 'k' || multiplierTag === 'mil') multiplier = 1000;
  if (multiplierTag === 'm' || multiplierTag === 'mm' || multiplierTag.startsWith('millon')) multiplier = 1_000_000;
  return Math.max(0, Math.round(value * multiplier));
}

function inferRowIdFromCategoryName(name: string): string | null {
  return inferBudgetFocusRowId(name);
}

function mergeRowHint(
  hints: Map<string, RowTransactionHint>,
  rowId: string,
  categoryName: string,
  amount: number,
  sourceLabel: string,
) {
  const canonical = canonicalBudgetRowId(rowId);
  const existing = hints.get(canonical);
  const nextAmount = Math.max(0, Math.round(amount));
  if (!existing) {
    hints.set(canonical, {
      rowId: canonical,
      estimatedMonthly: nextAmount,
      matchedCategories: [categoryName],
      sourceLabels: sourceLabel ? [sourceLabel] : [],
      confidence: 'medium',
    });
    return;
  }
  existing.estimatedMonthly += nextAmount;
  if (!existing.matchedCategories.includes(categoryName)) existing.matchedCategories.push(categoryName);
  if (sourceLabel && !existing.sourceLabels.includes(sourceLabel)) existing.sourceLabels.push(sourceLabel);
  existing.confidence = existing.matchedCategories.length >= 2 || existing.sourceLabels.length >= 2 ? 'high' : 'medium';
}

export function summarizeBudgetIntake(value: unknown, intakeContext?: string | null): BudgetIntakeSnapshot {
  if (!value || typeof value !== 'object') {
    return { intakeContext: intakeContext?.trim() || undefined };
  }
  const data = value as Record<string, unknown>;
  return {
    age: data.age,
    employmentStatus: typeof data.employmentStatus === 'string' ? data.employmentStatus : undefined,
    exactMonthlyIncome:
      typeof data.exactMonthlyIncome === 'number' && Number.isFinite(data.exactMonthlyIncome)
        ? Math.max(0, Math.round(data.exactMonthlyIncome))
        : undefined,
    incomeBand: typeof data.incomeBand === 'string' ? data.incomeBand : undefined,
    hasDebt: typeof data.hasDebt === 'boolean' ? data.hasDebt : undefined,
    hasSavingsOrInvestments:
      typeof data.hasSavingsOrInvestments === 'boolean' ? data.hasSavingsOrInvestments : undefined,
    intakeContext: intakeContext?.trim() || undefined,
  };
}

export function buildBudgetAssistantContext(input: {
  rows: BudgetRow[];
  intakeData: unknown;
  intakeContext?: string | null;
  products: BudgetProductSnapshot[];
  chatAnswers: BudgetChatTurn[];
}): BudgetAssistantContext {
  const intake = summarizeBudgetIntake(input.intakeData, input.intakeContext);
  const products = input.products.slice(0, 4);
  const chatAnswers = input.chatAnswers.slice(-12);
  const rowHints = new Map<string, RowTransactionHint>();
  const unmappedCategories: Array<{ name: string; amount: number; sourceLabel: string }> = [];
  let totalInflows = 0;
  let totalOutflows = 0;

  for (const product of products) {
    const sourceLabel = [product.bank, product.label].filter(Boolean).join(' · ') || 'movimientos';
    totalInflows += Math.max(0, Math.round(Number(product.keyMetrics?.inflows_total ?? 0)));
    totalOutflows += Math.max(0, Math.round(Number(product.keyMetrics?.outflows_total ?? 0)));

    for (const category of product.topCategories ?? []) {
      const name = normalizeCategoryLabel(category.name);
      const amount = Math.max(0, Math.round(Number(category.amount ?? 0)));
      if (!name || amount <= 0) continue;
      const rowId = inferRowIdFromCategoryName(name);
      if (rowId) {
        mergeRowHint(rowHints, rowId, name, amount, sourceLabel);
      } else {
        unmappedCategories.push({ name, amount, sourceLabel });
      }
    }
  }

  if (totalInflows > 0 && !rowHints.has('income_salary')) {
    rowHints.set('income_salary', {
      rowId: 'income_salary',
      estimatedMonthly: totalInflows,
      matchedCategories: ['Abonos / ingresos'],
      sourceLabels: products.map((p) => p.label).filter(Boolean) as string[],
      confidence: totalInflows > 0 ? 'medium' : 'low',
    });
  }

  const discussedRowIds = new Set<string>();
  for (const turn of chatAnswers) {
    const rowId =
      inferBudgetFocusRowId(extractInferenceQuestionText(turn.q) || turn.q) ??
      inferBudgetFocusRowId(turn.a);
    if (rowId) discussedRowIds.add(canonicalBudgetRowId(rowId));
  }

  return {
    intake,
    products,
    chatAnswers,
    rowHints,
    unmappedCategories,
    totalInflows,
    totalOutflows,
    discussedRowIds,
  };
}

export function getChatMemoryForRow(context: BudgetAssistantContext, rowId: string): BudgetChatTurn | null {
  const canonical = canonicalBudgetRowId(rowId);
  for (let index = context.chatAnswers.length - 1; index >= 0; index -= 1) {
    const turn = context.chatAnswers[index];
    const inferred =
      inferBudgetFocusRowId(turn.q) ??
      inferBudgetFocusRowId(extractInferenceQuestionText(turn.q)) ??
      inferBudgetFocusRowId(turn.a);
    if (inferred && canonicalBudgetRowId(inferred) === canonical) return turn;
  }
  return null;
}

function incomeBandHint(band?: string): number | null {
  if (!band) return null;
  const normalized = band.toLowerCase();
  if (/menos|bajo|800|600/.test(normalized)) return 650_000;
  if (/800|1[\s.,]?2|medio/.test(normalized)) return 1_000_000;
  if (/1[\s.,]?5|2[\s.,]?0|alto/.test(normalized)) return 1_750_000;
  if (/2[\s.,]?5|3|premium|executive/.test(normalized)) return 2_800_000;
  return null;
}

function rowHintFor(context: BudgetAssistantContext, rowId: string): RowTransactionHint | null {
  return context.rowHints.get(canonicalBudgetRowId(rowId)) ?? null;
}

function intakeSnippet(context: BudgetAssistantContext): string | null {
  const parts: string[] = [];
  if (context.intake.employmentStatus) parts.push(`trabajas como ${context.intake.employmentStatus}`);
  if (context.intake.hasDebt) parts.push('declaraste deuda');
  if (context.intake.hasSavingsOrInvestments) parts.push('tienes ahorro o inversiones');
  const narrative = context.intake.intakeContext?.trim();
  if (narrative) return narrative.slice(0, 140);
  return parts.length > 0 ? `En tu perfil ${parts.slice(0, 2).join(' y ')}.` : null;
}

export type BudgetRowFieldGap = 'category' | 'amount' | 'cadence' | 'paymentMethod' | 'movementType';

function movementTypeLabel(value: BudgetRow['movementType']): string | null {
  if (!value) return null;
  return BUDGET_MOVEMENT_TYPE_OPTIONS.find((item) => item.value === value)?.label ?? null;
}

function cadenceLabel(value: BudgetRow['cadence']): string | null {
  if (value === 'fixed') return 'fijo';
  if (value === 'variable') return 'variable';
  return null;
}

function paymentMethodLabel(value: BudgetRow['paymentMethod']): string | null {
  if (!value) return null;
  const labels: Record<string, string> = {
    transfer: 'transferencia',
    debit: 'débito',
    credit: 'crédito',
    cash: 'efectivo',
    prepaid: 'prepago',
    other: 'otro',
  };
  return labels[value] ?? null;
}

export function getChatTurnFieldForRow(
  context: BudgetAssistantContext,
  rowId: string,
  field: BudgetRowFieldGap,
): BudgetChatTurn | null {
  const canonical = canonicalBudgetRowId(rowId);
  for (let index = context.chatAnswers.length - 1; index >= 0; index -= 1) {
    const turn = context.chatAnswers[index];
    const inferred =
      inferBudgetFocusRowId(turn.q) ??
      inferBudgetFocusRowId(extractInferenceQuestionText(turn.q)) ??
      inferBudgetFocusRowId(turn.a);
    if (!inferred || canonicalBudgetRowId(inferred) !== canonical) continue;
    const fieldFromQuestion =
      inferBudgetFieldFromQuestion(turn.q) ?? inferBudgetFieldFromQuestion(extractInferenceQuestionText(turn.q));
    if (fieldFromQuestion === field) return turn;
  }
  return null;
}

/** Tipo de movimiento (categoría en la UI) confirmado por chat o fila con monto. */
export function isBudgetRowMovementTypeConfirmed(row: BudgetRow, context: BudgetAssistantContext): boolean {
  if (getChatTurnFieldForRow(context, row.id, 'movementType')) return true;
  if (Number(row.amount ?? 0) > 0) return true;
  return false;
}

/** Nombre del movimiento (columna Movimiento) confirmado por chat o fila con monto. */
export function isBudgetRowCategoryConfirmed(row: BudgetRow, context: BudgetAssistantContext): boolean {
  if (getChatTurnFieldForRow(context, row.id, 'category')) return true;
  if (Number(row.amount ?? 0) > 0) return true;
  return false;
}

export function resolveBudgetRowDisplayMovementType(row: BudgetRow): BudgetMovementType {
  const hinted = row.movementType ?? ROW_MOVEMENT_TYPES[row.id];
  return normalizeBudgetMovementType(hinted, row.type) ?? (row.type === 'income' ? 'income_main' : 'leisure_other');
}

/** Primera pregunta: validar categoría = tipo de movimiento (celda del select). */
export function buildBudgetMovementTypeValidationQuestion(row: BudgetRow): string {
  const movementType = resolveBudgetRowDisplayMovementType(row);
  const label = movementTypeLabel(movementType) ?? 'Sin clasificar';
  const category = row.category.trim() || 'este movimiento';
  return `En la tabla, «${category}» tiene categoría «${label}» (tipo de movimiento). ¿Confirmas o cuál corresponde?`;
}

/** Segunda pregunta: nombre del movimiento (columna Movimiento). */
export function buildBudgetMovementNameQuestion(row: BudgetRow): string {
  const category = row.category.trim() || 'sin nombre';
  const typeLabel = row.type === 'income' ? 'ingreso' : 'gasto';
  return `¿Cómo quieres llamar este movimiento? En la tabla aparece «${category}» como ${typeLabel}.`;
}

/** @deprecated Use buildBudgetMovementTypeValidationQuestion — "categoría" = tipo de movimiento. */
export function buildBudgetCategoryValidationQuestion(row: BudgetRow): string {
  return buildBudgetMovementTypeValidationQuestion(row);
}

export function buildBudgetAmountQuestion(row: BudgetRow, context: BudgetAssistantContext): string {
  const hint = rowHintFor(context, row.id);
  const memory = getChatMemoryForRow(context, row.id);
  const memoryAmount = memory ? extractAmountFromText(memory.a) : null;
  const category = row.category.trim() || 'este movimiento';

  if (memory && memoryAmount && Number(row.amount ?? 0) <= 0) {
    return `Para «${category}», antes mencionaste $${formatBudgetClp(memoryAmount)}. ¿Confirmamos ese monto mensual?`;
  }

  switch (row.id) {
    case 'income_salary': {
      const intakeAmount = context.intake.exactMonthlyIncome;
      const txAmount = hint?.estimatedMonthly ?? (context.totalInflows > 0 ? context.totalInflows : null);
      const bandAmount = incomeBandHint(context.intake.incomeBand);
      const reference = intakeAmount ?? txAmount ?? bandAmount;
      if (reference && reference > 0) {
        const source =
          intakeAmount != null
            ? 'tu perfil'
            : txAmount != null
              ? `tus movimientos${hint?.sourceLabels[0] ? ` (${hint.sourceLabels[0]})` : ''}`
              : 'tu banda de ingreso';
        return `Para «${category}», según ${source} ronda $${formatBudgetClp(reference)}. ¿Cuál es el monto mensual?`;
      }
      break;
    }
    case 'expense_rent':
      if (hint && hint.estimatedMonthly > 0) {
        return `Para «${category}», en movimientos aparece ~$${formatBudgetClp(hint.estimatedMonthly)}. ¿Cuál es el monto mensual?`;
      }
      break;
    case 'expense_food':
      if (hint && hint.estimatedMonthly > 0) {
        return `Para «${category}», tus cartolas muestran ~$${formatBudgetClp(hint.estimatedMonthly)}. ¿Cuál es el monto mensual?`;
      }
      break;
    case 'expense_transport':
      if (hint && hint.estimatedMonthly > 0) {
        return `Para «${category}», veo ~$${formatBudgetClp(hint.estimatedMonthly)} en transporte. ¿Cuál es el monto mensual?`;
      }
      break;
    case 'expense_services':
      if (hint && hint.estimatedMonthly > 0) {
        return `Para «${category}», en servicios suman ~$${formatBudgetClp(hint.estimatedMonthly)}. ¿Cuál es el monto mensual?`;
      }
      break;
    case 'expense_debt':
      if (hint && hint.estimatedMonthly > 0) {
        return `Para «${category}», detecté ~$${formatBudgetClp(hint.estimatedMonthly)} en cuotas. ¿Cuál es el monto mensual?`;
      }
      break;
    case 'expense_other':
      if (context.unmappedCategories.length > 0) {
        const top = [...context.unmappedCategories].sort((a, b) => b.amount - a.amount)[0];
        return `Para «${category}», en movimientos hay ~$${formatBudgetClp(top.amount)} en ${top.name}. ¿Cuál es el monto mensual?`;
      }
      break;
    default:
      if (hint && hint.estimatedMonthly > 0) {
        return `Para «${category}», tus movimientos sugieren ~$${formatBudgetClp(hint.estimatedMonthly)}. ¿Cuál es el monto mensual?`;
      }
  }

  return row.type === 'income'
    ? `¿Cuál es el monto mensual de «${category}»?`
    : `¿Cuál es el monto mensual de «${category}»?`;
}

export function pickNextBudgetRowFieldGap(
  row: BudgetRow,
  context?: BudgetAssistantContext,
): BudgetRowFieldGap | null {
  if (context && !isBudgetRowMovementTypeConfirmed(row, context)) return 'movementType';
  if (context && !isBudgetRowCategoryConfirmed(row, context)) return 'category';
  if (Number(row.amount ?? 0) <= 0) return 'amount';
  const cadence = row.cadence;
  if (!cadence || cadence === 'oneoff') return 'cadence';
  if (!row.paymentMethod) return 'paymentMethod';
  return null;
}

export function isBulkDeleteRequest(answer: string): boolean {
  const text = String(answer ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (/\b(limpiar|vaciar|resetear|borrar todo|eliminar todo|quitar todo)\b/.test(text)) return true;
  if (
    /\b(todas?|todo el|toda la|completa?|entera?|cada una)\b/.test(text) &&
    /\b(filas?|tabla|presupuesto|movimientos?|rubros?|categorias?|gastos?|ingresos?)\b/.test(text)
  ) {
    return true;
  }
  return /\b(elimina|eliminar|borra|borrar|quita|quitar)\b/.test(text) && /\b(todas?|todo)\b/.test(text);
}

export function isBudgetSkipAnswer(answer: string): boolean {
  const text = String(answer ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (!text.trim()) return false;
  return /\b(prefiero|siguiente|saltar|skip|pasar|dejemos|otra cosa|otro rubro|continuemos con otro|avancemos|luego|mas tarde|no se|no lo se|no tengo|no aplica)\b/.test(
    text,
  );
}

export function buildBudgetRowDetailQuestion(
  row: BudgetRow,
  field: Exclude<BudgetRowFieldGap, 'amount' | 'category' | 'movementType'>,
): string {
  const category = row.category.trim() || 'este movimiento';
  switch (field) {
    case 'cadence':
      return `Para «${category}», ¿el monto es fijo cada mes o varía mes a mes?`;
    case 'paymentMethod':
      return `Para «${category}», ¿cómo lo pagas normalmente: transferencia, débito, crédito o efectivo?`;
    default:
      return `¿Qué dato falta completar para «${category}»?`;
  }
}

export function inferBudgetFieldFromQuestion(question: string): BudgetRowFieldGap | null {
  const q = String(question ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (/tipo de movimiento|categor[ií]a «|confirmas o cu[aá]l corresponde/.test(q)) return 'movementType';
  if (/c[oó]mo quieres llamar este movimiento|confirmas el nombre/.test(q)) return 'category';
  if (/fijo|variable|var[ií]a mes a mes|recurrente/.test(q)) return 'cadence';
  if (/transferencia|d[eé]bito|cr[eé]dito|efectivo|c[oó]mo pagas|medio de pago|c[oó]mo lo pagas/.test(q)) {
    return 'paymentMethod';
  }
  if (/monto mensual|monto|cu[aá]nto|pesos/.test(q)) return 'amount';
  return null;
}

export function buildContextualQuestion(row: BudgetRow | null, context: BudgetAssistantContext): string {
  if (!row) {
    return buildBudgetMovementTypeValidationQuestion({
      id: 'income_salary',
      category: 'Sueldo líquido',
      type: 'income',
      amount: 0,
    });
  }

  const gap = pickNextBudgetRowFieldGap(row, context);
  if (gap === 'movementType') return buildBudgetMovementTypeValidationQuestion(row);
  if (gap === 'category') return buildBudgetMovementNameQuestion(row);
  if (gap === 'amount') return buildBudgetAmountQuestion(row, context);
  if (gap === 'cadence' || gap === 'paymentMethod') {
    return buildBudgetRowDetailQuestion(row, gap);
  }

  return '¿Qué rubro quieres completar o ajustar en la tabla?';
}

function rowPriorityScore(row: BudgetRow, context: BudgetAssistantContext): number {
  const amount = Number(row.amount ?? 0);
  if (amount > 0) return -1;
  const hint = rowHintFor(context, row.id);
  let score = hint?.estimatedMonthly ?? 0;
  if (context.intake.hasDebt && row.id === 'expense_debt') score += 250_000;
  if (context.intake.hasSavingsOrInvestments && row.id === 'expense_savings') score += 120_000;
  if (context.intake.exactMonthlyIncome && row.id === 'income_salary') score += 500_000;
  if (context.discussedRowIds.has(row.id)) score *= 0.35;
  const coreIndex = CORE_ROW_ORDER.indexOf(row.id as (typeof CORE_ROW_ORDER)[number]);
  if (coreIndex >= 0) score += (CORE_ROW_ORDER.length - coreIndex) * 1000;
  return score;
}

export function pickContextualFocusRow(
  rows: BudgetRow[],
  context: BudgetAssistantContext,
  preferredRowId?: string | null,
): BudgetRow | null {
  if (preferredRowId) {
    const canonical = canonicalBudgetRowId(preferredRowId);
    const direct = rows.find((row) => canonicalBudgetRowId(row.id) === canonical) ?? null;
    if (direct) {
      const gap = pickNextBudgetRowFieldGap(direct, context);
      if (gap) return direct;
    }
  }

  const movementTypePending = getEffectiveBudgetRows(rows).filter(
    (row) => pickNextBudgetRowFieldGap(row, context) === 'movementType',
  );
  if (movementTypePending.length > 0) {
    const ranked = [...movementTypePending].sort(
      (a, b) => rowPriorityScore(b, context) - rowPriorityScore(a, context),
    );
    return ranked[0] ?? movementTypePending[0] ?? null;
  }

  const namePending = getEffectiveBudgetRows(rows).filter(
    (row) => pickNextBudgetRowFieldGap(row, context) === 'category',
  );
  if (namePending.length > 0) {
    const ranked = [...namePending].sort((a, b) => rowPriorityScore(b, context) - rowPriorityScore(a, context));
    return ranked[0] ?? namePending[0] ?? null;
  }

  const metadataIncomplete = getEffectiveBudgetRows(rows).filter((row) => {
    const gap = pickNextBudgetRowFieldGap(row, context);
    return gap != null && gap !== 'amount' && gap !== 'category' && gap !== 'movementType';
  });
  if (metadataIncomplete.length > 0) {
    const ranked = [...metadataIncomplete].sort(
      (a, b) => rowPriorityScore(b, context) - rowPriorityScore(a, context),
    );
    return ranked[0] ?? metadataIncomplete[0] ?? null;
  }

  const unfilled = getEffectiveBudgetRows(rows).filter((row) => Number(row.amount ?? 0) <= 0);
  if (unfilled.length === 0) return rows[0] ?? null;

  const ranked = [...unfilled].sort((a, b) => rowPriorityScore(b, context) - rowPriorityScore(a, context));
  return ranked[0] ?? unfilled[0] ?? null;
}

export function buildBudgetRowSuggestions(
  rows: BudgetRow[],
  context: BudgetAssistantContext,
): BudgetRowSuggestion[] {
  const suggestions: BudgetRowSuggestion[] = [];
  const existingIds = new Set(rows.map((row) => canonicalBudgetRowId(row.id)));

  for (const [rowId, hint] of context.rowHints.entries()) {
    if (hint.estimatedMonthly <= 0) continue;
    const row = rows.find((item) => canonicalBudgetRowId(item.id) === rowId) ?? null;
    const currentAmount = Math.max(0, Math.round(Number(row?.amount ?? 0)));
    if (!row) continue;
    if (currentAmount <= 0) {
      suggestions.push({
        kind: 'update',
        rowId,
        category: row.category,
        type: row.type,
        suggestedAmount: hint.estimatedMonthly,
        reason: `Movimientos sugieren ~$${formatBudgetClp(hint.estimatedMonthly)} en ${hint.matchedCategories.slice(0, 2).join(' / ')}.`,
        movementType: ROW_MOVEMENT_TYPES[rowId] ?? row.movementType,
      });
      continue;
    }
    const gap = Math.abs(currentAmount - hint.estimatedMonthly);
    const ratio = gap / Math.max(1, hint.estimatedMonthly);
    if (ratio >= 0.25 && gap >= 50_000) {
      suggestions.push({
        kind: 'update',
        rowId,
        category: row.category,
        type: row.type,
        suggestedAmount: hint.estimatedMonthly,
        reason: `La tabla tiene $${formatBudgetClp(currentAmount)}, pero movimientos apuntan a ~$${formatBudgetClp(hint.estimatedMonthly)}.`,
        movementType: ROW_MOVEMENT_TYPES[rowId] ?? row.movementType,
      });
    }
  }

  for (const unmapped of context.unmappedCategories) {
    if (unmapped.amount < 40_000) continue;
    const slug = slugifyCategory(unmapped.name);
    const rowId = slug ? `expense-custom-${slug}` : `expense-custom-${Date.now()}`;
    if (existingIds.has(rowId)) continue;
    suggestions.push({
      kind: 'add',
      rowId,
      category: unmapped.name,
      type: 'expense',
      suggestedAmount: unmapped.amount,
      reason: `Aparece ~$${formatBudgetClp(unmapped.amount)} en ${unmapped.name} (${unmapped.sourceLabel}).`,
      movementType: 'leisure_other',
    });
  }

  return suggestions
    .sort((a, b) => b.suggestedAmount - a.suggestedAmount)
    .slice(0, 3);
}

export function buildContextualInitReply(
  rows: BudgetRow[],
  focusRow: BudgetRow | null,
  question: string,
  context: BudgetAssistantContext,
): string {
  const introParts: string[] = [];
  const profileLine = intakeSnippet(context);
  if (profileLine) introParts.push(profileLine);
  if (context.products.length > 0 && context.totalOutflows > 0) {
    introParts.push(
      `Tus movimientos muestran gastos por ~$${formatBudgetClp(context.totalOutflows)}${context.totalInflows > 0 ? ` e ingresos por ~$${formatBudgetClp(context.totalInflows)}` : ''}.`,
    );
  }
  const suggestion = buildBudgetRowSuggestions(rows, context)[0];
  if (introParts.length === 0) return question;
  const intro = introParts.slice(0, 2).join(' ');
  if (focusRow && suggestion && suggestion.rowId === focusRow.id) {
    return `${intro} ${question}`.trim();
  }
  return `${intro} Empecemos por lo esencial: ${question}`.trim();
}

export function buildSuggestionFollowUp(
  suggestions: BudgetRowSuggestion[],
  context: BudgetAssistantContext,
  rows: BudgetRow[],
): { reply: string; followUp: string; focusRowId: string | null; actions: BudgetRowSuggestion[] } | null {
  const top = suggestions[0];
  if (!top) return null;

  if (top.kind === 'add') {
    return {
      reply: `Idea: sumar "${top.category}" por ~$${formatBudgetClp(top.suggestedAmount)} (${top.reason})`,
      followUp: `¿Quieres que dejemos "${top.category}" en ~$${formatBudgetClp(top.suggestedAmount)}? Responde sí o indica otro monto.`,
      focusRowId: top.rowId,
      actions: [top],
    };
  }

  const row = rows.find((item) => canonicalBudgetRowId(item.id) === top.rowId);
  if (!row) return null;
  return {
    reply: `Idea: ajustar ${row.category} de $${formatBudgetClp(Number(row.amount ?? 0))} a ~$${formatBudgetClp(top.suggestedAmount)} según movimientos.`,
    followUp: `¿Ajustamos ${row.category} a ~$${formatBudgetClp(top.suggestedAmount)}? Responde sí o indica otro monto.`,
    focusRowId: top.rowId,
    actions: [top],
  };
}

export function suggestionToAction(suggestion: BudgetRowSuggestion): Record<string, unknown> {
  return {
    kind: suggestion.kind,
    id: suggestion.rowId,
    category: suggestion.category,
    type: suggestion.type,
    amount: suggestion.suggestedAmount,
    cadence: suggestion.type === 'income' ? 'fixed' : 'variable',
    payment_method: suggestion.type === 'income' ? 'transfer' : 'debit',
    movement_type: suggestion.movementType,
  };
}

export function isAffirmativeSuggestionAnswer(answer: string): boolean {
  const text = String(answer ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return /^(si|sí|ok|dale|listo|ya|confirmo|confirmar|de acuerdo|perfecto|usemos|dejalo|dejemos|ajusta|ajustalo)$/.test(text);
}

/** Resuelve el monto implícito cuando el usuario confirma con "sí" u otra respuesta afirmativa. */
export function resolveBudgetAffirmativeAmount(input: {
  row: BudgetRow;
  context: BudgetAssistantContext;
  question?: string | null;
  suggestionAmount?: number | null;
}): number | null {
  const questionAmount = input.question ? extractAmountFromText(input.question) : null;
  if (questionAmount && questionAmount > 0) return questionAmount;

  const canonicalId = canonicalBudgetRowId(input.row.id);
  const memory = getChatMemoryForRow(input.context, canonicalId);
  const memoryAmount = memory ? extractAmountFromText(memory.a) : null;
  if (memoryAmount && memoryAmount > 0) return memoryAmount;

  if (canonicalId === 'income_salary') {
    const intakeAmount = input.context.intake.exactMonthlyIncome;
    if (intakeAmount && intakeAmount > 0) return intakeAmount;
    const bandAmount = incomeBandHint(input.context.intake.incomeBand);
    if (bandAmount && bandAmount > 0) return bandAmount;
  }

  const hint = rowHintFor(input.context, canonicalId);
  if (hint && hint.estimatedMonthly > 0) return hint.estimatedMonthly;

  if (input.suggestionAmount && input.suggestionAmount > 0) return input.suggestionAmount;

  return null;
}

export function buildContextualAdviceReply(context: BudgetAssistantContext, rows: BudgetRow[]): string {
  const suggestions = buildBudgetRowSuggestions(rows, context);
  if (suggestions.length > 0) {
    const top = suggestions[0];
    return `${top.reason} Mi sugerencia: ${top.kind === 'add' ? 'sumar' : 'ajustar'} ${top.category} cerca de $${formatBudgetClp(top.suggestedAmount)}.`;
  }
  if (context.totalOutflows > context.totalInflows && context.totalInflows > 0) {
    return `Tus movimientos muestran más salidas ($${formatBudgetClp(context.totalOutflows)}) que entradas ($${formatBudgetClp(context.totalInflows)}). Conviene priorizar vivienda, deuda y gastos variables.`;
  }
  const profileLine = intakeSnippet(context);
  return profileLine
    ? `${profileLine} Sigamos completando rubros vacíos para cerrar un presupuesto accionable.`
    : 'Sigamos completando rubros vacíos para cerrar un presupuesto accionable.';
}

export type BudgetWriterTurn =
  | 'init'
  | 'follow_up'
  | 'confirmation'
  | 'suggestion'
  | 'education'
  | 'status'
  | 'advice'
  | 'off_topic';

export function normalizeBudgetLooseText(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s$.,/+%-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const BUDGET_DOMAIN_RE =
  /\b(presupuesto|ingreso|ingresos|gasto|gastos|arriendo|vivienda|comida|aliment|transporte|deuda|cuota|cuotas|sueldo|salario|liquido|neto|fijo|fija|variable|monto|balance|cartola|movimiento|movimientos|rubro|filas?|tabla|categoria|recurrencia|cadencia|debito|credito|transferencia|efectivo|elimina|borrar|agregar|agrega|ajusta|confirmo|confirmar|dividendo|servicios?|ahorro|bencina|supermercado)\b/;

/** Pregunta educativa acotada al dominio presupuesto (fijo/variable, rubros, etc.). */
export function isBudgetEducationalQuestion(answer: string): boolean {
  const text = normalizeBudgetLooseText(answer);
  if (!text) return false;
  const financialConcept =
    /\b(fijo|fija|variable|fijos|variables|ingreso|ingresos|gasto|gastos|recurrencia|cadencia|balance|presupuesto|monto|sueldo|salario)\b/.test(
      text,
    );
  const definitional =
    /\b(que es|que era|que son|que significa|explicame|explicar|explicas|explica|define|definicion|diferencia|como funciona)\b/.test(
      text,
    );
  const confusion = /\b(no entiendo|no comprendo|ayuda)\b/.test(text) && financialConcept;
  return (definitional && financialConcept) || confusion;
}

/** Mensaje claramente fuera del dominio de edición de la tabla presupuesto. */
export function isBudgetOffTopicAnswer(answer: string): boolean {
  const text = normalizeBudgetLooseText(answer);
  if (!text || text.length < 8) return false;
  if (isBudgetEducationalQuestion(answer)) return false;
  if (isBudgetSkipAnswer(answer)) return false;
  if (extractAmountFromText(answer)) return false;
  if (BUDGET_DOMAIN_RE.test(text)) return false;
  if (
    /\b(elimina|eliminar|borra|borrar|quita|quitar|agrega|agregar|ajusta|ajustar|ponlo|dejalo|dejemos|confirmo|confirmar)\b/.test(
      text,
    )
  ) {
    return false;
  }
  if (/^(hola|buenas|hello|hi|ola)\b/.test(text)) return false;

  const looksLikeQuestion =
    /\?$/.test(answer.trim()) ||
    /\b(que|cual|como|porque|por que|cuando|donde|quien|cuantos|cuantas|cuanto|cuanta|oye|cuentame|hablame)\b/.test(
      text,
    );
  const topicShift = /\b(hablemos|prefiero|cambiemos|otra cosa|da lata|aburrido|aburre|cansado)\b/.test(text);
  const unrelatedCue =
    /\b(nasa|spacex|satelite|orbita|futbol|madrid|barcelona|japon|viaje|viajar|fisica|cuantica|cuerdas|partido|pelicula|serie|universo|marte|luna|clima|politica|presidente|bitcoin|crypto|iphone|android|receta|cocina|mascota|perro|gato|inflacion)\b/.test(
      text,
    );

  return looksLikeQuestion || topicShift || unrelatedCue;
}

const OFF_TOPIC_BRIEF_PATTERNS: Array<{ test: RegExp; brief: string }> = [
  {
    test: /\bnasa\b|\bsatelite|\borbita\b/,
    brief:
      'La NASA opera cientos de satélites activos entre científicos, de comunicaciones y de observación terrestre.',
  },
  {
    test: /\binflacion\b/,
    brief:
      'La inflación mide cuánto suben los precios en el tiempo; en Chile el Banco Central la vigila con una meta cercana al 3% anual.',
  },
  {
    test: /\b(teoria de cuerdas|fisica cuantica|cuantica)\b/,
    brief:
      'La física cuántica describe partículas muy pequeñas; la teoría de cuerdas es un marco aún no confirmado que busca unificar fuerzas.',
  },
  {
    test: /\b(real madrid|barcelona|futbol|partido)\b/,
    brief:
      'En fútbol, el resultado depende de forma, plantel y contexto del partido; no tengo el detalle del encuentro que mencionas.',
  },
  {
    test: /\b(japon|viaje|viajar)\b/,
    brief:
      'Japón es un destino con alta demanda turística; un viaje así conviene planificarlo con vuelos, alojamiento y gastos diarios.',
  },
  {
    test: /\bspacex\b/,
    brief: 'SpaceX es una empresa aeroespacial conocida por cohetes reutilizables y lanzamientos comerciales.',
  },
];

/** Respuesta breve determinística (1 frase) para temas fuera del presupuesto. */
export function resolveOffTopicBriefAnswer(answer: string): string {
  const text = normalizeBudgetLooseText(answer);
  for (const pattern of OFF_TOPIC_BRIEF_PATTERNS) {
    if (pattern.test.test(text)) return pattern.brief;
  }
  const cue = extractUserAnswerCue(answer);
  if (cue) return `Sobre "${cue.slice(0, 48)}", no tengo aquí un dato preciso.`;
  return 'Entiendo tu pregunta, aunque este chat está enfocado en tu presupuesto.';
}

export function buildOffTopicBriefReply(input: {
  rows: BudgetRow[];
  focusRow: BudgetRow | null;
  context: BudgetAssistantContext;
  briefAnswer: string;
}): { reply: string; followUp: string; focusRowId: string | null } {
  const focus = input.focusRow ?? pickContextualFocusRow(input.rows, input.context);
  const brief = input.briefAnswer.trim();
  const reply = `${brief} Volvamos a tu presupuesto.`;
  const followUp = buildContextualQuestion(focus, input.context);
  return { reply, followUp, focusRowId: focus?.id ?? null };
}

function normalizeAnswerEcho(answer: string): string {
  return String(answer ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 90);
}

/** Fragmento semántico del mensaje del usuario, sin montos ni muletillas. */
export function extractUserAnswerCue(answer: string): string | null {
  let text = normalizeAnswerEcho(answer)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  text = text
    .replace(/\$|\bclp\b/gi, ' ')
    .replace(/[+-]?\d[\d.,\s]{0,18}(?:\s*(?:k|mil|m|mm|millones?))?/gi, ' ')
    .replace(/\b(si|sí|no|ok|ya|mm|ah|bueno|dale|claro|perfecto)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length < 6) return null;
  return text.slice(0, 56);
}

export const BUDGET_GENERIC_OPENER_RE =
  /^(perfecto|claro|listo|entendido|genial|excelente|buen[ií]simo|dale|ok|va|bien|de acuerdo)[,.\s!¡—-]+/i;

export function startsWithBudgetGenericOpener(text: string): boolean {
  return BUDGET_GENERIC_OPENER_RE.test(String(text ?? '').trim());
}

export function buildBudgetAcknowledgmentReply(input: {
  userAnswer: string;
  row: BudgetRow;
  amount: number;
}): string {
  const amountLabel = `$${formatBudgetClp(input.amount)}`;
  const category = input.row.category.trim() || 'ese rubro';
  const categoryLower = category.toLowerCase();
  const cue = extractUserAnswerCue(input.userAnswer);

  if (cue) {
    if (input.row.id === 'income_salary') {
      return `Por “${cue}”, dejé ${amountLabel} como ingreso principal.`;
    }
    if (input.row.id === 'expense_food') {
      return `Según “${cue}”, ${categoryLower} queda en ${amountLabel} al mes.`;
    }
    if (input.row.id === 'expense_rent') {
      return `Con “${cue}”, vivienda quedó en ${amountLabel} mensuales.`;
    }
    if (input.row.id === 'expense_transport') {
      return `Por “${cue}”, transporte quedó en ${amountLabel} al mes.`;
    }
    if (input.row.id === 'expense_debt') {
      return `Según “${cue}”, deudas o cuotas quedaron en ${amountLabel} mensuales.`;
    }
    return `Con “${cue}”, ${categoryLower} quedó en ${amountLabel}.`;
  }

  const factual = [
    `${category} quedó en ${amountLabel}.`,
    `En la tabla, ${categoryLower} muestra ${amountLabel}.`,
    `${amountLabel} mensuales en ${categoryLower}.`,
  ];
  const idx = Math.abs(input.amount + category.length) % factual.length;
  return factual[idx];
}

export function buildCategoryClarificationReply(input: {
  userAnswer: string;
  row: BudgetRow;
}): { reply: string; followUp: string } {
  const cue = extractUserAnswerCue(input.userAnswer) ?? normalizeAnswerEcho(input.userAnswer);
  const category = input.row.category.trim() || 'este movimiento';
  const reply =
    cue.length >= 8
      ? `Entendí “${cue}” para «${category}».`
      : `Ajustemos «${category}» en la tabla.`;
  const followUp = buildBudgetMovementTypeValidationQuestion(input.row);
  return { reply, followUp };
}

export function buildReflectiveFallbackReply(input: {
  userAnswer: string;
  row: BudgetRow | null;
}): { reply: string; followUp: string } {
  const cue = extractUserAnswerCue(input.userAnswer);
  const category = input.row?.category?.toLowerCase() ?? 'ese rubro';
  const reply = cue
    ? `Con “${cue}” todavía me falta el monto en pesos para ${category}.`
    : `Para ${category} necesito un monto mensual concreto.`;
  const followUp = `¿Cuánto sería al mes para ${category}?`;
  return { reply, followUp };
}

export function buildBudgetWriterDigest(
  context: BudgetAssistantContext,
  focusRow: BudgetRow | null,
  userAnswer?: string,
): Record<string, unknown> {
  const hint = focusRow ? context.rowHints.get(focusRow.id) : null;
  const recentChat = context.chatAnswers.slice(-3).map((turn) => ({
    q: turn.q.slice(0, 140),
    a: turn.a.slice(0, 140),
  }));

  return {
    intake: {
      employmentStatus: context.intake.employmentStatus ?? null,
      exactMonthlyIncome: context.intake.exactMonthlyIncome ?? null,
      incomeBand: context.intake.incomeBand ?? null,
      hasDebt: context.intake.hasDebt ?? null,
      hasSavingsOrInvestments: context.intake.hasSavingsOrInvestments ?? null,
      snippet: context.intake.intakeContext?.slice(0, 180) ?? null,
    },
    transactions: {
      products: context.products.length,
      totalInflows: context.totalInflows,
      totalOutflows: context.totalOutflows,
      topCategories: context.products
        .flatMap((product) => product.topCategories ?? [])
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 4)
        .map((item) => ({ name: item.name, amount: item.amount })),
      unmapped: context.unmappedCategories.slice(0, 2).map((item) => ({
        name: item.name,
        amount: item.amount,
      })),
    },
    focus: focusRow
      ? {
          id: focusRow.id,
          category: focusRow.category,
          type: focusRow.type,
          currentAmount: focusRow.amount,
          transactionHint: hint?.estimatedMonthly ?? null,
          matchedCategories: hint?.matchedCategories?.slice(0, 3) ?? [],
        }
      : null,
    recentChat,
    userAnswer: userAnswer?.trim().slice(0, 220) ?? null,
  };
}
