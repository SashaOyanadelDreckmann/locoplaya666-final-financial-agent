import { Router } from 'express';
import { z } from 'zod';

import { asyncHandler } from '../middleware/errorHandler';
import { requireAuth } from '../middleware/auth';
import { fetchIndicador } from '../mcp/tools/market/mindicadorClient';
import { getConfig } from '../config';
import {
  mapBudgetSourceToWriterTurn,
  polishBudgetAssistantCopy,
  type BudgetWriterPolishInput,
} from '../services/budget-chat-writer.service';
import { planBudgetAssistantInit, planBudgetAssistantTurn } from '../services/budget-chat-planner.service';
import {
  BUDGET_MOVEMENT_TYPE_OPTIONS,
  DEFAULT_BUDGET_ROWS,
  buildBudgetAssistantContext,
  buildBudgetRowSuggestions,
  buildBudgetAcknowledgmentReply,
  buildCategoryClarificationReply,
  extractUserAnswerCue,
  buildContextualAdviceReply,
  buildContextualInitReply,
  buildContextualQuestion,
  buildReflectiveFallbackReply,
  buildSuggestionFollowUp,
  inferBudgetFieldFromQuestion,
  isBulkDeleteRequest,
  isBudgetSkipAnswer,
  parseBudgetCadenceFromAnswer,
  parseBudgetMovementFromAnswer,
  parseBudgetPaymentFromAnswer,
  pickNextBudgetRowFieldGap,
  canonicalBudgetRowId,
  computeBudgetCompletion,
  computeBudgetInsights,
  computeBudgetSignals,
  computeBudgetTotals,
  extractInferenceQuestionText,
  findBudgetRowByFocusId,
  formatBudgetClp,
  getEffectiveBudgetRows,
  inferBudgetFocusRowId,
  isAffirmativeSuggestionAnswer,
  isBareBudgetAmountAnswer,
  pickContextualFocusRow,
  reconcileBudgetRows,
  resolveBudgetChatTargetRow,
  summarizeBudgetActionBatch,
  normalizeBudgetCadence,
  validateBudgetTableActions,
  isBudgetConfirmationAnswer,
  isBudgetRejectionAnswer,
  buildPendingConfirmation,
  type BudgetTableAction,
  type BudgetAssistantContext,
  type BudgetChatTurn,
  type BudgetProductSnapshot,
  type BudgetRow,
} from '@financial-agent/shared';

const router = Router();

const BUDGET_CHAT_TEXT_LIMIT = 260;
const MARKET_SNAPSHOT_CACHE_MS = 5 * 60_000;
const MARKET_SNAPSHOT_SOFT_TIMEOUT_MS = 2_500;

type BudgetProduct = BudgetProductSnapshot;

const BudgetChatRequestSchema = z.object({
  intent: z.enum(['init', 'reply']),
  answer: z.string().trim().max(1200).default(''),
  question: z.string().trim().max(500).default(''),
  nextQuestion: z.string().trim().max(500).optional(),
  next_question: z.string().trim().max(500).optional(),
  budgetRows: z.array(z.record(z.unknown())).max(30).default([]),
  activeRow: z.record(z.unknown()).nullable().optional(),
  activeRowId: z.string().trim().max(120).nullable().optional(),
  chatAnswers: z.array(z.object({ q: z.string(), a: z.string() })).max(30).default([]),
  products: z.array(z.record(z.unknown())).max(8).default([]),
  manualFocusRowId: z.string().trim().max(120).nullable().optional(),
  assistantFocusRowId: z.string().trim().max(120).nullable().optional(),
  intakeContext: z.unknown().nullable().optional(),
  intakeData: z.unknown().nullable().optional(),
  pendingConfirmation: z
    .object({
      actions: z.array(z.record(z.unknown())).max(6),
      summary: z.string().trim().max(500),
    })
    .nullable()
    .optional(),
}).passthrough();

type BudgetChatRequest = z.infer<typeof BudgetChatRequestSchema>;

type MarketSnapshot = {
  uf: { value: number | null; unit: string | null; date: string | null; source: string | null };
  tpm: { value: number | null; unit: string | null; date: string | null; source: string | null };
  usd: { value: number | null; unit: string | null; date: string | null; source: string | null };
  summary: string;
};

type BudgetChatResponse = {
  ok: true;
  assistant_text: string;
  assistant_reply: string;
  next_question: string | null;
  focus_row_id: string | null;
  done: boolean;
  coach_message: null;
  actions: Array<Record<string, unknown>>;
  action: Record<string, unknown> | null;
  source: string;
  provider: 'deterministic' | 'hybrid' | 'planner';
  market_snapshot: MarketSnapshot;
  requires_confirmation?: boolean;
  pending_confirmation?: { actions: Array<Record<string, unknown>>; summary: string } | null;
};

function compactText(value: unknown, max = 240): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function normalizeLooseText(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s$.,/+%-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCadence(value: unknown, fallback: BudgetRow['type']): BudgetRow['cadence'] {
  if (value === 'fixed' || value === 'variable' || value === 'oneoff') return value;
  return fallback === 'income' ? 'fixed' : 'variable';
}

function normalizePaymentMethod(value: unknown): BudgetRow['paymentMethod'] | undefined {
  return value === 'transfer' ||
    value === 'debit' ||
    value === 'credit' ||
    value === 'cash' ||
    value === 'prepaid' ||
    value === 'other'
    ? value
    : undefined;
}

function normalizeMovementType(value: unknown): BudgetRow['movementType'] | undefined {
  const valid: BudgetRow['movementType'][] = [
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
  return valid.includes(value as BudgetRow['movementType']) ? (value as BudgetRow['movementType']) : undefined;
}

function sanitizeBudgetRow(raw: unknown): BudgetRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  const id = canonicalBudgetRowId(compactText(item.id, 80));
  const category = compactText(item.category, 80);
  const type = item.type === 'income' || item.type === 'expense' ? item.type : null;
  if (!id || !category || !type) return null;
  const amount = Number(item.amount ?? 0);
  return {
    id,
    category,
    type,
    amount: Number.isFinite(amount) ? Math.max(0, Math.round(amount)) : 0,
    parentId: typeof item.parentId === 'string' ? compactText(item.parentId, 80) || undefined : undefined,
    product: compactText(item.product, 80) || undefined,
    institution: compactText(item.institution, 60) || undefined,
    note: compactText(item.note, 160) || undefined,
    cadence: normalizeCadence(item.cadence, type),
    paymentMethod: normalizePaymentMethod(item.paymentMethod),
    movementType: normalizeMovementType(item.movementType),
    momentum:
      item.momentum === 'up' || item.momentum === 'steady' || item.momentum === 'down'
        ? item.momentum
        : undefined,
    strategy:
      item.strategy === 'shield' || item.strategy === 'review' || item.strategy === 'optimize'
        ? item.strategy
        : undefined,
  };
}

function sanitizeBudgetRows(value: unknown, maxRows = 30): BudgetRow[] {
  if (!Array.isArray(value)) return [];
  return reconcileBudgetRows(
    value
      .slice(0, maxRows)
      .map((row) => sanitizeBudgetRow(row))
      .filter((row): row is BudgetRow => Boolean(row)),
  );
}

function sanitizeProducts(value: unknown): BudgetProduct[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 4).map((product: unknown) => {
    const raw = (product ?? {}) as Record<string, unknown>;
    const keyMetricsRaw =
      raw.keyMetrics && typeof raw.keyMetrics === 'object'
        ? (raw.keyMetrics as Record<string, unknown>)
        : null;
    return {
      label: compactText(raw.label, 80),
      bank: compactText(raw.bank, 60),
      productType: compactText(raw.productType, 40),
      dashboardSummary: compactText(raw.dashboardSummary, 180),
      alerts: Array.isArray(raw.alerts) ? raw.alerts.map((item) => compactText(item, 80)).filter(Boolean).slice(0, 3) : [],
      topCategories: Array.isArray(raw.topCategories)
        ? raw.topCategories
            .map((item: unknown) => {
              if (!item || typeof item !== 'object') return null;
              return { name: compactText((item as Record<string, unknown>).name, 40), amount: Number((item as Record<string, unknown>).amount ?? 0) };
            })
            .filter((item): item is { name: string; amount: number } => Boolean(item && item.name))
            .slice(0, 6)
        : [],
      keyMetrics: keyMetricsRaw
        ? {
            inflows_total: Number(keyMetricsRaw.inflows_total ?? keyMetricsRaw.inflowsTotal ?? 0) || undefined,
            outflows_total: Number(keyMetricsRaw.outflows_total ?? keyMetricsRaw.outflowsTotal ?? 0) || undefined,
            net_flow: Number(keyMetricsRaw.net_flow ?? keyMetricsRaw.netFlow ?? 0) || undefined,
            movement_count: Number(keyMetricsRaw.movement_count ?? keyMetricsRaw.movementCount ?? 0) || undefined,
          }
        : undefined,
    };
  });
}

function buildMarketSummary(snapshot: MarketSnapshot): string {
  const parts = [
    snapshot.uf.value !== null ? `UF ${Number(snapshot.uf.value).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : null,
    snapshot.tpm.value !== null ? `TPM ${Number(snapshot.tpm.value).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%` : null,
    snapshot.usd.value !== null ? `USD/CLP ${Number(snapshot.usd.value).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : null,
  ].filter(Boolean);

  return parts.length > 0 ? `Mercado vivo hoy: ${parts.join(' · ')}.` : 'Mercado vivo no disponible en este intento.';
}

function emptyMarketSnapshot(): MarketSnapshot {
  return {
    uf: { value: null, unit: null, date: null, source: null },
    tpm: { value: null, unit: null, date: null, source: null },
    usd: { value: null, unit: null, date: null, source: null },
    summary: 'Mercado vivo no disponible en este intento.',
  };
}

let cachedMarketSnapshot: { at: number; data: MarketSnapshot } | null = null;

async function buildMarketSnapshot(): Promise<MarketSnapshot> {
  const [ufResult, tpmResult, usdResult] = await Promise.allSettled([
    fetchIndicador('uf'),
    fetchIndicador('tpm'),
    fetchIndicador('dolar'),
  ]);

  const mapResult = (result: PromiseSettledResult<Awaited<ReturnType<typeof fetchIndicador>>>) =>
    result.status === 'fulfilled'
      ? {
          value: result.value.valor ?? null,
          unit: result.value.unidad ?? null,
          date: result.value.fecha ?? null,
          source: result.value.url ?? null,
        }
      : { value: null, unit: null, date: null, source: null };

  const snapshot: MarketSnapshot = {
    uf: mapResult(ufResult),
    tpm: mapResult(tpmResult),
    usd: mapResult(usdResult),
    summary: '',
  };
  snapshot.summary = buildMarketSummary(snapshot);
  return snapshot;
}

async function getMarketSnapshotOptional(timeoutMs = MARKET_SNAPSHOT_SOFT_TIMEOUT_MS): Promise<MarketSnapshot> {
  try {
    if (cachedMarketSnapshot && Date.now() - cachedMarketSnapshot.at < MARKET_SNAPSHOT_CACHE_MS) {
      return cachedMarketSnapshot.data;
    }
    const snapshot = await Promise.race([
      buildMarketSnapshot(),
      new Promise<MarketSnapshot>((resolve) => {
        setTimeout(() => resolve(emptyMarketSnapshot()), timeoutMs);
      }),
    ]);
    cachedMarketSnapshot = { at: Date.now(), data: snapshot };
    return snapshot;
  } catch {
    return emptyMarketSnapshot();
  }
}

function formatClp(value: number): string {
  return formatBudgetClp(value);
}

function createAssistantContext(params: {
  rows: BudgetRow[];
  intakeData: unknown;
  intakeContext?: string | null;
  products: BudgetProduct[];
  chatAnswers: BudgetChatTurn[];
}): BudgetAssistantContext {
  return buildBudgetAssistantContext({
    rows: params.rows,
    intakeData: params.intakeData,
    intakeContext: params.intakeContext ?? null,
    products: params.products,
    chatAnswers: params.chatAnswers,
  });
}

function buildBudgetFocusQuestion(
  rows: BudgetRow[],
  activeRow: BudgetRow | null,
  context: BudgetAssistantContext,
  preferredRowId?: string | null,
) {
  const activeFromRows =
    activeRow && rows.some((row) => row.id === activeRow.id)
      ? rows.find((row) => row.id === activeRow.id) ?? activeRow
      : null;
  const focus =
    activeFromRows && pickNextBudgetRowFieldGap(activeFromRows)
      ? activeFromRows
      : pickContextualFocusRow(rows, context, preferredRowId ?? activeRow?.id ?? null);
  return {
    focus,
    question: buildContextualQuestion(focus, context),
  };
}

function buildBudgetSnapshot(rows: BudgetRow[]) {
  const effectiveRows = getEffectiveBudgetRows(rows);
  const totals = computeBudgetTotals(rows);
  const insights = computeBudgetInsights(rows, totals);
  const completion = computeBudgetCompletion(rows);
  const signals = computeBudgetSignals(rows, totals, insights.healthScore);
  const topExpense =
    effectiveRows
      .filter((row) => row.type === 'expense' && row.amount > 0)
      .sort((a, b) => b.amount - a.amount)[0] ?? null;

  const missingCoreRows = [
    !effectiveRows.some((row) => row.id === 'income_salary' && row.amount > 0) ? 'ingreso principal' : '',
    !effectiveRows.some((row) => row.id === 'expense_rent' && row.amount > 0) ? 'vivienda' : '',
    !effectiveRows.some((row) => row.id === 'expense_food' && row.amount > 0) ? 'alimentación' : '',
    !effectiveRows.some((row) => row.id === 'expense_transport' && row.amount > 0) ? 'transporte' : '',
  ].filter(Boolean);

  return {
    income: totals.income,
    expenses: totals.expenses,
    balance: totals.balance,
    topExpense,
    missingCoreRows,
    completion,
    insights,
    signals,
    filledRows: completion.filledRows,
  };
}

function detectBudgetIntent(answer: string) {
  const text = normalizeLooseText(answer);
  if (!text) return 'unclear';
  if (/\b(fijo|fija|variable|ingreso|gasto|balance|presupuesto|monto|sueldo|salario)\b/.test(text)) {
    if (/\b(que es|que significa|explica|explicame|diferencia|como funciona)\b/.test(text)) return 'education';
  }
  if (/\b(elimina|eliminar|borra|borrar|quita|quitar|remove|delete)\b/.test(text)) {
    return isBulkDeleteRequest(answer) ? 'delete_all' : 'delete_row';
  }
  if (/\b(resumen|status|estado|como voy|balance|diagnostico|review)\b/.test(text)) return 'status_review';
  if (/\b(recomiendas|recomendar|conviene|mejor|optimizar|ahorrar|consejo)\b/.test(text)) return 'advice';
  if (/\b(agrega|agregar|anade|añade|incluye|incorpora|nuevo|nueva|create|add)\b/.test(text)) return 'add_row';
  if (
    /\b(gasto|gastos|gastamos|pago|pagamos|destino|destinan|sale|van|va|cobra|cobra|cobran)\b/.test(text) &&
    /\b(comida|aliment|arriendo|vivienda|transporte|bencina|servicio|deuda|cuota|sueldo|salario|liquido|neto)\b/.test(
      text,
    )
  ) {
    return 'update_amount';
  }
  if (/\d/.test(text)) return 'update_amount';
  if (
    parseBudgetCadenceFromAnswer(answer) ||
    parseBudgetPaymentFromAnswer(answer) ||
    parseBudgetMovementFromAnswer(answer)
  ) {
    return 'update_field';
  }
  if (/\?$/.test(answer.trim()) || /\b(que|como|por que|cual|cuanto)\b/.test(text)) return 'question';
  if (/^(hola|buenas|hello|hi|ola)\b/.test(text)) return 'greeting';
  return 'unclear';
}

function isEducationalBudgetQuestion(answer: string) {
  const text = normalizeLooseText(answer);
  if (!text) return false;
  const financialConcept = /\b(fijo|fija|variable|fijos|variables|ingreso|ingresos|gasto|gastos|recurrencia|cadencia|balance|presupuesto|monto|sueldo|salario)\b/.test(text);
  const definitional = /\b(que es|que era|que son|que significa|explicame|explicar|explicas|explica|define|definicion|diferencia|como funciona)\b/.test(text);
  const confusion = /\b(no entiendo|no comprendo|ayuda)\b/.test(text) && financialConcept;
  return definitional || confusion;
}

function sanitizeQuestion(text: string | null | undefined): string | null {
  const value = compactText(text, 500);
  return value.length > 0 ? value : null;
}

function extractClpAmount(text: string): number | null {
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

function buildWriterPolishInput(params: {
  draft: BudgetChatResponse;
  context: BudgetAssistantContext;
  rows: BudgetRow[];
  userAnswer?: string;
}): BudgetWriterPolishInput | null {
  if (!params.draft.next_question) return null;
  const focusRow = params.draft.focus_row_id
    ? params.rows.find(
        (row) => canonicalBudgetRowId(row.id) === canonicalBudgetRowId(params.draft.focus_row_id as string),
      ) ?? null
    : null;
  return {
    turn: mapBudgetSourceToWriterTurn(params.draft.source),
    deterministicReply: params.draft.assistant_reply,
    deterministicQuestion: params.draft.next_question,
    focusRow,
    context: params.context,
    userAnswer: params.userAnswer,
  };
}

async function finalizeBudgetResponse(
  draft: BudgetChatResponse,
  polishInput: BudgetWriterPolishInput | null,
): Promise<BudgetChatResponse> {
  if (!polishInput) return draft;
  const polished = await polishBudgetAssistantCopy(polishInput);
  if (!polished) return draft;
  const reply = compactText(polished.reply, BUDGET_CHAT_TEXT_LIMIT);
  const nextQuestion = sanitizeQuestion(polished.question);
  if (!reply || !nextQuestion) return draft;
  return {
    ...draft,
    assistant_reply: reply,
    assistant_text: reply,
    next_question: nextQuestion,
    provider: 'hybrid',
  };
}

async function sendBudgetChatResponse(
  res: { json: (body: unknown) => unknown },
  draft: BudgetChatResponse,
  polishInput: BudgetWriterPolishInput | null,
  extras?: Partial<BudgetChatResponse>,
) {
  const payload = await finalizeBudgetResponse({ ...draft, ...extras }, polishInput);
  return res.json(payload);
}

function buildBudgetReply(input: {
  reply: string;
  followUp?: string | null;
  focus_row_id?: string | null;
  done?: boolean;
  actions?: Array<Record<string, unknown>>;
  action?: Record<string, unknown> | null;
  source: string;
  market_snapshot?: MarketSnapshot;
  provider?: BudgetChatResponse['provider'];
  requires_confirmation?: boolean;
  pending_confirmation?: { actions: Array<Record<string, unknown>>; summary: string } | null;
}): BudgetChatResponse {
  const followUp = sanitizeQuestion(input.followUp ?? null);
  const reply = compactText(input.reply, BUDGET_CHAT_TEXT_LIMIT);
  const requiresConfirmation = Boolean(input.requires_confirmation);
  const pending = input.pending_confirmation ?? null;
  const actions = requiresConfirmation ? [] : input.actions ?? [];
  return {
    ok: true,
    assistant_text: reply,
    assistant_reply: reply,
    next_question: followUp,
    focus_row_id: input.focus_row_id ?? null,
    done: Boolean(input.done),
    coach_message: null,
    actions,
    action: requiresConfirmation ? null : input.action ?? (actions[0] ?? null),
    source: input.source,
    provider: input.provider ?? 'deterministic',
    market_snapshot: input.market_snapshot ?? emptyMarketSnapshot(),
    requires_confirmation: requiresConfirmation,
    pending_confirmation: requiresConfirmation ? pending : null,
  };
}

function actionsToRecords(actions: BudgetTableAction[]): Array<Record<string, unknown>> {
  return actions.map((action) => ({ ...action }));
}

function buildConfirmationApplyReply(params: {
  actions: BudgetTableAction[];
  rows: BudgetRow[];
  context: BudgetAssistantContext;
  summary: string;
}): BudgetChatResponse {
  const { focus, question } = buildBudgetFocusQuestion(params.rows, null, params.context);
  return buildBudgetReply({
    reply: `Quedó aplicado: ${params.summary || summarizeBudgetActionBatch(params.actions)}.`,
    followUp: question,
    focus_row_id: focus?.id ?? params.actions[0]?.id ?? null,
    actions: actionsToRecords(params.actions),
    action: params.actions[0] ? { ...params.actions[0] } : null,
    source: 'deterministic_confirm_apply',
    provider: 'deterministic',
    market_snapshot: emptyMarketSnapshot(),
    requires_confirmation: false,
    pending_confirmation: null,
  });
}

function buildConfirmationRejectedReply(params: {
  rows: BudgetRow[];
  context: BudgetAssistantContext;
}): BudgetChatResponse {
  const { focus, question } = buildBudgetFocusQuestion(params.rows, null, params.context);
  return buildBudgetReply({
    reply: 'Sin problema, no aplico esos cambios.',
    followUp: question,
    focus_row_id: focus?.id ?? null,
    source: 'deterministic_confirm_reject',
    provider: 'deterministic',
    market_snapshot: emptyMarketSnapshot(),
    requires_confirmation: false,
    pending_confirmation: null,
  });
}

function buildPlannerChatReply(params: {
  plan: {
    next_question: string;
    focus_row_id: string | null;
    actions: BudgetTableAction[];
    requires_confirmation: boolean;
    pending_summary: string | null;
    source: string;
  };
  rows: BudgetRow[];
}): BudgetChatResponse {
  const pending =
    params.plan.requires_confirmation && params.plan.actions.length > 0
      ? buildPendingConfirmation(params.plan.actions, params.rows)
      : null;
  const appliedSummary =
    !params.plan.requires_confirmation && params.plan.actions.length > 0
      ? summarizeBudgetActionBatch(params.plan.actions)
      : null;
  return buildBudgetReply({
    reply: params.plan.pending_summary ?? appliedSummary ?? 'Sigamos con el siguiente rubro del presupuesto.',
    followUp: params.plan.next_question,
    focus_row_id: params.plan.focus_row_id,
    actions: params.plan.requires_confirmation ? [] : actionsToRecords(params.plan.actions),
    action: params.plan.requires_confirmation ? null : params.plan.actions[0] ? { ...params.plan.actions[0] } : null,
    source: params.plan.source,
    provider: 'planner',
    market_snapshot: emptyMarketSnapshot(),
    requires_confirmation: params.plan.requires_confirmation,
    pending_confirmation: pending,
  });
}

function findNextUnfilledBudgetRow(
  rows: BudgetRow[],
  context: BudgetAssistantContext,
  afterRowId?: string | null,
): BudgetRow | null {
  const unfilled = getEffectiveBudgetRows(rows).filter((row) => Number(row.amount ?? 0) <= 0);
  if (unfilled.length === 0) return rows[0] ?? null;
  if (!afterRowId) return pickContextualFocusRow(rows, context);
  const canonical = canonicalBudgetRowId(afterRowId);
  const currentIndex = unfilled.findIndex((row) => canonicalBudgetRowId(row.id) === canonical);
  const tail = currentIndex >= 0 ? unfilled.slice(currentIndex + 1) : unfilled;
  if (tail.length === 0) return unfilled[currentIndex] ?? null;
  return pickContextualFocusRow(tail, context) ?? tail[0] ?? null;
}

function appendSuggestionTip(
  rows: BudgetRow[],
  context: BudgetAssistantContext,
  reply: string,
  excludeRowId?: string | null,
): string {
  const suggestions = buildBudgetRowSuggestions(rows, context).filter(
    (item) => !excludeRowId || canonicalBudgetRowId(item.rowId) !== canonicalBudgetRowId(excludeRowId),
  );
  const top = suggestions[0];
  if (!top) return reply;
  const tip =
    top.kind === 'add'
      ? `Tip: podrías sumar ${top.category} (~$${formatClp(top.suggestedAmount)}).`
      : `Tip: ${top.category} podría quedar cerca de $${formatClp(top.suggestedAmount)} según movimientos.`;
  return compactText(`${reply} ${tip}`, BUDGET_CHAT_TEXT_LIMIT);
}

function buildDeterministicUpdate(params: {
  rows: BudgetRow[];
  answer: string;
  question: string;
  context: BudgetAssistantContext;
  assistantFocusRowId?: string | null;
  manualFocusRowId?: string | null;
  activeRow?: BudgetRow | null;
}) {
  let targetRow =
    resolveBudgetChatTargetRow(params.rows, extractInferenceQuestionText(params.question) || params.question, {
      manualFocusRowId: params.manualFocusRowId ?? null,
      assistantFocusRowId: params.assistantFocusRowId ?? null,
      activeRow: params.activeRow ?? null,
      answer: params.answer,
    }) ?? pickContextualFocusRow(params.rows, params.context);

  if (!targetRow && params.assistantFocusRowId) {
    const suggestion = buildBudgetRowSuggestions(params.rows, params.context).find(
      (item) => canonicalBudgetRowId(item.rowId) === canonicalBudgetRowId(params.assistantFocusRowId as string),
    );
    if (suggestion) {
      targetRow = {
        id: suggestion.rowId,
        category: suggestion.category,
        type: suggestion.type,
        amount: 0,
        movementType: suggestion.movementType,
      };
    }
  }
  if (!targetRow) return null;

  let amount = extractClpAmount(params.answer);
  if (amount === null && isAffirmativeSuggestionAnswer(params.answer)) {
    const hint = params.context.rowHints.get(canonicalBudgetRowId(targetRow.id));
    const suggestion = buildBudgetRowSuggestions(params.rows, params.context).find(
      (item) => canonicalBudgetRowId(item.rowId) === canonicalBudgetRowId(targetRow.id),
    );
    if (hint && hint.estimatedMonthly > 0) amount = hint.estimatedMonthly;
    else if (suggestion && suggestion.suggestedAmount > 0) amount = suggestion.suggestedAmount;
  }
  if (amount === null) return null;

  const rowExists = params.rows.some((row) => row.id === targetRow!.id);
  const action = {
    kind: rowExists ? 'update' : 'add',
    id: targetRow.id,
    category: targetRow.category,
    type: targetRow.type,
    amount,
    cadence: normalizeCadence(targetRow.cadence, targetRow.type),
    payment_method: targetRow.paymentMethod ?? (targetRow.type === 'income' ? 'transfer' : 'debit'),
    movement_type: targetRow.movementType ?? undefined,
  };
  const projectedRows = reconcileBudgetRows(
    rowExists
      ? params.rows.map((row) => (row.id === targetRow!.id ? { ...row, amount } : row))
      : [...params.rows, { ...targetRow, amount }],
  );
  const projectedContext = createAssistantContext({
    rows: projectedRows,
    intakeData: params.context.intake,
    intakeContext: params.context.intake.intakeContext ?? null,
    products: params.context.products,
    chatAnswers: params.context.chatAnswers,
  });
  const { focus, question } = buildBudgetFocusQuestion(projectedRows, null, projectedContext);
  return buildBudgetReply({
    reply: buildBudgetAcknowledgmentReply({
      userAnswer: params.answer,
      row: targetRow,
      amount,
    }),
    followUp: question,
    focus_row_id: focus?.id ?? targetRow.id,
    actions: [action],
    action,
    source: 'deterministic_update',
    market_snapshot: emptyMarketSnapshot(),
  });
}

function buildDeterministicFieldUpdate(params: {
  rows: BudgetRow[];
  answer: string;
  question: string;
  context: BudgetAssistantContext;
  assistantFocusRowId?: string | null;
  manualFocusRowId?: string | null;
  activeRow?: BudgetRow | null;
}) {
  const targetRow =
    resolveBudgetChatTargetRow(params.rows, extractInferenceQuestionText(params.question) || params.question, {
      manualFocusRowId: params.manualFocusRowId ?? null,
      assistantFocusRowId: params.assistantFocusRowId ?? null,
      activeRow: params.activeRow ?? null,
      answer: params.answer,
    }) ?? params.activeRow;
  if (!targetRow || Number(targetRow.amount ?? 0) <= 0) return null;

  const askedField = inferBudgetFieldFromQuestion(params.question);
  const cadence = parseBudgetCadenceFromAnswer(params.answer);
  const payment = parseBudgetPaymentFromAnswer(params.answer);
  const movement = parseBudgetMovementFromAnswer(params.answer);
  const patch: Partial<BudgetTableAction> = {};

  if (cadence && (!askedField || askedField === 'cadence')) {
    patch.cadence = normalizeBudgetCadence(cadence, targetRow.type);
  }
  if (payment && (!askedField || askedField === 'paymentMethod')) {
    patch.payment_method = payment;
  }
  if (movement && (!askedField || askedField === 'movementType')) {
    patch.movement_type = movement;
  }
  if (Object.keys(patch).length === 0) return null;

  const action: BudgetTableAction = {
    kind: 'update',
    id: targetRow.id,
    category: targetRow.category,
    type: targetRow.type,
    amount: Math.max(0, Math.round(Number(targetRow.amount ?? 0))),
    cadence: normalizeBudgetCadence(patch.cadence ?? targetRow.cadence, targetRow.type),
    payment_method:
      patch.payment_method ??
      targetRow.paymentMethod ??
      (targetRow.type === 'income' ? 'transfer' : 'debit'),
    movement_type: patch.movement_type ?? targetRow.movementType ?? undefined,
  };

  const projectedRows = reconcileBudgetRows(
    params.rows.map((row) =>
      row.id === targetRow.id
        ? {
            ...row,
            cadence: action.cadence,
            paymentMethod: action.payment_method,
            movementType: action.movement_type,
          }
        : row,
    ),
  );
  const projectedContext = createAssistantContext({
    rows: projectedRows,
    intakeData: params.context.intake,
    intakeContext: params.context.intake.intakeContext ?? null,
    products: params.context.products,
    chatAnswers: params.context.chatAnswers,
  });
  const updatedRow = projectedRows.find((row) => row.id === targetRow.id) ?? targetRow;
  const { focus, question } = buildBudgetFocusQuestion(projectedRows, updatedRow, projectedContext);
  const paymentLabel =
    patch.payment_method === 'transfer'
      ? 'transferencia'
      : patch.payment_method === 'debit'
        ? 'débito'
        : patch.payment_method === 'credit'
          ? 'crédito'
          : patch.payment_method === 'cash'
            ? 'efectivo'
            : patch.payment_method === 'prepaid'
              ? 'prepago'
              : null;
  const movementLabel = patch.movement_type
    ? BUDGET_MOVEMENT_TYPE_OPTIONS.find((item) => item.value === patch.movement_type)?.label?.toLowerCase()
    : null;
  const detail =
    patch.cadence === 'fixed'
      ? 'recurrencia fija'
      : patch.cadence === 'variable'
        ? 'recurrencia variable'
        : paymentLabel
          ? `pago con ${paymentLabel}`
          : movementLabel
            ? `tipo ${movementLabel}`
            : 'detalle';
  const cue = extractUserAnswerCue(params.answer);
  const reply = cue
    ? `Para ${updatedRow.category.toLowerCase()}, dejé ${detail} según “${cue}”.`
    : `Para ${updatedRow.category}, actualicé ${detail}.`;

  return buildBudgetReply({
    reply,
    followUp: question,
    focus_row_id: focus?.id ?? targetRow.id,
    actions: [action],
    action,
    source: 'deterministic_field_update',
    market_snapshot: emptyMarketSnapshot(),
  });
}

function buildBulkDeleteConfirmReply(params: { rows: BudgetRow[]; answer: string }) {
  const effectiveRows = getEffectiveBudgetRows(params.rows);
  const deleteActions = validateBudgetTableActions(
    effectiveRows.map((row) => ({ kind: 'delete' as const, id: row.id })),
    params.rows,
  );
  if (deleteActions.length === 0) return null;
  const pending = buildPendingConfirmation(deleteActions, params.rows);
  const cue = extractUserAnswerCue(params.answer);
  return buildBudgetReply({
    reply: cue
      ? `Puedo vaciar la tabla (${deleteActions.length} movimientos) como pediste en “${cue}”.`
      : `Puedo eliminar los ${deleteActions.length} movimientos actuales de la tabla.`,
    followUp: '¿Confirmas vaciar la tabla para empezar de cero?',
    focus_row_id: deleteActions[0]?.id ?? null,
    source: 'deterministic_delete_all_confirm',
    market_snapshot: emptyMarketSnapshot(),
    requires_confirmation: true,
    pending_confirmation: pending,
  });
}

function buildSingleDeleteConfirmReply(params: {
  rows: BudgetRow[];
  answer: string;
  question: string;
  context: BudgetAssistantContext;
  assistantFocusRowId?: string | null;
  manualFocusRowId?: string | null;
  activeRow?: BudgetRow | null;
}) {
  const targetRow =
    resolveBudgetChatTargetRow(params.rows, extractInferenceQuestionText(params.question) || params.question, {
      manualFocusRowId: params.manualFocusRowId ?? null,
      assistantFocusRowId: params.assistantFocusRowId ?? null,
      activeRow: params.activeRow ?? null,
      answer: params.answer,
    }) ?? pickContextualFocusRow(params.rows, params.context);
  if (!targetRow) return null;
  const deleteActions = validateBudgetTableActions([{ kind: 'delete', id: targetRow.id }], params.rows);
  if (deleteActions.length === 0) return null;
  const pending = buildPendingConfirmation(deleteActions, params.rows);
  return buildBudgetReply({
    reply: `Puedo eliminar ${targetRow.category} de la tabla.`,
    followUp: `¿Confirmas eliminar ${targetRow.category}?`,
    focus_row_id: targetRow.id,
    source: 'deterministic_delete_confirm',
    market_snapshot: emptyMarketSnapshot(),
    requires_confirmation: true,
    pending_confirmation: pending,
  });
}

function buildEducationReply(params: {
  answer: string;
  rows: BudgetRow[];
  activeRow: BudgetRow | null;
  context: BudgetAssistantContext;
}) {
  const { focus, question } = buildBudgetFocusQuestion(params.rows, params.activeRow, params.context);
  const normalized = normalizeLooseText(params.answer);
  const reply =
    /\b(fijo|fija|fijos)\b/.test(normalized) && /\b(variable|variables)\b/.test(normalized)
      ? 'Un ingreso fijo se repite con estabilidad; uno variable cambia mes a mes.'
      : /\b(fijo|fija|fijos)\b/.test(normalized)
        ? 'Un ingreso fijo es el que llega con regularidad y monto estable.'
        : /\b(variable|variables)\b/.test(normalized)
          ? 'Un ingreso variable cambia de monto o frecuencia entre meses.'
          : 'Un ingreso fijo se repite con estabilidad; uno variable cambia mes a mes.';

  return buildBudgetReply({
    reply,
    followUp: question,
    focus_row_id: focus?.id ?? params.activeRow?.id ?? null,
    source: 'deterministic_education',
    market_snapshot: emptyMarketSnapshot(),
  });
}

function buildGreetingReply(params: {
  rows: BudgetRow[];
  activeRow: BudgetRow | null;
  context: BudgetAssistantContext;
}) {
  const { focus, question } = buildBudgetFocusQuestion(params.rows, params.activeRow, params.context);
  const intro =
    params.context.products.length > 0
      ? 'Hola. Ya revisé tus movimientos y perfil para orientar el presupuesto.'
      : 'Hola. Partamos por tu ingreso principal y luego completamos los gastos base.';
  return buildBudgetReply({
    reply: intro,
    followUp: question,
    focus_row_id: focus?.id ?? params.activeRow?.id ?? 'income_salary',
    source: 'deterministic_greeting',
    market_snapshot: emptyMarketSnapshot(),
  });
}

function buildStatusReply(params: { rows: BudgetRow[]; context: BudgetAssistantContext }) {
  const snapshot = buildBudgetSnapshot(params.rows);
  const margin = snapshot.income > 0 ? Math.round((snapshot.balance / Math.max(1, snapshot.income)) * 100) : 0;
  const biggest = snapshot.topExpense
    ? `Mayor gasto: ${snapshot.topExpense.category} ($${formatClp(snapshot.topExpense.amount)}).`
    : '';
  const missing = snapshot.missingCoreRows.length > 0 ? `Faltan: ${snapshot.missingCoreRows.slice(0, 3).join(', ')}.` : '';
  const txLine =
    params.context.totalOutflows > 0
      ? ` Movimientos: entradas $${formatClp(params.context.totalInflows)}, salidas $${formatClp(params.context.totalOutflows)}.`
      : '';
  const { focus, question } = buildBudgetFocusQuestion(params.rows, null, params.context);
  return buildBudgetReply({
    reply: `Ingresos $${formatClp(snapshot.income)}, gastos $${formatClp(snapshot.expenses)}, margen ${margin}%. ${biggest} ${missing}${txLine}`.trim(),
    followUp: question,
    focus_row_id: focus?.id ?? null,
    source: 'deterministic_status',
    market_snapshot: emptyMarketSnapshot(),
    done: snapshot.signals.coreFillRate >= 100,
  });
}

function buildFallbackInit(params: { rows: BudgetRow[]; context: BudgetAssistantContext }) {
  const { focus, question } = buildBudgetFocusQuestion(params.rows, null, params.context, 'income_salary');
  const reply = buildContextualInitReply(params.rows, focus, question, params.context);
  return buildBudgetReply({
    reply,
    followUp: question,
    focus_row_id: focus?.id ?? 'income_salary',
    source: 'deterministic_init',
    market_snapshot: emptyMarketSnapshot(),
  });
}

function buildAdviceReply(params: { rows: BudgetRow[]; context: BudgetAssistantContext }) {
  const suggestions = buildBudgetRowSuggestions(params.rows, params.context);
  const packaged = buildSuggestionFollowUp(suggestions, params.context, params.rows);
  if (packaged) {
    return buildBudgetReply({
      reply: `${buildContextualAdviceReply(params.context, params.rows)} ${packaged.reply}`.trim(),
      followUp: packaged.followUp,
      focus_row_id: packaged.focusRowId,
      source: 'deterministic_advice',
      market_snapshot: emptyMarketSnapshot(),
    });
  }
  const { focus, question } = buildBudgetFocusQuestion(params.rows, null, params.context);
  return buildBudgetReply({
    reply: buildContextualAdviceReply(params.context, params.rows),
    followUp: question,
    focus_row_id: focus?.id ?? null,
    source: 'deterministic_advice',
    market_snapshot: emptyMarketSnapshot(),
  });
}

function buildConversationalFallback(params: {
  answer: string;
  rows: BudgetRow[];
  activeRow: BudgetRow | null;
  context: BudgetAssistantContext;
  question: string;
  assistantFocusRowId?: string | null;
  manualFocusRowId?: string | null;
}) {
  const detectedIntent = detectBudgetIntent(params.answer);
  const snapshot = buildBudgetSnapshot(params.rows);

  if (detectedIntent === 'delete_all') {
    const bulk = buildBulkDeleteConfirmReply({ rows: params.rows, answer: params.answer });
    if (bulk) return bulk;
  }

  if (detectedIntent === 'delete_row') {
    const single = buildSingleDeleteConfirmReply(params);
    if (single) return single;
  }

  if (detectedIntent === 'add_row') {
    const suggestions = buildBudgetRowSuggestions(params.rows, params.context);
    const packaged = buildSuggestionFollowUp(suggestions, params.context, params.rows);
    if (packaged) {
      return buildBudgetReply({
        reply: packaged.reply,
        followUp: packaged.followUp,
        focus_row_id: packaged.focusRowId,
        source: 'deterministic_add_suggestion',
        market_snapshot: emptyMarketSnapshot(),
      });
    }
    const { focus, question } = buildBudgetFocusQuestion(params.rows, params.activeRow, params.context);
    return buildBudgetReply({
      reply: 'Puedo proponerte filas según tus movimientos. Dime la categoría y monto que quieres sumar.',
      followUp: question,
      focus_row_id: focus?.id ?? params.activeRow?.id ?? null,
      source: 'deterministic_add_hint',
      market_snapshot: emptyMarketSnapshot(),
    });
  }

  if (detectedIntent === 'advice') {
    return buildAdviceReply({ rows: params.rows, context: params.context });
  }

  if (
    isAffirmativeSuggestionAnswer(params.answer) ||
    (/\d/.test(params.answer) && (isBareBudgetAmountAnswer(params.answer) || detectedIntent === 'update_amount'))
  ) {
    const deterministicUpdate = buildDeterministicUpdate({
      rows: params.rows,
      answer: params.answer,
      question: params.question,
      context: params.context,
      assistantFocusRowId: params.assistantFocusRowId,
      manualFocusRowId: params.manualFocusRowId,
      activeRow: params.activeRow,
    });
    if (deterministicUpdate) return deterministicUpdate;
  }

  const questionText = extractInferenceQuestionText(params.question) || params.question;
  const currentTarget =
    resolveBudgetChatTargetRow(params.rows, questionText, {
      manualFocusRowId: params.manualFocusRowId ?? null,
      assistantFocusRowId: params.assistantFocusRowId ?? null,
      activeRow: params.activeRow ?? null,
      answer: params.answer,
    }) ?? pickContextualFocusRow(params.rows, params.context);

  const answerRow = findBudgetRowByFocusId(params.rows, inferBudgetFocusRowId(params.answer));
  if (answerRow && answerRow.id !== currentTarget?.id) {
    return buildBudgetReply({
      reply: `Pasemos a ${answerRow.category.toLowerCase()}.`,
      followUp: buildContextualQuestion(answerRow, params.context),
      focus_row_id: answerRow.id,
      source: 'deterministic_answer_focus',
      market_snapshot: emptyMarketSnapshot(),
    });
  }

  const defaultFocus = buildBudgetFocusQuestion(params.rows, params.activeRow, params.context);
  const currentQuestion = buildContextualQuestion(currentTarget, params.context);
  const askedQuestion = sanitizeQuestion(params.question) ?? '';
  const questionsAlign =
    (askedQuestion.length > 0 && askedQuestion === currentQuestion) ||
    defaultFocus.question === currentQuestion;

  if (
    detectedIntent === 'unclear' &&
    params.answer.trim() &&
    currentTarget &&
    (questionsAlign || isBudgetSkipAnswer(params.answer))
  ) {
    const nextRow = findNextUnfilledBudgetRow(params.rows, params.context, currentTarget.id);
    if (nextRow && nextRow.id !== currentTarget.id) {
      return buildBudgetReply({
        reply: 'Entiendo. Avancemos con otro rubro del presupuesto.',
        followUp: buildContextualQuestion(nextRow, params.context),
        focus_row_id: nextRow.id,
        source: 'deterministic_advance_focus',
        market_snapshot: emptyMarketSnapshot(),
      });
    }
  }

  const suggestions = buildBudgetRowSuggestions(params.rows, params.context);
  const packaged = buildSuggestionFollowUp(suggestions, params.context, params.rows);
  if (packaged && detectedIntent === 'unclear') {
    return buildBudgetReply({
      reply: packaged.reply,
      followUp: packaged.followUp,
      focus_row_id: packaged.focusRowId,
      source: 'deterministic_context_suggestion',
      market_snapshot: emptyMarketSnapshot(),
    });
  }

  const { focus, question } = defaultFocus;
  const reflective = buildReflectiveFallbackReply({
    userAnswer: params.answer,
    row: currentTarget ?? focus,
  });

  return buildBudgetReply({
    reply: reflective.reply,
    followUp: reflective.followUp || question,
    focus_row_id: focus?.id ?? currentTarget?.id ?? params.activeRow?.id ?? null,
    source: 'deterministic_fallback',
    market_snapshot: emptyMarketSnapshot(),
  });
}

router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const _config = getConfig();
    const body = BudgetChatRequestSchema.parse(req.body) as BudgetChatRequest;

    const intent = body.intent;
    const answer = compactText(body.answer, 1200);
    const displayQuestion = compactText(body.question, 500);
    const explicitNextQuestion = compactText(body.nextQuestion ?? body.next_question, 500);
    const inferenceQuestion = explicitNextQuestion || extractInferenceQuestionText(displayQuestion) || displayQuestion;
    const question = displayQuestion || inferenceQuestion;
    const rows = sanitizeBudgetRows(body.budgetRows, 30);
    const activeRow = body.activeRow ? sanitizeBudgetRow(body.activeRow) : null;
    const activeRowFromId =
      typeof body.activeRowId === 'string' && body.activeRowId.trim()
        ? rows.find((row) => canonicalBudgetRowId(row.id) === canonicalBudgetRowId(body.activeRowId as string)) ?? null
        : null;
    const resolvedActiveRow = activeRow ?? activeRowFromId;
    const intakeContext = compactText(body.intakeContext, 500) || null;
    const products = sanitizeProducts(body.products);
    const chatAnswers = (body.chatAnswers ?? []).slice(-20);
    const context = createAssistantContext({
      rows,
      intakeData: body.intakeData,
      intakeContext,
      products,
      chatAnswers,
    });
    const assistantFocusRowId = compactText(body.assistantFocusRowId, 80) || null;
    const manualFocusRowId = compactText(body.manualFocusRowId, 80) || null;
    const snapshot = buildBudgetSnapshot(rows);
    const pendingRaw = body.pendingConfirmation ?? null;
    const pendingActions = pendingRaw
      ? validateBudgetTableActions((pendingRaw.actions ?? []) as BudgetTableAction[], rows)
      : [];

    if (intent === 'init') {
      const marketSnapshot = await getMarketSnapshotOptional();
      const draft = buildFallbackInit({ rows, context });
      const initFocus =
        draft.focus_row_id
          ? rows.find((row) => canonicalBudgetRowId(row.id) === canonicalBudgetRowId(draft.focus_row_id as string)) ??
            null
          : null;
      const planned = await planBudgetAssistantInit({
        rows,
        context,
        deterministicQuestion: draft.next_question ?? '',
        focusRow: initFocus,
      });
      const responseDraft = planned ? buildPlannerChatReply({ plan: planned, rows }) : draft;
      return sendBudgetChatResponse(
        res,
        { ...responseDraft, market_snapshot: marketSnapshot },
        buildWriterPolishInput({
          draft: responseDraft,
          context,
          rows,
          userAnswer: '',
        }),
      );
    }

    if (intent === 'reply' && pendingActions.length > 0) {
      if (isBudgetConfirmationAnswer(answer)) {
        const draft = buildConfirmationApplyReply({
          actions: pendingActions,
          rows,
          context,
          summary: pendingRaw?.summary ?? summarizeBudgetActionBatch(pendingActions),
        });
        return sendBudgetChatResponse(
          res,
          draft,
          buildWriterPolishInput({ draft, context, rows, userAnswer: answer }),
          { market_snapshot: emptyMarketSnapshot() },
        );
      }
      if (isBudgetRejectionAnswer(answer)) {
        const draft = buildConfirmationRejectedReply({ rows, context });
        return sendBudgetChatResponse(
          res,
          draft,
          buildWriterPolishInput({ draft, context, rows, userAnswer: answer }),
          { market_snapshot: emptyMarketSnapshot() },
        );
      }
    }

    if (intent === 'reply' && answer && isBulkDeleteRequest(answer)) {
      const draft = buildBulkDeleteConfirmReply({ rows, answer });
      if (draft) {
        return sendBudgetChatResponse(
          res,
          draft,
          buildWriterPolishInput({ draft, context, rows, userAnswer: answer }),
          { market_snapshot: emptyMarketSnapshot() },
        );
      }
    }

    if (intent === 'reply' && answer && detectBudgetIntent(answer) === 'update_field') {
      const fieldUpdate = buildDeterministicFieldUpdate({
        rows,
        answer,
        question,
        context,
        assistantFocusRowId,
        manualFocusRowId,
        activeRow: resolvedActiveRow,
      });
      if (fieldUpdate) {
        return sendBudgetChatResponse(
          res,
          fieldUpdate,
          buildWriterPolishInput({ draft: fieldUpdate, context, rows, userAnswer: answer }),
          { market_snapshot: emptyMarketSnapshot() },
        );
      }
    }

    if (intent === 'reply' && answer && !extractClpAmount(answer) && !isEducationalBudgetQuestion(answer)) {
      const answerIntent = detectBudgetIntent(answer);
      const clarifyIntent =
        answerIntent === 'update_amount' ||
        answerIntent === 'unclear' ||
        /\b(gasto|gastos|pago|pagamos|destino|sale|van)\b/.test(normalizeLooseText(answer));
      const categoryTarget =
        resolveBudgetChatTargetRow(rows, question, {
          manualFocusRowId,
          assistantFocusRowId,
          activeRow: resolvedActiveRow,
          answer,
        }) ?? null;
      const answerFocusId = inferBudgetFocusRowId(answer);
      if (clarifyIntent && categoryTarget && answerFocusId && Number(categoryTarget.amount ?? 0) <= 0) {
        const clarified = buildCategoryClarificationReply({ userAnswer: answer, row: categoryTarget });
        const draft = buildBudgetReply({
          reply: clarified.reply,
          followUp: clarified.followUp,
          focus_row_id: categoryTarget.id,
          source: 'deterministic_category_clarify',
          market_snapshot: emptyMarketSnapshot(),
        });
        return sendBudgetChatResponse(
          res,
          draft,
          buildWriterPolishInput({ draft, context, rows, userAnswer: answer }),
          { market_snapshot: emptyMarketSnapshot() },
        );
      }
    }

    if (intent === 'reply' && answer) {
      const focusRow =
        resolvedActiveRow ??
        (assistantFocusRowId
          ? rows.find((row) => canonicalBudgetRowId(row.id) === canonicalBudgetRowId(assistantFocusRowId)) ?? null
          : null);
      const planned = await planBudgetAssistantTurn({
        rows,
        context,
        userAnswer: answer,
        currentQuestion: question,
        focusRow,
        chatAnswers,
      });
      if (planned) {
        const draft = buildPlannerChatReply({ plan: planned, rows });
        return sendBudgetChatResponse(
          res,
          draft,
          buildWriterPolishInput({ draft, context, rows, userAnswer: answer }),
          { market_snapshot: emptyMarketSnapshot() },
        );
      }
    }

    if (
      intent === 'reply' &&
      answer &&
      (isAffirmativeSuggestionAnswer(answer) ||
        (/\d/.test(answer) && (isBareBudgetAmountAnswer(answer) || detectBudgetIntent(answer) === 'update_amount')))
    ) {
      const deterministicUpdate = buildDeterministicUpdate({
        rows,
        answer,
        question,
        context,
        assistantFocusRowId,
        manualFocusRowId,
        activeRow: resolvedActiveRow,
      });
      if (deterministicUpdate) {
        return sendBudgetChatResponse(
          res,
          deterministicUpdate,
          buildWriterPolishInput({ draft: deterministicUpdate, context, rows, userAnswer: answer }),
          { market_snapshot: emptyMarketSnapshot() },
        );
      }
    }

    if (intent === 'reply' && isEducationalBudgetQuestion(answer)) {
      const draft = buildEducationReply({ answer, rows, activeRow: resolvedActiveRow, context });
      return sendBudgetChatResponse(
        res,
        draft,
        buildWriterPolishInput({ draft, context, rows, userAnswer: answer }),
        { market_snapshot: emptyMarketSnapshot() },
      );
    }

    if (intent === 'reply' && detectBudgetIntent(answer) === 'greeting') {
      const draft = buildGreetingReply({ rows, activeRow: resolvedActiveRow, context });
      return sendBudgetChatResponse(
        res,
        draft,
        buildWriterPolishInput({ draft, context, rows, userAnswer: answer }),
        { market_snapshot: emptyMarketSnapshot() },
      );
    }

    if (intent === 'reply' && detectBudgetIntent(answer) === 'status_review') {
      const draft = buildStatusReply({ rows, context });
      return sendBudgetChatResponse(
        res,
        draft,
        buildWriterPolishInput({ draft, context, rows, userAnswer: answer }),
        { market_snapshot: emptyMarketSnapshot() },
      );
    }

    if (intent === 'reply' && detectBudgetIntent(answer) === 'delete_row') {
      const draft = buildSingleDeleteConfirmReply({
        rows,
        answer,
        question,
        context,
        assistantFocusRowId,
        manualFocusRowId,
        activeRow: resolvedActiveRow,
      });
      if (draft) {
        return sendBudgetChatResponse(
          res,
          draft,
          buildWriterPolishInput({ draft, context, rows, userAnswer: answer }),
          { market_snapshot: emptyMarketSnapshot() },
        );
      }
    }

    if (intent === 'reply' && detectBudgetIntent(answer) === 'advice') {
      const draft = buildAdviceReply({ rows, context });
      return sendBudgetChatResponse(
        res,
        draft,
        buildWriterPolishInput({ draft, context, rows, userAnswer: answer }),
        { market_snapshot: emptyMarketSnapshot() },
      );
    }

    const marketSnapshot = await getMarketSnapshotOptional();
    const fallback = buildConversationalFallback({
      answer,
      rows,
      activeRow: resolvedActiveRow,
      context,
      question,
      assistantFocusRowId,
      manualFocusRowId,
    });
    return sendBudgetChatResponse(
      res,
      {
        ...fallback,
        market_snapshot: marketSnapshot,
        source:
          fallback.source === 'deterministic_fallback' && snapshot.signals.coreFillRate >= 100
            ? 'deterministic_fallback_complete'
            : fallback.source,
      },
      buildWriterPolishInput({ draft: fallback, context, rows, userAnswer: answer }),
    );
  }),
);

export default router;
