import type { BudgetRow } from './budget-rows';
import { canonicalBudgetRowId, getEffectiveBudgetRows } from './budget-rows';
import { extractInferenceQuestionText, inferBudgetFocusRowId } from './budget-chat-focus';

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
    const inferred = inferBudgetFocusRowId(extractInferenceQuestionText(turn.q) || turn.q);
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

export function buildContextualQuestion(row: BudgetRow | null, context: BudgetAssistantContext): string {
  if (!row) return '¿Cuánto es tu ingreso principal mensual?';

  const hint = rowHintFor(context, row.id);
  const memory = getChatMemoryForRow(context, row.id);
  const memoryAmount = memory ? extractAmountFromText(memory.a) : null;

  if (memory && memoryAmount && Number(row.amount ?? 0) <= 0) {
    return `Antes mencionaste $${formatBudgetClp(memoryAmount)} para ${row.category.toLowerCase()}. ¿Lo confirmamos en la tabla?`;
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
        return `Según ${source}, tu ingreso principal ronda $${formatBudgetClp(reference)}. ¿Lo dejamos así?`;
      }
      return '¿Cuánto es tu ingreso principal mensual?';
    }
    case 'expense_rent':
      if (hint && hint.estimatedMonthly > 0) {
        return `En movimientos aparece ~$${formatBudgetClp(hint.estimatedMonthly)} en ${hint.matchedCategories.slice(0, 2).join(' / ')}. ¿Cuánto destinas al mes a vivienda o dividendo?`;
      }
      return '¿Cuánto pagas al mes en vivienda o dividendo?';
    case 'expense_food':
      if (hint && hint.estimatedMonthly > 0) {
        return `Tus cartolas muestran ~$${formatBudgetClp(hint.estimatedMonthly)} en ${hint.matchedCategories.slice(0, 2).join(' / ')}. ¿Lo tomamos como referencia de alimentación mensual?`;
      }
      return '¿Cuánto gastas al mes en comida y supermercado?';
    case 'expense_transport':
      if (hint && hint.estimatedMonthly > 0) {
        return `Veo ~$${formatBudgetClp(hint.estimatedMonthly)} en transporte/bencina en tus movimientos. ¿Cuánto presupuestas al mes?`;
      }
      return '¿Cuánto va al mes en transporte y bencina?';
    case 'expense_services':
      if (hint && hint.estimatedMonthly > 0) {
        return `En servicios e internet tus movimientos suman ~$${formatBudgetClp(hint.estimatedMonthly)}. ¿Confirmamos ese monto mensual?`;
      }
      return '¿Cuánto pagas al mes en servicios e internet?';
    case 'expense_debt': {
      if (context.intake.hasDebt && hint && hint.estimatedMonthly > 0) {
        return `Tu perfil indica deuda y en movimientos hay ~$${formatBudgetClp(hint.estimatedMonthly)} en cuotas/créditos. ¿Cuánto pagas al mes?`;
      }
      if (context.intake.hasDebt) {
        return 'Tu perfil indica deuda. ¿Cuánto pagas al mes en cuotas o créditos?';
      }
      if (hint && hint.estimatedMonthly > 0) {
        return `Detecté ~$${formatBudgetClp(hint.estimatedMonthly)} en cuotas/créditos. ¿Lo registramos como deuda mensual?`;
      }
      return '¿Cuánto pagas al mes en cuotas o créditos?';
    }
    case 'expense_savings':
      if (context.intake.hasSavingsOrInvestments) {
        return 'Tu perfil menciona ahorro o inversiones. ¿Cuánto apartas al mes de forma recurrente?';
      }
      return '¿Cuánto apartas al mes para ahorro o inversión?';
    case 'expense_other':
      if (context.unmappedCategories.length > 0) {
        const top = [...context.unmappedCategories].sort((a, b) => b.amount - a.amount)[0];
        return `En movimientos hay ~$${formatBudgetClp(top.amount)} en ${top.name}. ¿Quieres crear o ajustar una fila para eso?`;
      }
      return '¿Qué otro gasto mensual recurrente quieres reflejar en la tabla?';
    default:
      if (hint && hint.estimatedMonthly > 0) {
        return `Para ${row.category}, tus movimientos sugieren ~$${formatBudgetClp(hint.estimatedMonthly)}. ¿Confirmamos ese monto mensual?`;
      }
      return row.type === 'income'
        ? `¿Monto mensual de ${row.category || 'este ingreso'}?`
        : `¿Monto mensual de ${row.category || 'este gasto'}?`;
  }
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
    if (direct && Number(direct.amount ?? 0) <= 0) return direct;
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
  | 'advice';

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
