import type { BudgetRow } from '@/lib/budget-rows.helpers';

export type BudgetTableStyleId = 'midnight' | 'ledger' | 'atelier' | 'terminal' | 'carbon';

export const BUDGET_TABLE_STYLES: Array<{ id: BudgetTableStyleId; label: string }> = [
  { id: 'midnight', label: 'Nocturno' },
  { id: 'ledger', label: 'Editorial' },
  { id: 'atelier', label: 'Atelier' },
  { id: 'terminal', label: 'Mercado' },
  { id: 'carbon', label: 'Carbono' },
];

export function getBudgetQuestionForId(rowId: string | null) {
  switch (rowId) {
    case 'income_salary':
      return '¿Cuál es tu ingreso mensual promedio en pesos?';
    case 'expense_rent':
      return '¿Cuánto pagas al mes en vivienda o arriendo?';
    case 'expense_food':
      return '¿Cuánto gastas mensualmente en alimentación?';
    case 'expense_services':
      return '¿Cuánto pagas al mes en servicios básicos o telefonía?';
    case 'expense_transport':
      return '¿Cuánto gastas mensualmente en transporte?';
    case 'expense_debt':
      return '¿Cuánto pagas al mes en deudas o cuotas?';
    case 'expense_savings':
      return '¿Cuánto ahorras o inviertes mensualmente?';
    case 'expense_other':
      return '¿Qué otro gasto mensual recurrente quieres agregar?';
    default:
      return '¿Cuál es tu ingreso mensual promedio en pesos?';
  }
}

export function normalizeActionRowId(rawId: unknown): string | null {
  const rowId = String(rawId ?? '').trim();
  if (!rowId) return null;
  return rowId.replace(/^expense[-_]custom[-_]?/i, 'expense-custom-');
}

export function getAssistantMessage(payload: {
  assistant_reply?: string;
  assistant_text?: string;
  source?: string;
  next_question?: string | null;
}) {
  const assistantReply =
    typeof payload.assistant_reply === 'string' && payload.assistant_reply.trim()
      ? payload.assistant_reply.trim()
      : '';
  if (assistantReply) return assistantReply;
  if (payload.source === 'deterministic_education' && payload.next_question === null) return '';
  const assistantText =
    typeof payload.assistant_text === 'string' && payload.assistant_text.trim()
      ? payload.assistant_text.trim()
      : '';
  return assistantText || null;
}

export function getNextQuestion(
  payload: {
    next_question?: string | null;
  },
  fallback: string,
) {
  if (payload.next_question === null) return '';
  const nextQuestion =
    typeof payload.next_question === 'string' && payload.next_question.trim()
      ? payload.next_question.trim()
      : '';
  return nextQuestion || fallback;
}

export function sanitizeBudgetQuestion(question: string) {
  return String(question ?? '').trim();
}

export function buildBudgetRowSummary(row: BudgetRow) {
  return {
    id: row.id,
    category: row.category,
    type: row.type,
    amount: row.amount,
    cadence: row.cadence ?? null,
    paymentMethod: row.paymentMethod ?? null,
    movementType: row.movementType ?? null,
  };
}
