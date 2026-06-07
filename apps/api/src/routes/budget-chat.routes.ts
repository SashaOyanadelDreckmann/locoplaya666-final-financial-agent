import { Router } from 'express';
import { z } from 'zod';

import { asyncHandler } from '../middleware/errorHandler';
import { requireAuth } from '../middleware/auth';
import { fetchIndicador } from '../mcp/tools/market/mindicadorClient';
import { getConfig } from '../config';
import {
  DEFAULT_BUDGET_ROWS,
  canonicalBudgetRowId,
  computeBudgetCompletion,
  computeBudgetInsights,
  computeBudgetSignals,
  computeBudgetTotals,
  extractInferenceQuestionText,
  getEffectiveBudgetRows,
  isBareBudgetAmountAnswer,
  reconcileBudgetRows,
  resolveBudgetChatTargetRow,
  type BudgetRow,
} from '@financial-agent/shared';

const router = Router();

const BUDGET_CHAT_TEXT_LIMIT = 260;
const MARKET_SNAPSHOT_CACHE_MS = 5 * 60_000;
const MARKET_SNAPSHOT_SOFT_TIMEOUT_MS = 2_500;

type BudgetProduct = {
  label?: string;
  bank?: string;
  productType?: string;
  dashboardSummary?: string;
  alerts?: string[];
  topCategories?: Array<{ name?: string; amount?: number }>;
};

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
  provider: 'deterministic';
  market_snapshot: MarketSnapshot;
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
            .slice(0, 4)
        : [],
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
  return Math.max(0, Math.round(Number(value) || 0)).toLocaleString('es-CL');
}

function findBudgetFocusRow(rows: BudgetRow[], preferredRowId?: string | null): BudgetRow | null {
  if (preferredRowId) {
    const canonical = canonicalBudgetRowId(preferredRowId);
    const direct = rows.find((row) => canonicalBudgetRowId(row.id) === canonical) ?? null;
    if (direct) return direct;
  }
  return rows.find((row) => Number(row.amount ?? 0) <= 0) ?? rows[0] ?? null;
}

function buildQuestionForRow(row: BudgetRow | null, intakeData: Record<string, unknown>, products: BudgetProduct[]) {
  if (!row) return '¿Cuánto es tu ingreso principal mensual?';
  switch (row.id) {
    case 'income_salary':
      return typeof intakeData.exactMonthlyIncome === 'number'
        ? `En tu perfil hay ~$${formatClp(Number(intakeData.exactMonthlyIncome) || 0)}. ¿Lo dejamos como ingreso principal?`
        : '¿Cuánto es tu ingreso principal mensual?';
    case 'income_extra':
      return '¿Tienes ingresos extra mensuales? Indica monto.';
    case 'expense_rent':
      return '¿Cuánto pagas al mes en vivienda o dividendo?';
    case 'expense_food':
      return '¿Cuánto gastas al mes en comida y supermercado?';
    case 'expense_transport':
      return '¿Cuánto va al mes en transporte y bencina?';
    case 'expense_services':
      return '¿Cuánto pagas al mes en servicios e internet?';
    case 'expense_debt':
      return '¿Cuánto pagas al mes en cuotas o créditos?';
    case 'expense_savings':
      return '¿Cuánto apartas al mes para ahorro o inversión?';
    default:
      return row.type === 'income'
        ? `¿Monto mensual de ${row.category || 'este ingreso'}?`
        : `¿Monto mensual de ${row.category || 'este gasto'}?`;
  }
}

function hasMeaningfulIntake(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const data = value as Record<string, unknown>;
  return (
    typeof data.employmentStatus === 'string' ||
    typeof data.incomeBand === 'string' ||
    typeof data.exactMonthlyIncome === 'number' ||
    typeof data.hasDebt === 'boolean' ||
    typeof data.hasSavingsOrInvestments === 'boolean'
  );
}

function summarizeIntakeContext(value: unknown): Record<string, unknown> {
  if (!hasMeaningfulIntake(value)) return {};
  const data = value as Record<string, unknown>;
  return {
    age: data.age,
    employmentStatus: data.employmentStatus,
    exactMonthlyIncome: data.exactMonthlyIncome,
    incomeBand: data.incomeBand,
    hasDebt: data.hasDebt,
    hasSavingsOrInvestments: data.hasSavingsOrInvestments,
  };
}

function buildBudgetFocusQuestion(
  rows: BudgetRow[],
  activeRow: BudgetRow | null,
  intakeData: Record<string, unknown>,
  products: BudgetProduct[],
  preferredRowId?: string | null,
) {
  const focus = activeRow && rows.some((row) => row.id === activeRow.id)
    ? activeRow
    : findBudgetFocusRow(rows, preferredRowId);
  return {
    focus,
    question: buildQuestionForRow(focus, intakeData, products),
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
  if (/\b(elimina|eliminar|borra|borrar|quita|quitar|remove|delete)\b/.test(text)) return 'delete_row';
  if (/\b(resumen|status|estado|como voy|balance|diagnostico|review)\b/.test(text)) return 'status_review';
  if (/\b(recomiendas|recomendar|conviene|mejor|optimizar|ahorrar|consejo)\b/.test(text)) return 'advice';
  if (/\b(agrega|agregar|anade|añade|incluye|incorpora|nuevo|nueva|create|add)\b/.test(text)) return 'add_row';
  if (/\?$/.test(answer.trim()) || /\b(que|como|por que|cual|cuanto)\b/.test(text)) return 'question';
  if (/\d/.test(text)) return 'update_amount';
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

function buildBudgetReply(input: {
  reply: string;
  followUp?: string | null;
  focus_row_id?: string | null;
  done?: boolean;
  actions?: Array<Record<string, unknown>>;
  action?: Record<string, unknown> | null;
  source: string;
  market_snapshot?: MarketSnapshot;
}): BudgetChatResponse {
  const followUp = sanitizeQuestion(input.followUp ?? null);
  const reply = compactText(input.reply, BUDGET_CHAT_TEXT_LIMIT);
  return {
    ok: true,
    assistant_text: reply,
    assistant_reply: reply,
    next_question: followUp,
    focus_row_id: input.focus_row_id ?? null,
    done: Boolean(input.done),
    coach_message: null,
    actions: input.actions ?? [],
    action: input.action ?? (input.actions?.[0] ?? null),
    source: input.source,
    provider: 'deterministic',
    market_snapshot: input.market_snapshot ?? emptyMarketSnapshot(),
  };
}

function buildDeterministicUpdate(params: {
  rows: BudgetRow[];
  answer: string;
  question: string;
  intakeData: Record<string, unknown>;
  products: BudgetProduct[];
  assistantFocusRowId?: string | null;
  manualFocusRowId?: string | null;
  activeRow?: BudgetRow | null;
}) {
  const targetRow =
    resolveBudgetChatTargetRow(params.rows, extractInferenceQuestionText(params.question) || params.question, {
      manualFocusRowId: params.manualFocusRowId ?? null,
      assistantFocusRowId: params.assistantFocusRowId ?? null,
      activeRow: params.activeRow ?? null,
    }) ?? findBudgetFocusRow(params.rows, null);
  if (!targetRow) return null;
  const amount = extractClpAmount(params.answer);
  if (amount === null) return null;
  const action = {
    kind: 'update',
    id: targetRow.id,
    category: targetRow.category,
    type: targetRow.type,
    amount,
    note: targetRow.note ?? '',
    cadence: normalizeCadence(targetRow.cadence, targetRow.type),
    payment_method: targetRow.paymentMethod ?? (targetRow.type === 'income' ? 'transfer' : 'debit'),
    movement_type: targetRow.movementType ?? undefined,
  };
  const projectedRows = reconcileBudgetRows(
    params.rows.map((row) => (row.id === targetRow.id ? { ...row, amount } : row)),
  );
  const { focus, question } = buildBudgetFocusQuestion(projectedRows, null, params.intakeData, params.products);
  return buildBudgetReply({
    reply: `Listo: ${targetRow.category} quedó en $${formatClp(amount)}.`,
    followUp: question,
    focus_row_id: focus?.id ?? targetRow.id,
    actions: [action],
    action,
    source: 'deterministic_update',
    market_snapshot: emptyMarketSnapshot(),
  });
}

function buildEducationReply(params: {
  answer: string;
  rows: BudgetRow[];
  activeRow: BudgetRow | null;
  intakeData: Record<string, unknown>;
  products: BudgetProduct[];
}) {
  const { focus, question } = buildBudgetFocusQuestion(params.rows, params.activeRow, params.intakeData, params.products);
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
  intakeData: Record<string, unknown>;
  products: BudgetProduct[];
}) {
  const { focus, question } = buildBudgetFocusQuestion(params.rows, params.activeRow, params.intakeData, params.products);
  return buildBudgetReply({
    reply: 'Hola. Partamos por tu ingreso principal y luego completamos los gastos base.',
    followUp: question,
    focus_row_id: focus?.id ?? params.activeRow?.id ?? 'income_salary',
    source: 'deterministic_greeting',
    market_snapshot: emptyMarketSnapshot(),
  });
}

function buildStatusReply(params: {
  rows: BudgetRow[];
  intakeData: Record<string, unknown>;
  products: BudgetProduct[];
}) {
  const snapshot = buildBudgetSnapshot(params.rows);
  const margin = snapshot.income > 0 ? Math.round((snapshot.balance / Math.max(1, snapshot.income)) * 100) : 0;
  const biggest = snapshot.topExpense
    ? `Mayor gasto: ${snapshot.topExpense.category} ($${formatClp(snapshot.topExpense.amount)}).`
    : '';
  const missing = snapshot.missingCoreRows.length > 0 ? `Faltan: ${snapshot.missingCoreRows.slice(0, 3).join(', ')}.` : '';
  const { focus, question } = buildBudgetFocusQuestion(params.rows, null, params.intakeData, params.products);
  return buildBudgetReply({
    reply: `Ingresos $${formatClp(snapshot.income)}, gastos $${formatClp(snapshot.expenses)}, margen ${margin}%. ${biggest} ${missing}`.trim(),
    followUp: question,
    focus_row_id: focus?.id ?? null,
    source: 'deterministic_status',
    market_snapshot: emptyMarketSnapshot(),
    done: snapshot.signals.coreFillRate >= 100,
  });
}

function buildFallbackInit(params: {
  rows: BudgetRow[];
  intakeData: Record<string, unknown>;
  products: BudgetProduct[];
}) {
  const { focus, question } = buildBudgetFocusQuestion(params.rows, null, params.intakeData, params.products, 'income_salary');
  return buildBudgetReply({
    reply: question,
    followUp: question,
    focus_row_id: focus?.id ?? 'income_salary',
    source: 'deterministic_init',
    market_snapshot: emptyMarketSnapshot(),
  });
}

function buildConversationalFallback(params: {
  answer: string;
  rows: BudgetRow[];
  activeRow: BudgetRow | null;
  intakeData: Record<string, unknown>;
  products: BudgetProduct[];
  question: string;
  assistantFocusRowId?: string | null;
  manualFocusRowId?: string | null;
}) {
  const detectedIntent = detectBudgetIntent(params.answer);
  const snapshot = buildBudgetSnapshot(params.rows);

  if (detectedIntent === 'delete_row') {
    const targetRow =
      resolveBudgetChatTargetRow(params.rows, extractInferenceQuestionText(params.question) || params.question, {
        manualFocusRowId: params.manualFocusRowId ?? null,
        assistantFocusRowId: params.assistantFocusRowId ?? null,
        activeRow: params.activeRow ?? null,
      }) ?? findBudgetFocusRow(params.rows, null);
    if (targetRow) {
      const { focus, question } = buildBudgetFocusQuestion(params.rows, null, params.intakeData, params.products);
      return buildBudgetReply({
        reply: `Si quieres eliminar ${targetRow.category}, lo hacemos desde la tabla para evitar borrar algo útil por accidente.`,
        followUp: question,
        focus_row_id: focus?.id ?? targetRow.id,
        source: 'deterministic_delete_hint',
        market_snapshot: emptyMarketSnapshot(),
      });
    }
  }

  if (detectedIntent === 'add_row') {
    const { focus, question } = buildBudgetFocusQuestion(params.rows, params.activeRow, params.intakeData, params.products);
    return buildBudgetReply({
      reply: 'Puedo ayudarte a sumar esa fila, pero necesito que la señales en la tabla para mantener coherencia.',
      followUp: question,
      focus_row_id: focus?.id ?? params.activeRow?.id ?? null,
      source: 'deterministic_add_hint',
      market_snapshot: emptyMarketSnapshot(),
    });
  }

  if (/\d/.test(params.answer) && (isBareBudgetAmountAnswer(params.answer) || detectedIntent === 'update_amount')) {
    const deterministicUpdate = buildDeterministicUpdate({
      rows: params.rows,
      answer: params.answer,
      question: params.question,
      intakeData: params.intakeData,
      products: params.products,
      assistantFocusRowId: params.assistantFocusRowId,
      manualFocusRowId: params.manualFocusRowId,
      activeRow: params.activeRow,
    });
    if (deterministicUpdate) return deterministicUpdate;
  }

  const { focus, question } = buildBudgetFocusQuestion(params.rows, params.activeRow, params.intakeData, params.products);
  const fallbackReply =
    snapshot.balance < 0
      ? 'Hay un déficit que conviene ordenar con vivienda, deuda y gastos variables.'
      : 'Sigamos afinando la tabla para que el balance quede sólido y accionable.';

  return buildBudgetReply({
    reply: fallbackReply,
    followUp: question,
    focus_row_id: focus?.id ?? params.activeRow?.id ?? null,
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
    const intakeData = summarizeIntakeContext(body.intakeData);
    const products = sanitizeProducts(body.products);
    const assistantFocusRowId = compactText(body.assistantFocusRowId, 80) || null;
    const manualFocusRowId = compactText(body.manualFocusRowId, 80) || null;
    const snapshot = buildBudgetSnapshot(rows);

    if (intent === 'init') {
      const marketSnapshot = await getMarketSnapshotOptional();
      return res.json({
        ...buildFallbackInit({ rows, intakeData, products }),
        market_snapshot: marketSnapshot,
      });
    }

    if (intent === 'reply' && answer && isBareBudgetAmountAnswer(answer) && /\d/.test(answer)) {
      const deterministicUpdate = buildDeterministicUpdate({
        rows,
        answer,
        question,
        intakeData,
        products,
        assistantFocusRowId,
        manualFocusRowId,
        activeRow: resolvedActiveRow,
      });
      if (deterministicUpdate) {
        return res.json({
          ...deterministicUpdate,
          market_snapshot: emptyMarketSnapshot(),
        });
      }
    }

    if (intent === 'reply' && isEducationalBudgetQuestion(answer)) {
      return res.json({
        ...buildEducationReply({ answer, rows, activeRow: resolvedActiveRow, intakeData, products }),
        market_snapshot: emptyMarketSnapshot(),
      });
    }

    if (intent === 'reply' && detectBudgetIntent(answer) === 'greeting') {
      return res.json({
        ...buildGreetingReply({ rows, activeRow: resolvedActiveRow, intakeData, products }),
        market_snapshot: emptyMarketSnapshot(),
      });
    }

    if (intent === 'reply' && detectBudgetIntent(answer) === 'status_review') {
      return res.json({
        ...buildStatusReply({ rows, intakeData, products }),
        market_snapshot: emptyMarketSnapshot(),
      });
    }

    const marketSnapshot = await getMarketSnapshotOptional();
    return res.json({
      ...buildConversationalFallback({
        answer,
        rows,
        activeRow: resolvedActiveRow,
        intakeData,
        products,
        question,
        assistantFocusRowId,
        manualFocusRowId,
      }),
      market_snapshot: marketSnapshot,
      source: snapshot.signals.coreFillRate >= 100 ? 'deterministic_fallback_complete' : 'deterministic_fallback',
    });
  }),
);

export default router;
