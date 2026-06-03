import { Router } from 'express';
import type { Request, Response } from 'express';
import OpenAI from 'openai';
import { asyncHandler } from '../middleware/errorHandler';
import { requireAuth } from '../middleware/auth';
import { getConfig } from '../config';

const router = Router();

type BudgetCadence = 'fixed' | 'variable' | 'oneoff';
type BudgetPaymentMethod = 'transfer' | 'debit' | 'credit' | 'cash' | 'prepaid' | 'other';
type BudgetMovementType =
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

type BudgetRow = {
  id: string;
  category: string;
  type: 'income' | 'expense';
  amount: number;
  note?: string;
  cadence?: BudgetCadence;
  paymentMethod?: BudgetPaymentMethod;
  movementType?: BudgetMovementType;
};

type BudgetActionDraft = {
  kind?: 'add' | 'update' | 'delete';
  id?: string;
  category?: string;
  type?: 'income' | 'expense';
  amount?: number;
  note?: string;
  cadence?: BudgetCadence;
  payment_method?: BudgetPaymentMethod;
  paymentMethod?: BudgetPaymentMethod;
  movement_type?: BudgetMovementType;
  movementType?: BudgetMovementType;
};

type BudgetAction =
  | {
      kind: 'delete';
      id: string;
    }
  | {
      kind: 'add' | 'update';
      id: string;
      category: string;
      type: 'income' | 'expense';
      amount: number;
      note?: string;
      cadence?: 'fixed' | 'variable';
      payment_method?: BudgetPaymentMethod;
      movement_type?: BudgetMovementType;
    };

type BudgetSnapshot = {
  income: number;
  expenses: number;
  balance: number;
  topExpense: BudgetRow | null;
  missingCoreRows: string[];
  filledRows: number;
};

type BudgetProductSummary = {
  label: string;
  bank: string;
  productType: string;
  dashboardSummary: string;
  alerts: string[];
  topCategories: string[];
};

const BUDGET_CHAT_TEXT_LIMIT = 220;
const BUDGET_CHAT_TIMEOUT_MS = 10_000;
const ANTHROPIC_API_VERSION = '2023-06-01';

function compactText(value: unknown, max = 240): string {
  return String(value ?? '')
    .trim()
    .slice(0, max);
}

function normalizeCadence(value: unknown, fallback: 'income' | 'expense' = 'expense'): 'fixed' | 'variable' {
  if (value === 'fixed') return 'fixed';
  if (value === 'variable') return 'variable';
  return fallback === 'income' ? 'fixed' : 'variable';
}

function normalizePaymentMethod(value: unknown): BudgetPaymentMethod | undefined {
  return value === 'transfer' ||
    value === 'debit' ||
    value === 'credit' ||
    value === 'cash' ||
    value === 'prepaid' ||
    value === 'other'
    ? (value as BudgetPaymentMethod)
    : undefined;
}

function normalizeMovementType(value: unknown): BudgetMovementType | undefined {
  const valid = [
    'income_main',
    'income_extra',
    'housing',
    'home_services',
    'food',
    'transport',
    'health',
    'education',
    'debt',
    'savings_investment',
    'taxes_fees',
    'leisure_other',
  ];
  return valid.includes(value as string) ? (value as BudgetMovementType) : undefined;
}

function normalizeLooseText(value: string) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s$.,/+-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatClp(value: number) {
  return Math.max(0, Math.round(Number(value) || 0)).toLocaleString('es-CL');
}

function normalizeRowId(value: unknown): string {
  return compactText(value, 80).replace(/^expense[-_]custom[-_]?/i, 'expense-custom-');
}

function slugifyRowPart(value: string) {
  return normalizeLooseText(value)
    .replace(/\b(de|del|la|el|los|las|por|para)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36);
}

function buildGeneratedRowId(type: 'income' | 'expense', category: string, rows: BudgetRow[]) {
  const base = `${type === 'income' ? 'income' : 'expense'}-custom-${slugifyRowPart(category) || 'item'}`;
  if (!rows.some((row) => normalizeRowId(row.id) === base)) return base;
  let idx = 2;
  while (rows.some((row) => normalizeRowId(row.id) === `${base}-${idx}`)) idx += 1;
  return `${base}-${idx}`;
}

function sanitizeBudgetRow(raw: unknown): BudgetRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  const id = normalizeRowId(item.id);
  const category = compactText(item.category, 80);
  const type = item.type === 'income' ? 'income' : item.type === 'expense' ? 'expense' : null;
  if (!id || !category || !type) return null;
  const amountNum = Number(item.amount ?? 0);
  return {
    id,
    category,
    type,
    amount: Number.isFinite(amountNum) ? Math.max(0, Math.round(amountNum)) : 0,
    note: compactText(item.note, 160) || undefined,
    cadence: normalizeCadence(item.cadence, type),
    paymentMethod: normalizePaymentMethod(item.paymentMethod),
    movementType: normalizeMovementType(item.movementType),
  };
}

function sanitizeBudgetRows(value: unknown, maxRows = 30): BudgetRow[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, maxRows)
    .map((row) => sanitizeBudgetRow(row))
    .filter((row): row is BudgetRow => Boolean(row));
}

function buildBudgetSnapshot(rows: BudgetRow[]): BudgetSnapshot {
  const income = rows
    .filter((r) => r.type === 'income')
    .reduce((sum, r) => sum + Math.max(0, r.amount), 0);
  const expenses = rows
    .filter((r) => r.type === 'expense')
    .reduce((sum, r) => sum + Math.max(0, r.amount), 0);
  const balance = income - expenses;
  const topExpense =
    rows
      .filter((r) => r.type === 'expense' && r.amount > 0)
      .sort((a, b) => b.amount - a.amount)[0] ?? null;
  const missingCoreRows = [
    !rows.some((r) => r.id === 'income_salary' && r.amount > 0) ? 'ingreso principal' : '',
    !rows.some((r) => r.id === 'expense_rent' && r.amount > 0) ? 'vivienda' : '',
    !rows.some((r) => r.id === 'expense_food' && r.amount > 0) ? 'alimentacion' : '',
    !rows.some((r) => r.id === 'expense_transport' && r.amount > 0) ? 'transporte' : '',
  ].filter(Boolean);

  return {
    income,
    expenses,
    balance,
    topExpense,
    missingCoreRows,
    filledRows: rows.filter((r) => r.amount > 0 || r.category.trim().length > 0).length,
  };
}

function detectBudgetIntent(answer: string): string {
  const text = normalizeLooseText(answer);
  if (!text) return 'unclear';
  if (/^(hola|hola hola|buenas|buenos dias|buen dia|buenas tardes|buenas noches|hello|hi|ola)\b/.test(text)) return 'greeting';
  if (/\b(elimina|eliminar|borra|borrar|quita|quitar|remove|delete|saca|sacar)\b/.test(text)) return 'delete_row';
  if (/\b(resumen|status|estado|como voy|balance|diagnostico|review)\b/.test(text)) return 'status_review';
  if (/\b(recomiendas|recomendar|conviene|mejor|optimizar|ahorrar|consejo)\b/.test(text)) return 'advice';
  if (/\b(agrega|agregar|anade|añade|incluye|incorpora|nuevo|nueva|create|add)\b/.test(text)) return 'add_row';
  if (/\?$/.test(answer.trim()) || /\b(que|como|por que|cual|cuanto)\b/.test(text)) return 'question';
  if (/\d/.test(text)) return 'update_amount';
  return 'unclear';
}

function isMeaningfulBudgetCategory(value: string | null | undefined) {
  const normalized = normalizeLooseText(String(value ?? ''));
  if (!normalized) return false;
  if (normalized.length < 4) return false;
  if (/^[a-z]?\d+[a-z0-9\s-]*$/.test(normalized)) return false;
  if (/^(gasto|ingreso|item|fila|otro|otros)$/.test(normalized)) return false;
  return /[a-z]{3,}/.test(normalized);
}

function rowDisplayLabel(row: BudgetRow | null) {
  if (!row) return null;
  switch (row.id) {
    case 'income_salary':
      return 'tu ingreso principal';
    case 'income_extra':
      return 'tus ingresos extra';
    case 'expense_rent':
      return 'vivienda';
    case 'expense_food':
      return 'alimentacion';
    case 'expense_transport':
      return 'transporte';
    case 'expense_services':
      return 'servicios basicos';
    case 'expense_debt':
      return 'deudas y cuotas';
    case 'expense_savings':
      return 'ahorro o inversion';
    case 'expense_other':
      return 'otros gastos';
    default:
      return isMeaningfulBudgetCategory(row.category)
        ? row.category.trim().slice(0, 48)
        : row.type === 'income'
          ? 'este ingreso'
          : 'este gasto';
  }
}

function findBudgetFocusRow(rows: BudgetRow[], preferredRowId?: string | null): BudgetRow | null {
  if (preferredRowId) {
    const direct = rows.find((r) => normalizeRowId(r.id) === normalizeRowId(preferredRowId)) ?? null;
    if (direct) return direct;
  }
  return rows.find((r) => Number(r.amount ?? 0) <= 0) ?? rows[0] ?? null;
}

function buildQuestionForRow(row: BudgetRow | null, intakeData?: Record<string, unknown>, products?: BudgetProductSummary[]) {
  const hasDebtFromIntake = intakeData?.hasDebt === true || intakeData?.hasDebt === 'true';
  const hasSavingsFromIntake =
    intakeData?.hasSavingsOrInvestments === true || intakeData?.hasSavingsOrInvestments === 'true';
  const hasCreditProduct = (products ?? []).some((product) =>
    /credit|loan|mortgage|tarjeta|credito|consumer_loan|mortgage/i.test(
      `${product.productType} ${product.label} ${product.dashboardSummary}`,
    ),
  );

  if (!row) return 'Partamos por tu ingreso principal mensual y cómo entra hoy.';
  switch (row.id) {
    case 'income_salary':
      return intakeData?.exactMonthlyIncome
        ? `En tu intake aparece un ingreso cercano a $${formatClp(Number(intakeData.exactMonthlyIncome) || 0)}. ¿Lo dejamos como tu ingreso mensual actual o lo corregimos?`
        : 'Partamos por tu ingreso principal mensual y cómo entra hoy.';
    case 'income_extra':
      return '¿Tienes ingresos extra estables o variables que deban entrar al presupuesto?';
    case 'expense_rent':
      return '¿Cuánto pagas al mes en vivienda, arriendo o dividendo?';
    case 'expense_food':
      return '¿Cuánto se va al mes en supermercado, feria y comida fuera?';
    case 'expense_transport':
      return '¿Cuánto gastas al mes en transporte, bencina, Uber o peajes?';
    case 'expense_services':
      return '¿Cuánto pagas al mes en servicios basicos, internet y telefonia?';
    case 'expense_debt':
      if (hasDebtFromIntake || hasCreditProduct) {
        return 'Veo senales de deuda/productos de credito. ¿Cuanto pagas al mes en cuotas, tarjetas o creditos?';
      }
      return '¿Pagas deudas o cuotas mensuales que deban entrar al presupuesto?';
    case 'expense_savings':
      return hasSavingsFromIntake
        ? 'En tu intake marcas ahorro o inversion. ¿Cuanto apartas al mes y en que instrumento?'
        : '¿Cuanto quieres dejar fijo para ahorro o inversion cada mes?';
    default:
      return row.type === 'income'
        ? `Para ${rowDisplayLabel(row)}, dime el monto mensual y si entra fijo o variable.`
        : `Para ${rowDisplayLabel(row)}, dime monto, recurrencia y medio de pago.`;
  }
}

function summarizeIntakeContext(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {};
  const item = value as Record<string, unknown>;
  return {
    age: item.age,
    employmentStatus: item.employmentStatus,
    exactMonthlyIncome: item.exactMonthlyIncome,
    incomeBand: item.incomeBand,
    hasDebt: item.hasDebt,
    hasSavingsOrInvestments: item.hasSavingsOrInvestments,
  };
}

function sanitizeProducts(value: unknown): BudgetProductSummary[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 4).map((product) => {
    const raw = (product ?? {}) as Record<string, unknown>;
    return {
      label: compactText(raw.label, 80),
      bank: compactText(raw.bank, 60),
      productType: compactText(raw.productType, 40),
      dashboardSummary: compactText(raw.dashboardSummary, 180),
      alerts: Array.isArray(raw.alerts) ? raw.alerts.map((item) => compactText(item, 80)).filter(Boolean).slice(0, 3) : [],
      topCategories: Array.isArray(raw.topCategories)
        ? raw.topCategories
            .map((item) =>
              compactText(
                typeof item === 'object' && item !== null ? (item as Record<string, unknown>).name : item,
                40,
              ),
            )
            .filter(Boolean)
            .slice(0, 4)
        : [],
    };
  });
}

function buildBudgetFocusQuestion(
  rows: BudgetRow[],
  activeRow: BudgetRow | null,
  intakeData: Record<string, unknown>,
  products: BudgetProductSummary[],
  preferredRowId?: string | null,
) {
  const preferredFocusId = preferredRowId ?? hasMissingDebtOrSavings(rows, intakeData, products);
  const normalizedActiveRow =
    activeRow && (activeRow.id.startsWith('income_') || activeRow.id.startsWith('expense_') || isMeaningfulBudgetCategory(activeRow.category))
      ? activeRow
      : null;
  const focus =
    normalizedActiveRow ??
    findBudgetFocusRow(rows, preferredFocusId);
  return {
    focus,
    question: buildQuestionForRow(focus, intakeData, products),
  };
}

function hasMissingDebtOrSavings(
  rows: BudgetRow[],
  intakeData: Record<string, unknown>,
  products: BudgetProductSummary[],
): string | null {
  const hasDebtFromIntake = intakeData.hasDebt === true || intakeData.hasDebt === 'true';
  const hasSavingsFromIntake =
    intakeData.hasSavingsOrInvestments === true || intakeData.hasSavingsOrInvestments === 'true';
  const hasCreditProduct = products.some((product) =>
    /credit|loan|mortgage|tarjeta|credito|consumer_loan|mortgage/i.test(
      `${product.productType} ${product.label} ${product.dashboardSummary}`,
    ),
  );
  if ((hasDebtFromIntake || hasCreditProduct) && !rows.some((row) => row.id === 'expense_debt' && row.amount > 0)) {
    return 'expense_debt';
  }
  if (hasSavingsFromIntake && !rows.some((row) => row.id === 'expense_savings' && row.amount > 0)) {
    return 'expense_savings';
  }
  return null;
}

function fallbackInit(rows: BudgetRow[], intakeData: Record<string, unknown>, products: BudgetProductSummary[]) {
  const { focus, question } = buildBudgetFocusQuestion(rows, null, intakeData, products);
  return {
    ok: true,
    assistant_text: `Trabajemos el presupuesto juntos. Yo propongo cambios y tu los validas. ${question}`,
    assistant_reply: `Trabajemos el presupuesto juntos. Yo propongo cambios y tu los validas.`,
    next_question: question,
    focus_row_id: focus?.id ?? 'income_salary',
    done: false,
    coach_message: null,
    actions: [],
    action: null,
    source: 'deterministic_init',
    provider: 'deterministic',
  };
}

function fallbackReply(
  rows: BudgetRow[],
  activeRow: BudgetRow | null,
  intakeData: Record<string, unknown>,
  products: BudgetProductSummary[],
  source = 'fallback_reply',
) {
  const { focus, question } = buildBudgetFocusQuestion(rows, activeRow, intakeData, products);
  return {
    ok: true,
    assistant_text: question,
    assistant_reply: 'Vamos fila por fila hasta dejar el presupuesto bien cerrado.',
    next_question: question,
    focus_row_id: focus?.id ?? null,
    done: false,
    coach_message: null,
    actions: [],
    action: null,
    source,
    provider: 'deterministic',
  };
}

function buildGreetingReply(
  rows: BudgetRow[],
  activeRow: BudgetRow | null,
  intakeData: Record<string, unknown>,
  products: BudgetProductSummary[],
) {
  const { focus, question } = buildBudgetFocusQuestion(rows, activeRow, intakeData, products);
  return {
    ok: true,
    assistant_text: `Hola. Vamos armando el presupuesto juntos, fila por fila. ${question}`,
    assistant_reply: 'Hola. Te ayudo a cerrar un presupuesto claro y util.',
    next_question: question,
    focus_row_id: focus?.id ?? 'income_salary',
    done: false,
    coach_message: null,
    actions: [],
    action: null,
    source: 'deterministic_greeting',
    provider: 'deterministic',
  };
}

function sanitizeActionDraft(raw: BudgetActionDraft | null | undefined): BudgetActionDraft | null {
  if (!raw || typeof raw !== 'object') return null;
  const amountNum = raw.amount === undefined ? undefined : Number(raw.amount);
  return {
    kind: raw.kind === 'delete' ? 'delete' : raw.kind === 'add' ? 'add' : 'update',
    id: normalizeRowId(raw.id),
    category: compactText(raw.category, 80) || undefined,
    type: raw.type === 'income' ? 'income' : raw.type === 'expense' ? 'expense' : undefined,
    amount: amountNum !== undefined && Number.isFinite(amountNum) ? Math.max(0, Math.round(amountNum)) : undefined,
    note: compactText(raw.note, 160) || undefined,
    cadence: raw.cadence === 'fixed' || raw.cadence === 'variable' ? raw.cadence : undefined,
    payment_method: normalizePaymentMethod(raw.payment_method ?? raw.paymentMethod),
    movement_type: normalizeMovementType(raw.movement_type ?? raw.movementType),
  };
}

function findRowByReference(
  rows: BudgetRow[],
  activeRow: BudgetRow | null,
  draft: BudgetActionDraft,
  answer: string,
): BudgetRow | null {
  if (draft.id) {
    const byId = rows.find((row) => normalizeRowId(row.id) === draft.id);
    if (byId) return byId;
  }
  if (draft.category) {
    const normalizedCategory = normalizeLooseText(draft.category);
    const byCategory = rows.find((row) => normalizeLooseText(row.category) === normalizedCategory);
    if (byCategory) return byCategory;
  }
  if (activeRow && /\d/.test(answer)) return activeRow;
  return null;
}

function coerceMovementTypeForRow(
  value: BudgetMovementType | undefined,
  rowType: 'income' | 'expense',
  category: string,
): BudgetMovementType {
  if (value) return value;
  const normalized = normalizeLooseText(category);
  if (rowType === 'income') return normalized.includes('extra') ? 'income_extra' : 'income_main';
  if (/arriendo|vivienda|dividendo|hipoteca/.test(normalized)) return 'housing';
  if (/luz|agua|gas|internet|telefono|servicio/.test(normalized)) return 'home_services';
  if (/super|comida|restaurante|delivery|feria/.test(normalized)) return 'food';
  if (/uber|metro|bus|bencina|peaje|transporte/.test(normalized)) return 'transport';
  if (/isapre|salud|farmacia|medic/.test(normalized)) return 'health';
  if (/colegio|universidad|curso|educa/.test(normalized)) return 'education';
  if (/cuota|credito|tarjeta|deuda|prestamo/.test(normalized)) return 'debt';
  if (/ahorro|apv|fondo|invert/.test(normalized)) return 'savings_investment';
  if (/impuesto|comision|fee|cargo/.test(normalized)) return 'taxes_fees';
  return 'leisure_other';
}

function mergeDraftWithExisting(
  kind: 'add' | 'update',
  existing: BudgetRow | null,
  draft: BudgetActionDraft,
  rows: BudgetRow[],
): BudgetAction | null {
  const type = draft.type ?? existing?.type;
  const category = draft.category ?? existing?.category;
  if (!type || !category) return null;
  const id = existing?.id ?? draft.id ?? buildGeneratedRowId(type, category, rows);
  return {
    kind,
    id: normalizeRowId(id),
    category,
    type,
    amount: draft.amount ?? existing?.amount ?? 0,
    note: draft.note ?? existing?.note,
    cadence: normalizeCadence(draft.cadence ?? existing?.cadence, type),
    payment_method:
      draft.payment_method ??
      existing?.paymentMethod ??
      (type === 'income' ? 'transfer' : 'debit'),
    movement_type: coerceMovementTypeForRow(
      draft.movement_type ?? existing?.movementType,
      type,
      category,
    ),
  };
}

function resolveSafeActions(
  rawActions: Array<BudgetActionDraft | null | undefined>,
  rows: BudgetRow[],
  activeRow: BudgetRow | null,
  answer: string,
): BudgetAction[] {
  const normalizedAnswer = normalizeLooseText(answer);
  const deleteIntent = /\b(elimina|eliminar|borra|borrar|quita|quitar|remove|delete|drop|saca|sacar)\b/i.test(
    normalizedAnswer,
  );
  const addIntent = /\b(agrega|agregar|anade|añade|incluye|incorpora|nuevo|nueva|create|add)\b/i.test(
    normalizedAnswer,
  );

  const result: BudgetAction[] = [];
  for (const raw of rawActions) {
    const draft = sanitizeActionDraft(raw);
    if (!draft) continue;

    const matchedRow = findRowByReference(rows, activeRow, draft, normalizedAnswer);
    if (draft.kind === 'delete') {
      if (deleteIntent && matchedRow?.id) result.push({ kind: 'delete', id: matchedRow.id });
      continue;
    }

    if (draft.kind === 'add') {
      const action = mergeDraftWithExisting(matchedRow ? 'update' : 'add', matchedRow, draft, rows);
      if (action) result.push(action);
      continue;
    }

    if (matchedRow) {
      const action = mergeDraftWithExisting('update', matchedRow, draft, rows);
      if (action) result.push(action);
      continue;
    }

    if (addIntent) {
      const action = mergeDraftWithExisting('add', null, draft, rows);
      if (action) result.push(action);
    }
  }

  return result;
}

function extractPaymentMethodFromText(text: string): BudgetPaymentMethod | undefined {
  const normalized = normalizeLooseText(text);
  if (/transfer/.test(normalized)) return 'transfer';
  if (/debito/.test(normalized)) return 'debit';
  if (/credito/.test(normalized)) return 'credit';
  if (/efectivo/.test(normalized)) return 'cash';
  if (/prepago/.test(normalized)) return 'prepaid';
  return undefined;
}

function extractCadenceFromText(text: string): 'fixed' | 'variable' | undefined {
  const normalized = normalizeLooseText(text);
  if (/\b(fijo|fija|mensual estable|todos los meses)\b/.test(normalized)) return 'fixed';
  if (/\b(variable|varia|ocasional|no siempre)\b/.test(normalized)) return 'variable';
  return undefined;
}

function extractClpAmount(text: string): number | null {
  const normalized = text
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
  if (multiplierTag === 'k' || multiplierTag === 'mil') multiplier = 1_000;
  if (multiplierTag === 'm' || multiplierTag === 'mm' || multiplierTag.startsWith('millon')) multiplier = 1_000_000;
  return Math.max(0, Math.round(value * multiplier));
}

function buildDeterministicUpdate(
  rows: BudgetRow[],
  activeRow: BudgetRow | null,
  answer: string,
  intakeData: Record<string, unknown>,
  products: BudgetProductSummary[],
) {
  if (!activeRow) return null;
  const amount = extractClpAmount(answer);
  if (amount === null) return null;
  const action: BudgetAction = {
    kind: 'update',
    id: activeRow.id,
    category: activeRow.category,
    type: activeRow.type,
    amount,
    note: activeRow.note,
    cadence: normalizeCadence(extractCadenceFromText(answer) ?? activeRow.cadence, activeRow.type),
    payment_method:
      extractPaymentMethodFromText(answer) ??
      activeRow.paymentMethod ??
      (activeRow.type === 'income' ? 'transfer' : 'debit'),
    movement_type: coerceMovementTypeForRow(activeRow.movementType, activeRow.type, activeRow.category),
  };

  const projectedRows = rows.map((row) => (row.id === activeRow.id ? { ...row, amount } : row));
  const { focus, question } = buildBudgetFocusQuestion(projectedRows, null, intakeData, products);
  return {
    ok: true,
    assistant_text: `Actualicé ${activeRow.category} a $${formatClp(amount)}. ${question}`,
    assistant_reply: `Actualicé ${activeRow.category} a $${formatClp(amount)}.`,
    next_question: question,
    focus_row_id: focus?.id ?? activeRow.id,
    done: false,
    coach_message: null,
    actions: [action],
    action,
    source: 'deterministic_update',
    provider: 'deterministic',
  };
}

function buildStatusReply(
  rows: BudgetRow[],
  intakeData: Record<string, unknown>,
  products: BudgetProductSummary[],
) {
  const snapshot = buildBudgetSnapshot(rows);
  const margin =
    snapshot.income > 0 ? Math.round((snapshot.balance / Math.max(1, snapshot.income)) * 100) : 0;
  const biggest = snapshot.topExpense
    ? `Tu mayor gasto es ${snapshot.topExpense.category} por $${formatClp(snapshot.topExpense.amount)}.`
    : 'Todavía no hay un gasto dominante claro.';
  const { focus, question } = buildBudgetFocusQuestion(rows, null, intakeData, products);
  return {
    ok: true,
    assistant_text: `Hoy vas con ingresos por $${formatClp(snapshot.income)}, gastos por $${formatClp(snapshot.expenses)} y balance ${snapshot.balance >= 0 ? 'positivo' : 'negativo'} de $${formatClp(Math.abs(snapshot.balance))}. ${biggest}`,
    assistant_reply: `Hoy vas con ingresos por $${formatClp(snapshot.income)}, gastos por $${formatClp(snapshot.expenses)} y un margen de ${margin}% sobre ingreso.`,
    next_question: question,
    focus_row_id: focus?.id ?? null,
    done: false,
    coach_message:
      snapshot.missingCoreRows.length > 0
        ? `Aun faltan datos base: ${snapshot.missingCoreRows.join(', ')}.`
        : null,
    actions: [],
    action: null,
    source: 'deterministic_status',
    provider: 'deterministic',
  };
}

function buildPrompt(params: {
  isInit: boolean;
  rows: BudgetRow[];
  activeRow: BudgetRow | null;
  answer: string;
  question: string;
  snapshot: BudgetSnapshot;
  detectedIntent: string;
  intakeContext: string;
  intakeData: Record<string, unknown>;
  products: BudgetProductSummary[];
  chatHistory: string;
}) {
  const allowedIds = params.rows.map((row) => row.id);
  return [
    params.isInit
      ? 'Inicia un chat simple de coedicion de presupuesto.'
      : 'Responde como copiloto de presupuesto. Conversa y propone cambios concretos cuando corresponda.',
    'Objetivo: dejar un presupuesto mensual lo mas completo y util posible con el menor costo de tokens.',
    'Reglas:',
    '- Devuelve SOLO JSON valido.',
    '- Puedes devolver varias acciones en actions.',
    '- Si la fila ya existe, usa su id exacto y solo cambia lo necesario.',
    '- Para update puedes omitir campos no modificados; el backend completa el resto.',
    '- Para add incluye al menos category y type. Si no sabes el id, dejalo vacio.',
    '- Para delete solo si el usuario lo pidio explicitamente.',
    '- No inventes montos. Si faltan, responde y pide el dato exacto.',
    '- assistant_reply: 1-2 frases, max 55 palabras.',
    '- next_question: una sola pregunta util o null.',
    '- focus_row_id: usa un id existente si quieres enfocar una fila.',
    'JSON:',
    '{"assistant_reply":"string","next_question":"string|null","focus_row_id":"string|null","done":false,"coach_message":"string|null","actions":[{"kind":"add|update|delete","id":"string opcional","category":"string opcional","type":"income|expense opcional","amount":123 opcional,"cadence":"fixed|variable opcional","payment_method":"transfer|debit|credit|cash|prepaid|other opcional","movement_type":"income_main|income_extra|housing|home_services|food|transport|health|education|debt|savings_investment|taxes_fees|leisure_other opcional","note":"string opcional"}]}',
    `Intento detectado: ${params.detectedIntent}`,
    `Estado actual: ingresos $${formatClp(params.snapshot.income)}, gastos $${formatClp(params.snapshot.expenses)}, balance $${formatClp(Math.abs(params.snapshot.balance))}${params.snapshot.balance < 0 ? ' deficit' : ' superavit'}.`,
    `Filas actuales: ${JSON.stringify(params.rows.slice(0, 20))}`,
    `IDs existentes: ${JSON.stringify(allowedIds)}`,
    params.activeRow ? `Fila activa: ${JSON.stringify(params.activeRow)}` : '',
    params.intakeContext ? `Contexto intake: ${params.intakeContext}` : '',
    Object.keys(params.intakeData).length > 0 ? `Datos intake estructurados: ${JSON.stringify(params.intakeData)}` : '',
    params.products.length > 0 ? `Productos: ${JSON.stringify(params.products)}` : '',
    params.chatHistory ? `Historial reciente:\n${params.chatHistory}` : '',
    !params.isInit && params.question ? `Ultimo mensaje del asistente: ${params.question}` : '',
    !params.isInit && params.answer ? `Mensaje del usuario: ${params.answer}` : '',
    params.isInit
      ? 'Arranca con una pregunta concreta guiada por intake/productos/filas vacias.'
      : 'Si el usuario quiere consejo o duda conceptual, responde bien y luego sugiere el siguiente dato a cerrar.',
  ]
    .filter(Boolean)
    .join('\n');
}

async function createAnthropicBudgetReply(params: {
  model: string;
  apiKey: string;
  system: string;
  prompt: string;
}) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': params.apiKey,
      'anthropic-version': ANTHROPIC_API_VERSION,
    },
    body: JSON.stringify({
      model: params.model,
      max_tokens: 260,
      temperature: 0.1,
      system: params.system,
      messages: [{ role: 'user', content: params.prompt }],
    }),
  });
  if (!response.ok) throw new Error(`Anthropic HTTP ${response.status}`);
  const payload = (await response.json()) as { content?: Array<{ type?: string; text?: string }> };
  const text = Array.isArray(payload.content)
    ? payload.content
        .filter((item) => item?.type === 'text' && typeof item.text === 'string')
        .map((item) => item.text)
        .join('\n')
        .trim()
    : '';
  return text || '{}';
}

router.post(
  '/',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const config = getConfig();
    const body = req.body as Record<string, unknown>;

    const intentRaw = compactText(body?.intent, 12).toLowerCase();
    const intent = intentRaw === 'init' || intentRaw === 'reply' ? intentRaw : null;
    if (!intent) {
      res.status(400).json({ ok: false, error: 'Invalid intent' });
      return;
    }

    const answer = compactText(body?.answer, 1200);
    const question = compactText(body?.question, 500);
    const rows = sanitizeBudgetRows(body?.budgetRows, 30);
    const activeRow = sanitizeBudgetRow(body?.activeRow);
    const intakeContext = compactText(body?.intakeContext, 600);
    const intakeData = summarizeIntakeContext(body?.intakeData);
    const products = sanitizeProducts(body?.products);
    const snapshot = buildBudgetSnapshot(rows);
    const detectedIntent = detectBudgetIntent(answer);
    const isInit = intent === 'init';

    const chatHistory = Array.isArray(body?.chatAnswers)
      ? (body.chatAnswers as Array<{ q: unknown; a: unknown }>)
          .slice(-6)
          .map(
            (pair, index) =>
              `Turno ${index + 1}\nAsistente: ${compactText(pair.q, 180)}\nUsuario: ${compactText(pair.a, 220)}`,
          )
          .join('\n')
      : '';

  const deterministicUpdate =
    !isInit && detectedIntent === 'update_amount'
      ? buildDeterministicUpdate(rows, activeRow, answer, intakeData, products)
      : null;
  if (deterministicUpdate) {
    res.json(deterministicUpdate);
    return;
  }

  if (!isInit && detectedIntent === 'greeting') {
    res.json(buildGreetingReply(rows, activeRow, intakeData, products));
    return;
  }

    if (!isInit && detectedIntent === 'status_review') {
      res.json(buildStatusReply(rows, intakeData, products));
      return;
    }

    const anthropicApiKey = config.ANTHROPIC_API_KEY;
    const openAiApiKey = config.OPENAI_API_KEY;
    const anthropicModel = config.ANTHROPIC_MODEL || 'claude-haiku-4-5';
    const openAiModel = 'gpt-4.1-mini';

    if (!anthropicApiKey && !openAiApiKey) {
      res.json(
        isInit
          ? fallbackInit(rows, intakeData, products)
          : { ...fallbackReply(rows, activeRow, intakeData, products, 'missing_provider_key'), source: 'missing_provider_key' },
      );
      return;
    }

    const systemMsg =
      'Eres un asistente de presupuesto chileno. Conversas breve, propones cambios seguros y trabajas en equipo con el usuario. Tu prioridad es dejar la tabla bien armada con el menor costo de tokens.';
    const prompt = buildPrompt({
      isInit,
      rows,
      activeRow,
      answer,
      question,
      snapshot,
      detectedIntent,
      intakeContext,
      intakeData,
      products,
      chatHistory,
    });

    let raw = '{}';
    let provider = 'fallback';
    try {
      raw = await Promise.race([
        (async () => {
          if (anthropicApiKey) {
            provider = 'anthropic';
            return createAnthropicBudgetReply({
              model: anthropicModel,
              apiKey: anthropicApiKey,
              system: systemMsg,
              prompt,
            });
          }
          provider = 'openai';
          const client = new OpenAI({ apiKey: openAiApiKey });
          const response = await client.chat.completions.create({
            model: openAiModel,
            response_format: { type: 'json_object' },
            max_completion_tokens: 320,
            messages: [
              { role: 'system', content: systemMsg },
              { role: 'user', content: prompt },
            ],
          });
          return response.choices[0]?.message?.content?.trim() ?? '{}';
        })(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), BUDGET_CHAT_TIMEOUT_MS),
        ),
      ]);
    } catch {
      res.json({
        ...(isInit ? fallbackInit(rows, intakeData, products) : fallbackReply(rows, activeRow, intakeData, products, 'model_failure')),
        model: anthropicApiKey ? anthropicModel : openAiModel,
        provider,
        source: 'model_failure',
      });
      return;
    }

    let parsed: {
      assistant_reply?: string;
      next_question?: string | null;
      focus_row_id?: string | null;
      done?: boolean;
      coach_message?: string | null;
      action?: BudgetActionDraft;
      update?: BudgetActionDraft;
      actions?: BudgetActionDraft[];
    };
    try {
      parsed = JSON.parse(raw) as typeof parsed;
    } catch {
      res.json({
        ...(isInit ? fallbackInit(rows, intakeData, products) : fallbackReply(rows, activeRow, intakeData, products, 'invalid_model_json')),
        model: anthropicApiKey ? anthropicModel : openAiModel,
        provider,
        source: 'invalid_model_json',
      });
      return;
    }

    const rawActions = Array.isArray(parsed.actions)
      ? parsed.actions
      : [parsed.action ?? parsed.update];
    const actions = resolveSafeActions(rawActions, rows, activeRow, answer);

    const projectedRows = actions.reduce<BudgetRow[]>((acc, action) => {
      if (action.kind === 'delete') return acc.filter((row) => row.id !== action.id);
      const exists = acc.some((row) => row.id === action.id);
      const nextRow: BudgetRow = {
        id: action.id,
        category: action.category,
        type: action.type,
        amount: action.amount,
        note: action.note,
        cadence: action.cadence,
        paymentMethod: action.payment_method,
        movementType: action.movement_type,
      };
      return exists
        ? acc.map((row) => (row.id === action.id ? { ...row, ...nextRow } : row))
        : [...acc, nextRow];
    }, rows);

    const fallbackFocus = buildBudgetFocusQuestion(
      projectedRows,
      null,
      intakeData,
      products,
      typeof parsed.focus_row_id === 'string' ? parsed.focus_row_id : activeRow?.id,
    );

    const assistantReply = compactText(
      parsed.assistant_reply ?? 'Propuse el siguiente ajuste para seguir cerrando el presupuesto.',
      220,
    );
    const nextQuestion =
      parsed.next_question === null
        ? null
        : compactText(parsed.next_question || fallbackFocus.question, BUDGET_CHAT_TEXT_LIMIT);
    const assistantText = compactText(
      [assistantReply, nextQuestion]
        .filter((item, index, items) => item && (index === 0 || item !== items[index - 1]))
        .join('\n'),
      BUDGET_CHAT_TEXT_LIMIT,
    );

    res.json({
      ok: true,
      assistant_text: assistantText || assistantReply,
      assistant_reply: assistantReply,
      next_question: nextQuestion,
      focus_row_id:
        typeof parsed.focus_row_id === 'string' && parsed.focus_row_id.trim()
          ? compactText(parsed.focus_row_id, 80)
          : fallbackFocus.focus?.id ?? null,
      done: Boolean(parsed.done),
      coach_message:
        typeof parsed.coach_message === 'string' ? compactText(parsed.coach_message, 180) : null,
      actions,
      action: actions[0] ?? null,
      model: provider === 'anthropic' ? anthropicModel : openAiModel,
      provider,
      source: 'model_assisted',
    });
  }),
);

export default router;
