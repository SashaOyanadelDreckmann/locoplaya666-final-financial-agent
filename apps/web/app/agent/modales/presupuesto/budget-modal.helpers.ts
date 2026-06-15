import type { BudgetRow } from '@/lib/presupuesto/filas.helpers';

export type BudgetTableStyleId = 'midnight' | 'ledger' | 'atelier' | 'terminal' | 'carbon';

export const DEFAULT_BUDGET_TABLE_STYLE: BudgetTableStyleId = 'carbon';

export type BudgetModalAssistantContextInput = {
  budgetRows: BudgetRow[];
  chatAnswers: Array<{ q: string; a: string }>;
};

export const BUDGET_TABLE_STYLES: Array<{ id: BudgetTableStyleId; label: string }> = [
  { id: 'carbon', label: 'Carbono' },
  { id: 'midnight', label: 'Nocturno' },
  { id: 'ledger', label: 'Editorial' },
  { id: 'atelier', label: 'Atelier' },
  { id: 'terminal', label: 'Mercado' },
];

/** Local fallback while the agent round-trip is in flight. */
export function getBudgetQuestionForRow(
  row: BudgetRow | null,
  contextInput: BudgetModalAssistantContextInput,
  fallbackRowId?: string | null,
): string {
  const resolvedRow =
    row ??
    contextInput.budgetRows.find((item) => item.id === fallbackRowId) ??
    contextInput.budgetRows[0] ??
    null;
  if (resolvedRow?.category?.trim()) {
    return `¿Qué quieres hacer con «${resolvedRow.category.trim()}» en la tabla?`;
  }
  return '¿Qué quieres cambiar en tu presupuesto?';
}

export function normalizeActionRowId(rawId: unknown): string | null {
  const rowId = String(rawId ?? '').trim();
  if (!rowId) return null;
  return rowId.replace(/^expense[-_]custom[-_]?/i, 'expense-custom-');
}

export function formatBudgetAssistantTurn(payload: {
  assistant_reply?: string;
  assistant_text?: string;
  source?: string;
  next_question?: string | null;
}): string {
  const reply = getAssistantMessage(payload);
  const nextQuestion = getNextQuestion(payload, '');
  if (reply && nextQuestion && !reply.includes(nextQuestion)) {
    return `${reply} ${nextQuestion}`.trim();
  }
  return reply || nextQuestion || '';
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
