import type { BudgetRow } from '@/lib/budget-rows.helpers';
import {
  buildBudgetAssistantContext,
  compactBudgetChatAnswers,
  type BudgetChatTurn,
  type BudgetProductSnapshot,
} from '@financial-agent/shared';

export type BudgetTableStyleId = 'midnight' | 'ledger' | 'atelier' | 'terminal' | 'carbon';

export const BUDGET_TABLE_STYLES: Array<{ id: BudgetTableStyleId; label: string }> = [
  { id: 'midnight', label: 'Nocturno' },
  { id: 'ledger', label: 'Editorial' },
  { id: 'atelier', label: 'Atelier' },
  { id: 'terminal', label: 'Mercado' },
  { id: 'carbon', label: 'Carbono' },
];

export function buildBudgetModalAssistantContext(input: {
  budgetRows: BudgetRow[];
  chatAnswers: Array<{ q: string; a: string }>;
  bankProducts?: Array<{
    label: string;
    bank: string;
    productType: string;
    dashboardSummary?: string;
    keyMetrics?: {
      inflows_total?: number;
      outflows_total?: number;
      net_flow?: number;
      movement_count?: number;
    };
    topCategories?: Array<{ name: string; amount: number }>;
    alerts?: string[];
  }>;
  sessionInfo?: {
    injectedIntake?: { intake?: Record<string, unknown>; intakeContext?: string } | null;
  } | null;
}) {
  const products: BudgetProductSnapshot[] = (input.bankProducts ?? []).map((product) => ({
    label: product.label,
    bank: product.bank,
    productType: product.productType,
    dashboardSummary: product.dashboardSummary,
    keyMetrics: product.keyMetrics,
    topCategories: product.topCategories,
    alerts: product.alerts,
  }));
  const chatAnswers: BudgetChatTurn[] = compactBudgetChatAnswers(input.chatAnswers, { maxTurns: 20 });
  return buildBudgetAssistantContext({
    rows: input.budgetRows,
    intakeData: input.sessionInfo?.injectedIntake?.intake ?? null,
    intakeContext: input.sessionInfo?.injectedIntake?.intakeContext ?? null,
    products,
    chatAnswers,
  });
}

/** Local fallback while the agent round-trip is in flight. */
export function getBudgetQuestionForRow(
  row: BudgetRow | null,
  contextInput: Parameters<typeof buildBudgetModalAssistantContext>[0],
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

/** @deprecated Use getBudgetQuestionForRow — kept for guard tests and legacy call sites. */
export function getBudgetQuestionForId(rowId: string | null, contextInput?: Parameters<typeof buildBudgetModalAssistantContext>[0]) {
  if (contextInput) {
    const row = contextInput.budgetRows.find((item) => item.id === rowId) ?? null;
    return getBudgetQuestionForRow(row, contextInput, rowId);
  }
  return getBudgetQuestionForRow(
    contextInput?.budgetRows.find((item) => item.id === rowId) ?? null,
    contextInput ?? { budgetRows: [], chatAnswers: [] },
    rowId,
  );
}

export function normalizeActionRowId(rawId: unknown): string | null {
  const rowId = String(rawId ?? '').trim();
  if (!rowId) return null;
  return rowId.replace(/^expense[-_]custom[-_]?/i, 'expense-custom-');
}

export type BudgetTranscriptEntry = {
  role: 'assistant' | 'user';
  text: string;
};

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
