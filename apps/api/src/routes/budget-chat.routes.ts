import { Router } from 'express';
import { z } from 'zod';

import { asyncHandler } from '../middleware/errorHandler';
import { requireAuth } from '../middleware/auth';
import { requireSpendableFincoins } from '../middleware/fincoin-guard';
import { chargeFincoinOperation } from '../services/fincoin.service';
import { fetchIndicador } from '../mcp/tools/market/mindicadorClient';
import { getConfig } from '../config';
import {
  mapBudgetSourceToWriterTurn,
  polishBudgetAssistantCopy,
  type BudgetWriterPolishInput,
} from '../services/budget-chat-writer.service';
import { runBudgetChatAgent, isBudgetAgentUnavailableResult } from '../services/budget-chat-agent.service';
import { CHAT_PIPELINES } from '@financial-agent/shared';

// Pipeline: see CHAT_PIPELINES.budget — structured budget panel assistant (not CoreAgent).
void CHAT_PIPELINES.budget.id;

import {
  BUDGET_MOVEMENT_TYPE_OPTIONS,
  DEFAULT_BUDGET_ROWS,
  buildBudgetAssistantContext,
  buildBudgetHelpAddReply,
  buildBudgetInitTurn,
  buildBudgetRowSuggestions,
  buildBudgetAcknowledgmentReply,
  buildCategoryClarificationReply,
  extractUserAnswerCue,
  isBudgetMetaOrHelpQuestion,
  buildContextualAdviceReply,
  buildContextualQuestion,
  buildReflectiveFallbackReply,
  isBudgetEducationalQuestion,
  isBudgetOffTopicAnswer,
  buildSuggestionFollowUp,
  inferBudgetFieldFromQuestion,
  isBulkDeleteRequest,
  isBudgetSkipAnswer,
  parseBudgetCadenceFromAnswer,
  parseBudgetCategoryFromAnswer,
  parseBudgetTypeFromAnswer,
  parseBudgetCategoryRenameFromAnswer,
  parseBudgetFieldPatchFromAnswer,
  parseBudgetMovementFromAnswer,
  parseBudgetPaymentFromAnswer,
  hasBudgetFieldSignals,
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
  resolveBudgetAffirmativeAmount,
  resolveBudgetRowDisplayMovementType,
  isBareBudgetAmountAnswer,
  pickContextualFocusRow,
  reconcileBudgetRows,
  resolveBudgetChatTargetRow,
  summarizeBudgetActionBatch,
  normalizeBudgetCadence,
  validateBudgetTableActions,
  MAX_BUDGET_TABLE_ACTIONS,
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
      actions: z.array(z.record(z.unknown())).max(MAX_BUDGET_TABLE_ACTIONS),
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
  provider: 'agent' | 'hybrid' | 'deterministic';
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
    cadence:
      item.cadence === 'fixed' || item.cadence === 'variable' || item.cadence === 'oneoff'
        ? normalizeCadence(item.cadence, type)
        : undefined,
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
  return value.slice(0, 8).map((product: unknown) => {
    const raw = (product ?? {}) as Record<string, unknown>;
    const keyMetricsRaw =
      raw.keyMetrics && typeof raw.keyMetrics === 'object'
        ? (raw.keyMetrics as Record<string, unknown>)
        : null;
    const movements = Array.isArray(raw.movements)
      ? raw.movements
          .map((item: unknown) => {
            if (!item || typeof item !== 'object') return null;
            const movement = item as Record<string, unknown>;
            const description = compactText(movement.description, 120);
            const amount = Math.max(0, Math.round(Math.abs(Number(movement.amount ?? movement.amount_signed ?? 0))));
            if (!description || amount <= 0) return null;
            const directionRaw = String(movement.direction ?? movement.movement_kind ?? 'expense').toLowerCase();
            const direction: 'income' | 'expense' =
              directionRaw === 'income' || directionRaw === 'abono' ? 'income' : 'expense';
            return {
              date: compactText(movement.date, 20) || undefined,
              description,
              amount,
              direction,
              category: compactText(movement.category, 60) || undefined,
              merchant: compactText(movement.merchant, 60) || undefined,
              confidence:
                typeof movement.category_confidence === 'number'
                  ? movement.category_confidence
                  : typeof movement.confidence === 'number'
                    ? movement.confidence
                    : undefined,
            };
          })
          .filter((item): item is NonNullable<typeof item> => Boolean(item))
          .slice(0, 120)
      : [];
    const periodRaw = raw.period && typeof raw.period === 'object' ? (raw.period as Record<string, unknown>) : null;
    return {
      productId: compactText(raw.productId ?? raw.id, 80),
      label: compactText(raw.label, 80),
      bank: compactText(raw.bank, 60),
      productType: compactText(raw.productType, 40),
      period: periodRaw
        ? {
            from: compactText(periodRaw.from, 20) || undefined,
            to: compactText(periodRaw.to, 20) || undefined,
          }
        : undefined,
      evidenceFidelity:
        raw.evidenceFidelity === 'authoritative' || raw.evidenceFidelity === 'indicative'
          ? raw.evidenceFidelity
          : undefined,
      movements,
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
  products: BudgetProduct[];
  chatAnswers: BudgetChatTurn[];
}): BudgetAssistantContext {
  return buildBudgetAssistantContext({
    rows: params.rows,
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
    activeFromRows && pickNextBudgetRowFieldGap(activeFromRows, context)
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
    !effectiveRows.some((row) => row.id === 'expense_rent' && row.amount > 0) ? 'gasto principal' : '',
    !effectiveRows.some((row) => row.id === 'expense_other' && row.amount > 0) ? 'otro gasto' : '',
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
  if (isBudgetMetaOrHelpQuestion(answer)) return 'help_add';
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
  const hasFields = hasBudgetFieldSignals(answer);
  const hasAmount = extractClpAmount(answer) !== null;
  if (hasAmount && hasFields) return 'update_combined';
  if (
    hasFields ||
    /\b(medio de pago|forma de pago|pago con|recurrencia|dejalo fijo|dejalo variable|ponlo fijo|ponlo variable)\b/.test(
      text,
    )
  ) {
    return 'update_field';
  }
  if (/\?$/.test(answer.trim()) || /\b(que|como|por que|cual|cuanto)\b/.test(text)) return 'question';
  if (/^(hola|buenas|hello|hi|ola)\b/.test(text)) return 'greeting';
  return 'unclear';
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

const BUDGET_AGENT_FOLLOW_UP = '¿Qué más quieres hacer con la tabla?';

function buildConfirmationApplyFailedReply(): BudgetChatResponse {
  return buildBudgetReply({
    reply: 'No pude aplicar esos cambios en la tabla. Pídemelo de nuevo y lo revisamos.',
    followUp: BUDGET_AGENT_FOLLOW_UP,
    focus_row_id: null,
    source: 'budget_agent_confirm_apply_failed',
    provider: 'deterministic',
    market_snapshot: emptyMarketSnapshot(),
    requires_confirmation: false,
    pending_confirmation: null,
  });
}

function buildConfirmationApplyReply(params: {
  actions: BudgetTableAction[];
  summary: string;
}): BudgetChatResponse {
  return buildBudgetReply({
    reply: `Quedó aplicado: ${params.summary || summarizeBudgetActionBatch(params.actions)}.`,
    followUp: BUDGET_AGENT_FOLLOW_UP,
    focus_row_id: params.actions[0]?.id ?? null,
    actions: actionsToRecords(params.actions),
    action: params.actions[0] ? { ...params.actions[0] } : null,
    source: 'budget_agent_confirm_apply',
    provider: 'agent',
    market_snapshot: emptyMarketSnapshot(),
    requires_confirmation: false,
    pending_confirmation: null,
  });
}

function buildConfirmationRejectedReply(): BudgetChatResponse {
  return buildBudgetReply({
    reply: 'Sin problema, no aplico esos cambios.',
    followUp: BUDGET_AGENT_FOLLOW_UP,
    focus_row_id: null,
    source: 'budget_agent_confirm_reject',
    provider: 'agent',
    market_snapshot: emptyMarketSnapshot(),
    requires_confirmation: false,
    pending_confirmation: null,
  });
}

function buildAgentChatReply(params: {
  agent: {
    assistant_reply: string;
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
    params.agent.requires_confirmation && params.agent.actions.length > 0
      ? buildPendingConfirmation(params.agent.actions, params.rows)
      : null;
  const appliedSummary =
    !params.agent.requires_confirmation && params.agent.actions.length > 0
      ? summarizeBudgetActionBatch(params.agent.actions, params.rows)
      : null;
  const reply =
    params.agent.pending_summary ??
    appliedSummary ??
    params.agent.assistant_reply ??
    'Listo.';
  return buildBudgetReply({
    reply,
    followUp: params.agent.next_question,
    focus_row_id: params.agent.focus_row_id,
    actions: params.agent.requires_confirmation ? [] : actionsToRecords(params.agent.actions),
    action: params.agent.requires_confirmation ? null : params.agent.actions[0] ? { ...params.agent.actions[0] } : null,
    source: params.agent.source,
    provider: 'agent',
    market_snapshot: emptyMarketSnapshot(),
    requires_confirmation: params.agent.requires_confirmation,
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

function allowsDeterministicAmountWrite(
  targetRow: BudgetRow,
  context: BudgetAssistantContext,
  answer: string,
  question: string,
): boolean {
  const gap = pickNextBudgetRowFieldGap(targetRow, context);
  if (gap === 'amount' || gap === 'cadence' || gap === 'paymentMethod' || gap === null) return true;
  if (gap !== 'movementType' && gap !== 'category') return true;

  if (detectBudgetIntent(answer) === 'update_combined') return true;

  const focusFromAnswer = inferBudgetFocusRowId(answer);
  if (
    focusFromAnswer &&
    canonicalBudgetRowId(focusFromAnswer) !== canonicalBudgetRowId(targetRow.id)
  ) {
    return true;
  }

  const questionFocus = inferBudgetFocusRowId(
    extractInferenceQuestionText(question) || question,
  );
  if (
    extractClpAmount(answer) !== null &&
    !isBareBudgetAmountAnswer(answer) &&
    questionFocus &&
    canonicalBudgetRowId(questionFocus) !== canonicalBudgetRowId(targetRow.id)
  ) {
    return true;
  }

  if (
    extractClpAmount(answer) !== null &&
    !isBareBudgetAmountAnswer(answer) &&
    (focusFromAnswer || /\b(gasto|gastamos|pago|pagamos)\b/i.test(answer))
  ) {
    return true;
  }

  return false;
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

  if (!allowsDeterministicAmountWrite(targetRow, params.context, params.answer, params.question)) return null;

  let amount = extractClpAmount(params.answer);
  if (amount === null && isAffirmativeSuggestionAnswer(params.answer)) {
    const questionText = extractInferenceQuestionText(params.question) || params.question;
    const suggestion = buildBudgetRowSuggestions(params.rows, params.context).find(
      (item) => canonicalBudgetRowId(item.rowId) === canonicalBudgetRowId(targetRow.id),
    );
    amount = resolveBudgetAffirmativeAmount({
      row: targetRow,
      context: params.context,
      question: questionText,
      suggestionAmount: suggestion?.suggestedAmount ?? null,
    });
  }
  const rowExists = params.rows.some((row) => row.id === targetRow!.id);
  if (amount === null && isAffirmativeSuggestionAnswer(params.answer) && !rowExists) {
    amount = 0;
  }
  if (amount === null) return null;

  const fieldPatch = parseBudgetFieldPatchFromAnswer(params.answer, { currentCategory: targetRow.category });
  const category = fieldPatch.category ?? targetRow.category;
  const action: BudgetTableAction = {
    kind: rowExists ? 'update' : 'add',
    id: targetRow.id,
    category,
    type: targetRow.type,
    amount,
    ...(fieldPatch.cadence || targetRow.cadence
      ? { cadence: normalizeBudgetCadence(fieldPatch.cadence ?? targetRow.cadence, targetRow.type) }
      : {}),
    ...(fieldPatch.payment_method || targetRow.paymentMethod
      ? {
          payment_method:
            fieldPatch.payment_method ??
            targetRow.paymentMethod ??
            (targetRow.type === 'income' ? 'transfer' : 'debit'),
        }
      : {}),
    ...(fieldPatch.movement_type || targetRow.movementType
      ? { movement_type: fieldPatch.movement_type ?? targetRow.movementType }
      : {}),
  };
  const projectedRows = reconcileBudgetRows(
    rowExists
      ? params.rows.map((row) =>
          row.id === targetRow!.id
            ? {
                ...row,
                amount,
                category,
                ...(action.cadence ? { cadence: action.cadence } : {}),
                ...(action.payment_method ? { paymentMethod: action.payment_method } : {}),
                ...(action.movement_type ? { movementType: action.movement_type } : {}),
              }
            : row,
        )
      : [
          ...params.rows,
          {
            ...targetRow,
            amount,
            category,
            ...(action.cadence ? { cadence: action.cadence } : {}),
            ...(action.payment_method ? { paymentMethod: action.payment_method } : {}),
            ...(action.movement_type ? { movementType: action.movement_type } : {}),
          },
        ],
  );
  const projectedContext = createAssistantContext({
    rows: projectedRows,
    products: params.context.products,
    chatAnswers: params.context.chatAnswers,
  });
  const updatedRow = projectedRows.find((row) => row.id === targetRow!.id) ?? targetRow;
  const { focus, question } = buildBudgetFocusQuestion(projectedRows, updatedRow, projectedContext);
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

function buildDeterministicMovementTypeUpdate(params: {
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
  if (!targetRow) return null;
  if (pickNextBudgetRowFieldGap(targetRow, params.context) !== 'movementType') return null;
  if (isBudgetOffTopicAnswer(params.answer) || isBudgetEducationalQuestion(params.answer) || isBudgetSkipAnswer(params.answer)) {
    return null;
  }
  if (isBudgetMetaOrHelpQuestion(params.answer)) return null;
  if (/\?\s*$/.test(String(params.answer ?? '').trim())) return null;

  const isAffirmative = isAffirmativeSuggestionAnswer(params.answer);
  if (extractClpAmount(params.answer) !== null) return null;
  if (/\d/.test(params.answer) && !isAffirmative) return null;
  const answerIntent = detectBudgetIntent(params.answer);
  if (answerIntent === 'update_amount' || answerIntent === 'update_combined') return null;
  if (!isAffirmative && /\b(gasto|gastamos|pago|pagamos|gasto harto|harto en|mucho en)\b/i.test(params.answer)) {
    return null;
  }

  const parsedMovement = parseBudgetMovementFromAnswer(params.answer, { directAnswer: true });
  if (!isAffirmative && !parsedMovement) return null;
  if (!isAffirmative && !parsedMovement && /\b(gasto|gastos|gastamos|pago|pagamos|destino|salen|van)\b/i.test(params.answer)) {
    return null;
  }

  const displayType = resolveBudgetRowDisplayMovementType(targetRow);
  const resolvedMovement = parsedMovement ?? displayType;
  const action: BudgetTableAction = {
    kind: 'update',
    id: targetRow.id,
    category: targetRow.category,
    type: targetRow.type,
    amount: Math.max(0, Math.round(Number(targetRow.amount ?? 0))),
    movement_type: resolvedMovement,
  };

  const projectedRows = reconcileBudgetRows(
    params.rows.map((row) =>
      row.id === targetRow.id
        ? {
            ...row,
            movementType: resolvedMovement,
          }
        : row,
    ),
  );
  const projectedContext = createAssistantContext({
    rows: projectedRows,
    products: params.context.products,
    chatAnswers: [
      ...params.context.chatAnswers,
      {
        q: params.question,
        a: params.answer,
      },
    ],
  });
  const updatedRow = projectedRows.find((row) => row.id === targetRow.id) ?? targetRow;
  const { focus, question } = buildBudgetFocusQuestion(projectedRows, updatedRow, projectedContext);
  const movementChanged = resolvedMovement !== (targetRow.movementType ?? displayType);
  const label =
    BUDGET_MOVEMENT_TYPE_OPTIONS.find((item) => item.value === resolvedMovement)?.label ?? resolvedMovement;
  const replyParts = [
    movementChanged ? `Dejé la categoría en «${label}».` : `Perfecto, mantenemos «${label}» como categoría.`,
  ];

  return buildBudgetReply({
    reply: replyParts.join(' '),
    followUp: question,
    focus_row_id: focus?.id ?? targetRow.id,
    actions: [action],
    action,
    source: 'deterministic_movement_type_update',
    market_snapshot: emptyMarketSnapshot(),
  });
}

function buildDeterministicCategoryUpdate(params: {
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
  if (!targetRow) return null;
  if (pickNextBudgetRowFieldGap(targetRow, params.context) !== 'category') return null;
  if (isBudgetOffTopicAnswer(params.answer) || isBudgetEducationalQuestion(params.answer) || isBudgetSkipAnswer(params.answer)) {
    return null;
  }
  if (isBudgetMetaOrHelpQuestion(params.answer)) return null;
  if (/\?\s*$/.test(String(params.answer ?? '').trim())) return null;

  const renamed = parseBudgetCategoryRenameFromAnswer(params.answer);
  const isAffirmative = isAffirmativeSuggestionAnswer(params.answer);
  const parsedCategory = parseBudgetCategoryFromAnswer(params.answer, { currentCategory: targetRow.category });
  if (!isAffirmative && !renamed && !parsedCategory) return null;
  if (!isAffirmative && !renamed && /\b(gasto|gastos|gastamos|pago|pagamos|destino|salen|van)\b/i.test(params.answer)) {
    return null;
  }

  const fieldPatch = parseBudgetFieldPatchFromAnswer(params.answer, { currentCategory: targetRow.category });
  const rowType = fieldPatch.type === 'income' || fieldPatch.type === 'expense' ? fieldPatch.type : targetRow.type;
  const resolvedCategory = renamed ?? parsedCategory ?? targetRow.category;
  const action: BudgetTableAction = {
    kind: 'update',
    id: targetRow.id,
    category: resolvedCategory,
    type: rowType,
    amount: Math.max(0, Math.round(Number(targetRow.amount ?? 0))),
    ...(fieldPatch.cadence ? { cadence: fieldPatch.cadence } : {}),
    ...(fieldPatch.payment_method ? { payment_method: fieldPatch.payment_method } : {}),
    ...(fieldPatch.movement_type ? { movement_type: fieldPatch.movement_type } : {}),
  };

  const projectedRows = reconcileBudgetRows(
    params.rows.map((row) =>
      row.id === targetRow.id
        ? {
            ...row,
            category: resolvedCategory,
            type: rowType,
            ...(action.cadence ? { cadence: action.cadence } : {}),
            ...(action.payment_method ? { paymentMethod: action.payment_method } : {}),
            ...(action.movement_type ? { movementType: action.movement_type } : {}),
          }
        : row,
    ),
  );
  const projectedContext = createAssistantContext({
    rows: projectedRows,
    products: params.context.products,
    chatAnswers: [
      ...params.context.chatAnswers,
      {
        q: params.question,
        a: params.answer,
      },
    ],
  });
  const updatedRow = projectedRows.find((row) => row.id === targetRow.id) ?? targetRow;
  const { focus, question } = buildBudgetFocusQuestion(projectedRows, updatedRow, projectedContext);
  const categoryChanged = resolvedCategory.trim() !== targetRow.category.trim();
  const typeChanged = rowType !== targetRow.type;
  const replyParts = [
    categoryChanged ? `Dejé «${resolvedCategory}» como nombre del movimiento.` : `Perfecto, mantenemos «${resolvedCategory}».`,
    typeChanged ? `Lo marqué como ${rowType === 'income' ? 'ingreso' : 'gasto'}.` : '',
  ].filter(Boolean);

  return buildBudgetReply({
    reply: replyParts.join(' '),
    followUp: question,
    focus_row_id: focus?.id ?? targetRow.id,
    actions: [action],
    action,
    source: 'deterministic_category_update',
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
  if (!targetRow) return null;

  const fieldPatch = parseBudgetFieldPatchFromAnswer(params.answer, { currentCategory: targetRow.category });
  if (!fieldPatch.cadence && !fieldPatch.payment_method && !fieldPatch.movement_type && !fieldPatch.category && !fieldPatch.type) {
    return null;
  }

  const gap = pickNextBudgetRowFieldGap(targetRow, params.context);
  if (gap === 'movementType' || gap === 'category' || gap === 'amount') return null;
  if (Number(targetRow.amount ?? 0) <= 0) return null;

  const category = fieldPatch.category ?? targetRow.category;
  const rowType = fieldPatch.type === 'income' || fieldPatch.type === 'expense' ? fieldPatch.type : targetRow.type;
  const action: BudgetTableAction = {
    kind: 'update',
    id: targetRow.id,
    category,
    type: rowType,
    amount: Math.max(0, Math.round(Number(targetRow.amount ?? 0))),
    cadence: normalizeBudgetCadence(fieldPatch.cadence ?? targetRow.cadence, targetRow.type),
    payment_method:
      fieldPatch.payment_method ??
      targetRow.paymentMethod ??
      (targetRow.type === 'income' ? 'transfer' : 'debit'),
    movement_type: fieldPatch.movement_type ?? targetRow.movementType ?? undefined,
  };

  const projectedRows = reconcileBudgetRows(
    params.rows.map((row) =>
      row.id === targetRow.id
        ? {
            ...row,
            category,
            type: rowType,
            cadence: action.cadence,
            paymentMethod: action.payment_method,
            movementType: action.movement_type,
          }
        : row,
    ),
  );
  const projectedContext = createAssistantContext({
    rows: projectedRows,
    products: params.context.products,
    chatAnswers: params.context.chatAnswers,
  });
  const updatedRow = projectedRows.find((row) => row.id === targetRow.id) ?? targetRow;
  const { focus, question } = buildBudgetFocusQuestion(projectedRows, updatedRow, projectedContext);
  const changedParts: string[] = [];
  if (fieldPatch.cadence) {
    changedParts.push(fieldPatch.cadence === 'fixed' ? 'recurrencia fija' : 'recurrencia variable');
  }
  if (fieldPatch.payment_method) {
    const paymentLabel =
      fieldPatch.payment_method === 'transfer'
        ? 'transferencia'
        : fieldPatch.payment_method === 'debit'
          ? 'débito'
          : fieldPatch.payment_method === 'credit'
            ? 'crédito'
            : fieldPatch.payment_method === 'cash'
              ? 'efectivo'
              : fieldPatch.payment_method === 'prepaid'
                ? 'prepago'
                : 'otro medio';
    changedParts.push(`pago con ${paymentLabel}`);
  }
  if (fieldPatch.movement_type) {
    const movementLabel = BUDGET_MOVEMENT_TYPE_OPTIONS.find((item) => item.value === fieldPatch.movement_type)?.label;
    if (movementLabel) changedParts.push(`tipo ${movementLabel.toLowerCase()}`);
  }
  if (fieldPatch.category) changedParts.push(`nombre ${fieldPatch.category}`);
  if (fieldPatch.type) changedParts.push(fieldPatch.type === 'income' ? 'tipo ingreso' : 'tipo gasto');
  const detail = changedParts.length > 0 ? changedParts.join(', ') : 'detalle';
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
  const init = buildBudgetInitTurn(params.rows, params.context);
  return buildBudgetReply({
    reply: init.reply,
    followUp: init.followUp,
    focus_row_id: init.focusRowId,
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

function slugifyBudgetCategory(value: string): string {
  return normalizeLooseText(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
}

function extractAddRowCategoryFromAnswer(answer: string): string | null {
  if (isBudgetMetaOrHelpQuestion(answer)) return null;

  const renamed = parseBudgetCategoryRenameFromAnswer(answer);
  if (renamed) return renamed;

  const addMatch = String(answer ?? '').match(
    /(?:agrega(?:r)?|anade(?:r)?|añade(?:r)?|incluye(?:r)?|incorpora(?:r)?|suma(?:r)?|crea(?:r)?)\s+(?:una?\s+fila\s+(?:de\s+)?)?([^,.!?$\d]{2,48})/i,
  );
  const candidate = addMatch?.[1]?.trim();
  if (candidate) {
    const normalized = normalizeLooseText(candidate);
    if (!/\b(gasto|gastos|ingreso|ingresos|expense|income)\b/.test(normalized)) {
      return candidate.charAt(0).toUpperCase() + candidate.slice(1);
    }
  }

  const withoutAmount = String(answer ?? '')
    .replace(/\$?\d[\d.,\s]*(k|mil|m|mm|millones?)?/gi, ' ')
    .trim();
  return parseBudgetCategoryFromAnswer(withoutAmount, { allowAffirmative: false });
}

function buildDeterministicAddFromAnswer(params: {
  rows: BudgetRow[];
  answer: string;
  context: BudgetAssistantContext;
}): BudgetChatResponse | null {
  const category = extractAddRowCategoryFromAnswer(params.answer);
  if (!category) return null;

  const rowType = parseBudgetTypeFromAnswer(params.answer) ?? 'expense';
  const amount = extractClpAmount(params.answer);
  const slug = slugifyBudgetCategory(category) || String(Date.now());
  let id = `${rowType}-custom-${slug}`;
  if (params.rows.some((row) => canonicalBudgetRowId(row.id) === canonicalBudgetRowId(id))) {
    id = `${rowType}-custom-${slug}-${Date.now().toString(36).slice(-4)}`;
  }

  const fieldPatch = parseBudgetFieldPatchFromAnswer(params.answer);
  const action: BudgetTableAction = {
    kind: 'add',
    id,
    category,
    type: rowType,
    ...(amount !== null ? { amount } : {}),
    ...(fieldPatch.cadence ? { cadence: fieldPatch.cadence } : {}),
    ...(fieldPatch.payment_method ? { payment_method: fieldPatch.payment_method } : {}),
    ...(fieldPatch.movement_type ? { movement_type: fieldPatch.movement_type } : {}),
  };

  const { focus, question } = buildBudgetFocusQuestion(params.rows, null, params.context, id);
  return buildBudgetReply({
    reply: `Agrego ${category.toLowerCase()}${amount !== null ? ` por $${formatClp(amount)}` : ''} a la tabla.`,
    followUp: question,
    focus_row_id: focus?.id ?? id,
    actions: [action],
    action,
    source: 'deterministic_add',
    market_snapshot: emptyMarketSnapshot(),
  });
}

type ConversationalFallbackParams = {
  answer: string;
  rows: BudgetRow[];
  activeRow: BudgetRow | null;
  context: BudgetAssistantContext;
  question: string;
  assistantFocusRowId?: string | null;
  manualFocusRowId?: string | null;
};

function tryDeterministicWizardMutations(
  params: ConversationalFallbackParams,
): BudgetChatResponse | null {
  if (isBudgetMetaOrHelpQuestion(params.answer)) return null;
  return (
    buildDeterministicMovementTypeUpdate(params) ??
    buildDeterministicCategoryUpdate(params) ??
    buildDeterministicFieldUpdate(params) ??
    null
  );
}

function buildConversationalFallback(params: ConversationalFallbackParams) {
  const wizardMutation = tryDeterministicWizardMutations(params);
  if (wizardMutation) return wizardMutation;

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

  if (detectedIntent === 'help_add') {
    const help = buildBudgetHelpAddReply(params.rows, params.context);
    return buildBudgetReply({
      reply: help.reply,
      followUp: help.followUp,
      focus_row_id: help.focusRowId,
      source: 'deterministic_help_add',
      market_snapshot: emptyMarketSnapshot(),
    });
  }

  if (detectedIntent === 'add_row') {
    const deterministicAdd = buildDeterministicAddFromAnswer({
      rows: params.rows,
      answer: params.answer,
      context: params.context,
    });
    if (deterministicAdd) return deterministicAdd;

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

  if (params.answer.trim() && currentTarget && isBudgetSkipAnswer(params.answer)) {
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

function shouldUseDeterministicTableFallback(params: {
  agent: {
    source: string;
    actions: BudgetTableAction[];
    requires_confirmation: boolean;
  };
  answer: string;
}): boolean {
  if (isBudgetAgentUnavailableResult(params.agent)) return true;
  if (params.agent.requires_confirmation) return false;
  if (params.agent.actions.length > 0) return false;
  const intent = detectBudgetIntent(params.answer);
  return (
    intent === 'help_add' ||
    intent === 'update_amount' ||
    intent === 'update_field' ||
    intent === 'update_combined' ||
    intent === 'delete_row' ||
    intent === 'delete_all'
  );
}

function resolveHybridBudgetChatDraft(params: {
  agent: {
    assistant_reply: string;
    next_question: string;
    focus_row_id: string | null;
    actions: BudgetTableAction[];
    requires_confirmation: boolean;
    pending_summary: string | null;
    source: string;
  };
  rows: BudgetRow[];
  answer: string;
  question: string;
  context: BudgetAssistantContext;
  activeRow: BudgetRow | null;
  assistantFocusRowId?: string | null;
  manualFocusRowId?: string | null;
}): BudgetChatResponse {
  if (isBudgetMetaOrHelpQuestion(params.answer)) {
    const help = buildBudgetHelpAddReply(params.rows, params.context);
    return buildBudgetReply({
      reply: help.reply,
      followUp: help.followUp,
      focus_row_id: help.focusRowId,
      source: 'deterministic_help_add',
      market_snapshot: emptyMarketSnapshot(),
    });
  }

  const agentDraft = buildAgentChatReply({ agent: params.agent, rows: params.rows });
  if (params.agent.requires_confirmation || params.agent.actions.length > 0) {
    return agentDraft;
  }

  const wizardMutation = tryDeterministicWizardMutations({
    answer: params.answer,
    rows: params.rows,
    activeRow: params.activeRow,
    context: params.context,
    question: params.question,
    assistantFocusRowId: params.assistantFocusRowId,
    manualFocusRowId: params.manualFocusRowId,
  });
  if (wizardMutation) return wizardMutation;

  if (!shouldUseDeterministicTableFallback({ agent: params.agent, answer: params.answer })) {
    return agentDraft;
  }

  const deterministicDraft = buildConversationalFallback({
    answer: params.answer,
    rows: params.rows,
    activeRow: params.activeRow,
    context: params.context,
    question: params.question,
    assistantFocusRowId: params.assistantFocusRowId,
    manualFocusRowId: params.manualFocusRowId,
  });

  const deterministicHasActions = (deterministicDraft.actions?.length ?? 0) > 0;
  if (deterministicHasActions) return deterministicDraft;
  return agentDraft;
}

router.post(
  '/',
  requireAuth,
  requireSpendableFincoins('budget.chat'),
  asyncHandler(async (req, res) => {
    const _config = getConfig();
    const user = req.authenticatedUser;
    if (user) {
      await chargeFincoinOperation(user.id, 'budget.chat');
    }
    const body = BudgetChatRequestSchema.parse(req.body) as BudgetChatRequest;

    const intent = body.intent;
    const answer = compactText(body.answer, 1200);
    const displayQuestion = compactText(body.question, 500);
    const explicitNextQuestion = compactText(body.nextQuestion ?? body.next_question, 500);
    const question =
      explicitNextQuestion ||
      extractInferenceQuestionText(displayQuestion) ||
      displayQuestion;
    const rows = sanitizeBudgetRows(body.budgetRows, 30);
    const activeRow = body.activeRow ? sanitizeBudgetRow(body.activeRow) : null;
    const activeRowFromId =
      typeof body.activeRowId === 'string' && body.activeRowId.trim()
        ? rows.find((row) => canonicalBudgetRowId(row.id) === canonicalBudgetRowId(body.activeRowId as string)) ?? null
        : null;
    const resolvedActiveRow = activeRow ?? activeRowFromId;
    const products = sanitizeProducts(body.products);
    const chatAnswers = (body.chatAnswers ?? []).slice(-20);
    const context = createAssistantContext({
      rows,
      products,
      chatAnswers,
    });
    const assistantFocusRowId = compactText(body.assistantFocusRowId, 80) || null;
    const manualFocusRowId = compactText(body.manualFocusRowId, 80) || null;
    const snapshot = buildBudgetSnapshot(rows);
    const pendingRaw = body.pendingConfirmation ?? null;
    const pendingActionCount = pendingRaw?.actions?.length ?? 0;
    const pendingActions = pendingRaw
      ? validateBudgetTableActions((pendingRaw.actions ?? []) as BudgetTableAction[], rows)
      : [];

    if (intent === 'init') {
      const marketSnapshot = await getMarketSnapshotOptional();
      const deterministicInit = buildFallbackInit({ rows, context });
      const focusRow =
        rows.find((row) => canonicalBudgetRowId(row.id) === canonicalBudgetRowId('income_salary')) ?? rows[0] ?? null;
      const agentResult = await runBudgetChatAgent({
        rows,
        context,
        userAnswer: '',
        currentQuestion: '',
        focusRow,
        chatAnswers: [],
        mode: 'init',
        userId: user?.id,
      });
      const draft =
        !isBudgetAgentUnavailableResult(agentResult) &&
        (agentResult.actions.length > 0 || agentResult.requires_confirmation)
          ? buildAgentChatReply({ agent: agentResult, rows })
          : deterministicInit;
      return sendBudgetChatResponse(
        res,
        { ...draft, market_snapshot: marketSnapshot },
        buildWriterPolishInput({ draft, context, rows, userAnswer: '' }),
      );
    }

    if (intent === 'reply' && pendingActionCount > 0) {
      if (isBudgetConfirmationAnswer(answer)) {
        if (pendingActions.length === 0) {
          const failedDraft = buildConfirmationApplyFailedReply();
          return sendBudgetChatResponse(
            res,
            failedDraft,
            buildWriterPolishInput({ draft: failedDraft, context, rows, userAnswer: answer }),
            { market_snapshot: emptyMarketSnapshot() },
          );
        }
        const draft = buildConfirmationApplyReply({
          actions: pendingActions,
          summary: pendingRaw?.summary ?? summarizeBudgetActionBatch(pendingActions, rows),
        });
        return sendBudgetChatResponse(
          res,
          draft,
          buildWriterPolishInput({ draft, context, rows, userAnswer: answer }),
          { market_snapshot: emptyMarketSnapshot() },
        );
      }
      if (isBudgetRejectionAnswer(answer)) {
        const draft = buildConfirmationRejectedReply();
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
      const agentResult = await runBudgetChatAgent({
        rows,
        context,
        userAnswer: answer,
        currentQuestion: question,
        focusRow,
        chatAnswers,
        mode: 'reply',
        userId: user?.id,
      });
      const draft = resolveHybridBudgetChatDraft({
        agent: agentResult,
        rows,
        answer,
        question,
        context,
        activeRow: focusRow,
        assistantFocusRowId,
        manualFocusRowId,
      });
      const marketSnapshot = await getMarketSnapshotOptional();
      return sendBudgetChatResponse(
        res,
        { ...draft, market_snapshot: marketSnapshot },
        buildWriterPolishInput({ draft, context, rows, userAnswer: answer }),
      );
    }

    const draft = buildBudgetReply({
      reply: 'Cuéntame qué quieres cambiar en la tabla.',
      followUp: BUDGET_AGENT_FOLLOW_UP,
      focus_row_id: null,
      source: 'budget_agent_empty',
      provider: 'agent',
      market_snapshot: emptyMarketSnapshot(),
    });
    return sendBudgetChatResponse(
      res,
      draft,
      buildWriterPolishInput({ draft, context, rows, userAnswer: answer }),
    );
  }),
);

export default router;
