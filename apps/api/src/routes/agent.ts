import { Router } from 'express';
import { z } from 'zod';
import { timingSafeEqual } from 'crypto';
import { runCoreAgent } from '../agents/core.agent/core-agent-orchestrator';
import {
  initAgentSseResponse,
  wantsAgentStream,
  type AgentProgressReporter,
} from '../agents/core.agent/agent-stream.reporter';
import { ChatAgentInputSchema } from '../agents/core.agent/chat.types';
import {
  attachProfileToUser,
  removeInjectedProfileFromUser,
  mergeFinancialContextIntoIntake,
  replaceIntakeEnvelopeForDev,
  persistWelcomeIntroCache,
  removeInjectedIntakeFromUser,
  saveUserSheets,
  loadUserSheets,
  loadUserPanelState,
  saveUserPanelState,
  saveUserMemoryBlob,
  loadUserMemoryBlob,
} from '../services/user.service';
import { publishFinancialContextMergeObservation } from '../context-fabric/context-fabric.publish.service';
import { getContextFabricSessionSnapshot } from '../context-fabric/context-fabric.service';
import { buildInterviewFabricSupplement } from '../context-fabric/context-fabric.integration.helpers';
import type { WelcomeIntroCache } from '@financial-agent/shared';
import {
  extractIntakeEnvelope,
} from '@financial-agent/shared';
import {
  listConversationTurns,
  upsertConversationTurnRecord,
} from '../persistencia/repos';
import type { StoredPanelState } from '../persistencia/types';
import { complete, runWithLLMCostTracking } from '../services/llm.service';
import {
  buildActionPlanSuggestedReplies,
  buildSocialConsciousnessFallbackMessage,
  buildSocialConsciousnessSuggestedReplies,
  resolveActionPlanFunnelStage,
  resolveSocialConsciousnessFunnelStage,
} from '@financial-agent/shared';
import {
  resolveWelcomeIntroForUser,
} from '../agents/welcome/welcome-intro';
import { researchWelcomeProductHints } from '../services/welcome-product-research.service';
import {
  appendTurnToMemoryRealtime,
  buildAgentMemoryContextRealtime,
} from '../services/memory.service';
import {
  applyLifecycleAfterResponse,
  buildLifecycleDecision,
  detectOnboardingSignals,
  getLifecycleFromMemory,
  lifecycleMeta,
} from '../services/product-lifecycle.service';
import {
  searchUserDocumentContext,
} from '../services/document-intelligence.service';
import { asyncHandler } from '../middleware/errorHandler';
import { requireAuth, requirePermission } from '../middleware/auth';
import { badRequest, fincoinsDepleted, forbidden, unauthorized } from '../http/api.errors';
import {
  canAffordOperation,
  chargeActualUsdSpent,
  chargeFincoinOperation,
  ensureFincoinDepletionHandled,
  fincoinUsagePayload,
  getFincoinUsageForUser,
} from '../services/fincoin.service';
import { sendSuccess } from '../http/api.responses';
import { parseBody, parseQuery } from '../http/parse';
import { hasPermission, PERMISSIONS, type UserRole } from '../auth/rbac';
import {
  repairUserSheetsFromTurns,
} from '../services/sheet-restore.service';
import { resolveUserDiagnosticProfile } from '../services/diagnostic-profile.service';
import {
  getSocialReflectionsFromMemory,
  mergeSocialReflectionsInMemory,
  pickSocialReflectionSession,
  sanitizeSocialReflectionSession,
} from '../services/social-consciousness-reflections.service';
import { getConfig } from '../config';
import { fetchIndicador } from '../mcp/tools/market/mindicadorClient';
import {
  INTERVIEW_CLOSEOUT_BUFFER_SEC,
  INTERVIEW_MAX_CALLS_PER_USER,
  INTERVIEW_TOTAL_LIMIT_MINUTES,
  INTERVIEW_TOTAL_LIMIT_SEC,
  INTERVIEW_REALTIME_VOICES,
  INTERVIEW_REALTIME_VOICE_DEFAULT,
  INTERVIEW_REALTIME_VOICE_SPEED,
  buildVoiceSessionInstructions,
  countInterviewVoiceSourcesLoaded,
  evaluateInterviewVoiceTokenGate,
  mergeInterviewVoiceQuotaMonotonic,
  normalizeInterviewVoiceFinalSummary,
  normalizeInterviewVoiceMinuteSummaries,
  resolveInterviewCallsStarted,
  resolveInterviewUsedSeconds,
  resolveInterviewVoiceIntakeContext,
  getRemainingChatTurns,
  CORE_AGENT_HISTORY_TURN_LIMIT,
  resolveCoreAgentHistoryLimits,
  shouldAttachLiveMarketSnapshot,
} from '@financial-agent/shared';

const router = Router();
const config = getConfig();
const OPENAI_REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL?.trim() || 'gpt-realtime-mini';
const OPENAI_REALTIME_VOICE = (() => {
  const requested = process.env.OPENAI_REALTIME_VOICE?.trim().toLowerCase();
  if (requested && (INTERVIEW_REALTIME_VOICES as readonly string[]).includes(requested)) {
    return requested;
  }
  return INTERVIEW_REALTIME_VOICE_DEFAULT;
})();

function shouldAttachLiveMarketContext(params: { userMessage: string; activeChatId?: unknown }) {
  void params.activeChatId;
  return shouldAttachLiveMarketSnapshot(params.userMessage);
}

const MARKET_SNAPSHOT_CACHE_MS = 5 * 60_000;
let cachedMarketSnapshot:
  | { ts: number; snapshot: Awaited<ReturnType<typeof buildLiveMarketContext>> }
  | null = null;

async function buildLiveMarketContext() {
  const [ufResult, tpmResult, usdResult] = await Promise.allSettled([
    fetchIndicador('uf'),
    fetchIndicador('tpm'),
    fetchIndicador('dolar'),
  ]);

  const normalize = (result: PromiseSettledResult<Awaited<ReturnType<typeof fetchIndicador>>>) =>
    result.status === 'fulfilled'
      ? {
          value: result.value.valor,
          unit: result.value.unidad,
          date: result.value.fecha,
          source: result.value.url,
        }
      : { value: null, unit: null, date: null, source: null };

  const uf = normalize(ufResult);
  const tpm = normalize(tpmResult);
  const usd = normalize(usdResult);

  return {
    uf,
    tpm,
    usd,
    summary: [
      uf.value !== null ? `UF ${Number(uf.value).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : null,
      tpm.value !== null ? `TPM ${Number(tpm.value).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%` : null,
      usd.value !== null ? `USD/CLP ${Number(usd.value).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : null,
    ]
      .filter(Boolean)
      .join(' · '),
  };
}

async function getLiveMarketContextCached() {
  const now = Date.now();
  if (cachedMarketSnapshot && now - cachedMarketSnapshot.ts < MARKET_SNAPSHOT_CACHE_MS) {
    return cachedMarketSnapshot.snapshot;
  }
  const snapshot = await buildLiveMarketContext();
  cachedMarketSnapshot = { ts: now, snapshot };
  return snapshot;
}

export function normalizeForSimilarity(text: string) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isTooSimilarMessage(a: string, b: string) {
  const na = normalizeForSimilarity(a);
  const nb = normalizeForSimilarity(b);
  if (!na || !nb) return false;
  return na === nb;
}

function toFiniteNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'string' && value.trim().length === 0) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function resolveInjectedBudget(params: {
  context?: Record<string, unknown>;
  uiState?: Record<string, unknown>;
}): { income: number; expenses: number; balance: number } {
  const context = params.context ?? {};
  const uiState = params.uiState ?? {};
  const contextBudget =
    context.injected_budget && typeof context.injected_budget === 'object'
      ? (context.injected_budget as Record<string, unknown>)
      : {};
  const persistedBudget =
    context.persisted_budget_context && typeof context.persisted_budget_context === 'object'
      ? (context.persisted_budget_context as Record<string, unknown>)
      : context.injected_intake &&
          typeof context.injected_intake === 'object' &&
          (context.injected_intake as Record<string, unknown>).budgetContext &&
          typeof (context.injected_intake as Record<string, unknown>).budgetContext === 'object'
        ? ((context.injected_intake as Record<string, unknown>).budgetContext as Record<string, unknown>)
        : {};
  const uiBudget =
    uiState.budget_summary && typeof uiState.budget_summary === 'object'
      ? (uiState.budget_summary as Record<string, unknown>)
      : {};

  const uiIncome = toFiniteNumber(uiBudget.income);
  const uiExpenses = toFiniteNumber(uiBudget.expenses);
  const uiBalance = toFiniteNumber(uiBudget.balance);
  const contextIncome = toFiniteNumber(contextBudget.income ?? persistedBudget.income);
  const contextExpenses = toFiniteNumber(contextBudget.expenses ?? persistedBudget.expenses);
  const contextBalance = toFiniteNumber(contextBudget.balance ?? persistedBudget.balance);

  const income = uiIncome ?? contextIncome ?? 0;
  const expenses = uiExpenses ?? contextExpenses ?? 0;
  const balance =
    uiBalance ??
    (uiIncome !== null && uiExpenses !== null ? uiIncome - uiExpenses : null) ??
    contextBalance ??
    income - expenses;
  return { income, expenses, balance };
}

function toDocumentPreview(document: unknown): Record<string, unknown> | null {
  if (!document || typeof document !== 'object') return null;
  const candidate = document as Record<string, unknown>;
  const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
  const text = typeof candidate.text === 'string' ? candidate.text.trim() : '';
  const documentId = typeof candidate.documentId === 'string' ? candidate.documentId.trim() : '';
  if (!name && !text && !documentId) return null;
  return {
    name: name || 'Documento financiero',
    text: text.slice(0, 2400),
    documentId: documentId || undefined,
    summary: candidate.summary,
    structuredData: candidate.structuredData,
    indexed: candidate.indexed,
    source: candidate.source,
  };
}

function mergeUniqueDocuments(...sources: unknown[][]): Record<string, unknown>[] {
  const dedup = new Map<string, Record<string, unknown>>();
  for (const source of sources) {
    for (const item of source) {
      const preview = toDocumentPreview(item);
      if (!preview) continue;
      const key = String(preview.documentId || preview.name || preview.text).toLowerCase();
      if (!dedup.has(key)) dedup.set(key, preview);
    }
  }
  return Array.from(dedup.values());
}

function buildPersistedTransactionsContext(productsContext: Record<string, unknown>) {
  const activeProduct =
    productsContext.activeProduct && typeof productsContext.activeProduct === 'object'
      ? (productsContext.activeProduct as Record<string, unknown>)
      : null;
  const transactionSummary =
    productsContext.transactionSummary && typeof productsContext.transactionSummary === 'object'
      ? (productsContext.transactionSummary as Record<string, unknown>)
      : {};
  const productsIndex = Array.isArray(productsContext.productsIndex)
    ? productsContext.productsIndex.slice(0, 20)
    : [];
  const uploadedFiles = Array.isArray(productsContext.uploadedFiles)
    ? productsContext.uploadedFiles.slice(0, 20)
    : [];

  return {
    transactions: {
      scope: productsContext.scope ?? 'persisted_products',
      activeProductId: productsContext.activeProductId ?? activeProduct?.id ?? null,
      activeProductLabel: productsContext.activeProductLabel ?? activeProduct?.label ?? null,
      activeProductBank: activeProduct?.bank ?? null,
      activeProductType: activeProduct?.productType ?? null,
      connected: Boolean(activeProduct?.connected),
      productsCount: Number(productsContext.productsCount ?? productsIndex.length ?? 0),
      uploadedFiles,
      activeProductMovementCount: Number(
        ((activeProduct?.keyMetrics as Record<string, unknown> | undefined)?.movement_count as number | undefined) ??
          0
      ),
      productsIndex,
      activeProduct,
      transactionSummary,
    },
  };
}

function hydrateAgentFinancialContext(params: {
  context: Record<string, unknown>;
  intakeEnvelope?: IntakeEnvelope;
}) {
  const intakeEnvelope = params.intakeEnvelope ?? {};
  const productsContext =
    intakeEnvelope.productsContext && typeof intakeEnvelope.productsContext === 'object'
      ? (intakeEnvelope.productsContext as Record<string, unknown>)
      : {};
  const budgetContext =
    intakeEnvelope.budgetContext && typeof intakeEnvelope.budgetContext === 'object'
      ? (intakeEnvelope.budgetContext as Record<string, unknown>)
      : {};
  const requestDocuments = Array.isArray(params.context.uploaded_documents)
    ? params.context.uploaded_documents
    : [];
  const persistedDocuments = activeProductDocumentsFromProductsContext(productsContext);
  const uploadedDocuments = mergeUniqueDocuments(requestDocuments, persistedDocuments).slice(0, 10);
  const requestConsolidated =
    params.context.consolidated_context && typeof params.context.consolidated_context === 'object'
      ? (params.context.consolidated_context as Record<string, unknown>)
      : {};
  const persistedConsolidated = buildPersistedTransactionsContext(productsContext);

  return {
    ...params.context,
    uploaded_documents: uploadedDocuments,
    uploaded_evidence_files:
      Array.isArray(params.context.uploaded_evidence_files) && params.context.uploaded_evidence_files.length > 0
        ? params.context.uploaded_evidence_files
        : Array.isArray(productsContext.uploadedFiles)
          ? productsContext.uploadedFiles.slice(0, 20)
          : [],
    consolidated_context: {
      ...persistedConsolidated,
      ...requestConsolidated,
      transactions: {
        ...(persistedConsolidated.transactions as Record<string, unknown>),
        ...((requestConsolidated.transactions as Record<string, unknown> | undefined) ?? {}),
      },
    },
    persisted_products_context:
      Object.keys(productsContext).length > 0 ? productsContext : params.context.persisted_products_context,
    persisted_budget_context:
      Object.keys(budgetContext).length > 0 ? budgetContext : params.context.persisted_budget_context,
  };
}

function activeProductDocumentsFromProductsContext(productsContext: Record<string, unknown>): unknown[] {
  const activeProduct =
    productsContext.activeProduct && typeof productsContext.activeProduct === 'object'
      ? (productsContext.activeProduct as Record<string, unknown>)
      : null;
  if (!activeProduct) return [];
  const parsedDocuments = Array.isArray(activeProduct.parsedDocuments) ? activeProduct.parsedDocuments : [];
  const documentPreviews = Array.isArray(activeProduct.documentPreviews)
    ? activeProduct.documentPreviews
    : [];
  return [...parsedDocuments, ...documentPreviews];
}

function buildBudgetPanelGuidance() {
  return [
    'Para actualizar tu presupuesto en el panel, haz esto en 60 segundos:',
    '1) Abre el panel lateral y entra a Presupuesto.',
    '2) Edita o agrega filas de ingresos y gastos con monto mensual.',
    '3) Guarda y vuelve al chat para que recalculamos tu diagnóstico al instante.',
    '',
    'Si quieres, te guío categoría por categoría ahora mismo.',
  ].join('\n');
}

function buildBlockedPanelAction(activeChatId: string) {
  if (activeChatId === 'chat-2' || activeChatId === 'chat-3') {
    return {
      section: 'interview' as const,
      message: 'Completa la entrevista y el diagnostico integrado para desbloquear este chat.',
    };
  }
  return {
    section: 'budget' as const,
    message: 'Completa presupuesto y cartolas para desbloquear los chats especializados.',
  };
}

function buildContextualSuggestedReplies(params: {
  phase?: unknown;
  activeChatId?: unknown;
  hasBudget?: boolean;
  hasTransactions?: boolean;
  turnCount?: number;
  closingMode?: boolean;
  userMessage?: string;
}) {
  const phase = String(params.phase ?? '');
  const activeChatId = String(params.activeChatId ?? 'chat-1');
  if (activeChatId === 'chat-2') {
    const stage =
      resolveActionPlanFunnelStage({
        activeChatId: 'chat-2',
        turnCount: params.turnCount,
        closingMode: params.closingMode,
        userMessage: params.userMessage,
      }) ?? 'brainstorm';
    return buildActionPlanSuggestedReplies(stage);
  }
  if (activeChatId === 'chat-3') {
    const stage =
      resolveSocialConsciousnessFunnelStage({
        activeChatId: 'chat-3',
        turnCount: params.turnCount,
        closingMode: params.closingMode,
        userMessage: params.userMessage,
      }) ?? 'explore';
    return buildSocialConsciousnessSuggestedReplies(stage);
  }
  if (params.hasBudget && params.hasTransactions) return ['Abrir entrevista breve', 'Revisar presupuesto', 'Ver cartola'];
  if (phase === 'transactions_needed') return ['Subir cartola', 'Explorar deuda', 'Simular ahorro'];
  if (phase === 'budget_needed') return ['Completar presupuesto', 'Ver balance', 'Probar escenario'];
  return ['Revisemos mi presupuesto', 'Hazme una simulación simple', 'Resume mi situación financiera'];
}

function buildLifecycleSuggestedReplies(params: {
  lifecycleDecision: {
    state: { phase: string; chatTurns: Record<string, number> };
    activeChatId: string;
    closingMode: boolean;
  };
  onboardingSignals: { hasBudget: boolean; hasTransactions: boolean };
  userMessage?: string;
}) {
  const { lifecycleDecision, onboardingSignals, userMessage } = params;
  return buildContextualSuggestedReplies({
    phase: lifecycleDecision.state.phase,
    activeChatId: lifecycleDecision.activeChatId,
    hasBudget: onboardingSignals.hasBudget,
    hasTransactions: onboardingSignals.hasTransactions,
    turnCount: lifecycleDecision.state.chatTurns[lifecycleDecision.activeChatId] ?? 0,
    closingMode: lifecycleDecision.closingMode,
    userMessage,
  });
}

function normalizeQuestionTopic(text: string) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function buildTransactionsNeededFallback(userMessage: string) {
  const text = normalizeQuestionTopic(userMessage);
  if (/\b(deuda|cuota|credito|prestamo|morosidad)\b/.test(text)) {
    return [
      'Si tu duda es sobre deuda, la regla práctica es priorizar vencimientos, evitar nuevas obligaciones y pagar primero lo caro o atrasado.',
      'En paralelo, sube tu cartola o transacciones del mes para aterrizarlo a números reales y no a supuestos.',
    ].join('\n\n');
  }
  if (/\b(apv|inversion|invertir|fondo|etf|acciones?)\b/.test(text)) {
    return [
      'Si tu duda es sobre APV o inversión, primero conviene asegurar caja mensual y un colchón mínimo antes de subir riesgo.',
      'Cuando cargues la cartola, te digo cuánto margen real tienes para invertir sin apretar el flujo.',
    ].join('\n\n');
  }
  if (/\b(ahorro|emergencia|colchon|respaldo)\b/.test(text)) {
    return [
      'Si tu duda es sobre ahorro, la meta base es automatizar una transferencia pequeña pero constante y no tocarla salvo emergencia real.',
      'Si subes la cartola, la ajusto a tu flujo mensual y te digo un monto sostenible.',
    ].join('\n\n');
  }
  return [
    'Puedo responder tu duda, pero todavía me falta la cartola o transacciones del mes para afinar el diagnóstico sin adivinar.',
    'Sube ese respaldo y te devuelvo un análisis ejecutivo con foco en lo que realmente está pasando.',
  ].join('\n\n');
}

export function buildResilientFallbackMessage(params: {
  userMessage: string;
  phase?: unknown;
  activeChatId?: unknown;
  hasBudget?: boolean;
  hasTransactions?: boolean;
}) {
  const userMessage = String(params.userMessage ?? '').trim();
  if (/\b(c[oó]mo|como).*\b(actualiz|editar|cambiar|completar).*\b(presupuesto)\b/i.test(userMessage)) {
    if (params.hasBudget) {
      return [
        'Ya tengo tu presupuesto cargado. Si quieres, te doy una lectura ejecutiva del balance, la tasa de ahorro y los riesgos concretos.',
        'Si hay una cifra que no te calza, la validamos en el panel y no la doy por cierta hasta confirmarla.',
      ].join('\n\n');
    }
    return buildBudgetPanelGuidance();
  }
  if (/\b(presupuesto|ingresos|gastos|flujo)\b/i.test(userMessage)) {
    if (params.hasBudget) {
      return [
        'Ya veo tu presupuesto validado en el sistema. Puedo ayudarte a interpretarlo, detectar tensiones y priorizar ajustes sin pedirte que lo rehagas.',
        'Si quieres, te marco ahora mismo qué es consistente y qué conviene confirmar.',
      ].join('\n\n');
    }
    return [
      'Vamos directo a algo útil: primero actualizamos tu presupuesto en el panel y luego te doy una lectura ejecutiva de balance, tasa de ahorro y riesgos.',
      'Si me compartes ingreso mensual, gastos fijos y gastos variables, lo dejamos estructurado ahora.',
    ].join('\n\n');
  }
  if (/\b(cartola|transacci[oó]n|movimientos?|estado de cuenta)\b/i.test(userMessage)) {
    if (params.hasTransactions) {
      return [
        'Ya tengo tus movimientos/cartolas integrados. Puedo leer patrones, alertas y relaciones entre productos sin pedirte que vuelvas a subirlos.',
        'Si algo luce inconsistente, lo contrasto contigo antes de asumirlo como verdad.',
      ].join('\n\n');
    }
    return [
      'Perfecto. Sube tu cartola o transacciones del mes en el panel y te devuelvo un informe ejecutivo con patrones de gasto, alertas y próximos pasos.',
      'En cuanto esté cargada, sigo desde ahí sin repetir contexto.',
    ].join('\n\n');
  }

  const phase = String(params.phase ?? '');
  const activeChatId = String(params.activeChatId ?? 'chat-1');
  if (activeChatId === 'chat-2') {
    return [
      'Tuvimos una intermitencia breve, pero seguimos en el embudo del plan de accion.',
      'Retomemos: dime si quieres seguir explorando ideas, afilar prioridades o cerrar ya el plan estructurado.',
    ].join('\n\n');
  }
  if (activeChatId === 'chat-3') {
    return buildSocialConsciousnessFallbackMessage();
  }
  if (phase === 'budget_needed') return buildBudgetPanelGuidance();
  if (phase === 'transactions_needed') {
    return buildTransactionsNeededFallback(userMessage);
  }

  return [
    'Hubo una intermitencia técnica puntual, pero sigo contigo en el flujo.',
    'Para avanzar sin perder tiempo, dime cuál de estos pasos quieres ejecutar ahora: presupuesto, cartola o entrevista breve.',
  ].join('\n\n');
}

export function shouldReplaceWithDuplicateFallback(params: {
  response: Record<string, unknown>;
  recentAssistantMessages: string[];
}): boolean {
  const message = typeof params.response.message === 'string' ? params.response.message : '';
  if (!message.trim()) return false;

  const hasStructuredOutput =
    (Array.isArray(params.response.artifacts) && params.response.artifacts.length > 0) ||
    (Array.isArray(params.response.agent_blocks) && params.response.agent_blocks.length > 0) ||
    (Array.isArray(params.response.citations) && params.response.citations.length > 0) ||
    (Array.isArray(params.response.budget_updates) && params.response.budget_updates.length > 0);
  if (hasStructuredOutput) return false;

  // Only intervene on short conversational loops; keep rich answers untouched.
  if (message.length > 240) return false;

  return params.recentAssistantMessages.some((msg) => isTooSimilarMessage(msg, message));
}

const InjectProfileSchema = z.object({
  profile: z.record(z.unknown()),
});

const InjectIntakeSchema = z.object({
  intake: z.record(z.unknown()),
  llmSummary: z.unknown().optional(),
  intakeContext: z.record(z.unknown()).optional(),
  productsContext: z.record(z.unknown()).optional(),
  budgetContext: z.record(z.unknown()).optional(),
});

const MergeProductsContextSchema = z.object({
  productsContext: z.record(z.unknown()),
  budgetContext: z.record(z.unknown()).optional(),
});

const SaveSheetsSchema = z.object({
  sheets: z.array(
    z
      .object({
        id: z.string(),
        label: z.string().optional(),
        name: z.string(),
        autoNamed: z.boolean(),
        items: z.array(z.unknown()),
        draft: z.string(),
        status: z.enum(['active', 'context']),
        userMessageCount: z.number(),
        createdAt: z.string(),
        completedAt: z.string().optional(),
        closureSummary: z.record(z.string(), z.unknown()).nullable().optional(),
        generalChatStarted: z.boolean().optional(),
      })
      .passthrough(),
  ),
});

const PersistedDocumentSchema = z
  .object({
    documentId: z.string().min(1).optional(),
    name: z.string(),
    text: z.string(),
    summary: z.unknown().optional(),
    structuredData: z.unknown().optional(),
    indexed: z.boolean().optional(),
    insight: z
      .object({
        format: z.string().optional(),
        reliability: z.number().optional(),
        extracted_rows: z.number().optional(),
        key_findings: z.array(z.string()).optional(),
      })
      .partial()
      .optional(),
  })
  .passthrough();

const PersistedAssistantMessageSchema = z
  .object({
    id: z.string(),
    role: z.enum(['assistant', 'user']),
    text: z.string(),
    createdAt: z.string(),
    attachments: z.array(z.string()).optional(),
  })
  .passthrough();

const ConversationHistoryQuerySchema = z.object({
  chatId: z.string().trim().min(1).max(80).optional(),
  sessionId: z.string().trim().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const PersistedDashboardSchema = z
  .object({
    period: z.object({ from: z.string().optional(), to: z.string().optional() }).partial().optional(),
    currency: z.string().optional(),
    keyMetrics: z.record(z.string(), z.union([z.number(), z.null()])).optional(),
    topCategories: z.array(z.object({ name: z.string(), amount: z.number() }).passthrough()).optional(),
    categoryExamples: z
      .array(z.object({ name: z.string(), amount: z.number(), examples: z.array(z.string()) }).passthrough())
      .optional(),
    spendClusters: z.array(z.record(z.string(), z.unknown())).optional(),
    topExpenses: z.array(z.record(z.string(), z.unknown())).optional(),
    topIncome: z.array(z.record(z.string(), z.unknown())).optional(),
    alerts: z.array(z.string()).optional(),
    alertDetails: z.array(z.record(z.string(), z.unknown())).optional(),
    opportunities: z.array(z.string()).optional(),
    metricExplanations: z.array(z.record(z.string(), z.unknown())).optional(),
    movements: z.array(z.record(z.string(), z.unknown())).optional(),
    summary: z.string().optional(),
  })
  .passthrough();

const PersistedBankProductSchema = z
  .object({
    id: z.string(),
    label: z.string().optional().default(''),
    bank: z.string().optional().default(''),
    productType: z.string().optional().default('checking_account'),
    simulationAccepted: z.boolean().optional(),
    connected: z.boolean().optional(),
    randomMode: z.boolean().optional(),
    uploadedFiles: z.array(z.string()).optional(),
    parsedDocuments: z.array(PersistedDocumentSchema).optional(),
    assistant: z
      .object({
        messages: z.array(PersistedAssistantMessageSchema).optional(),
        uploadFormat: z.string().nullable().optional(),
        summaryText: z.string().nullable().optional(),
        summaryModel: z.string().nullable().optional(),
        summaryGeneratedAt: z.string().nullable().optional(),
        summaryRegenerationsUsed: z.number().optional(),
        lastSummaryFeedback: z.string().nullable().optional(),
      })
      .passthrough()
      .optional(),
    dashboard: PersistedDashboardSchema.optional(),
  })
  .passthrough();

const SavedReportGroupSchema = z.enum(['plan_action', 'simulation', 'budget', 'diagnosis', 'other']);

const SavePanelStateSchema = z.object({
  panelState: z.object({
    budgetRows: z.array(
      z.object({
        id: z.string(),
        category: z.string(),
        type: z.enum(['income', 'expense']),
        amount: z.number(),
        note: z.string().default(''),
      }).passthrough(),
    ),
    budgetChatAnswers: z.array(z.object({ q: z.string(), a: z.string() })).optional(),
    bankSimulation: z
      .object({
        products: z.array(PersistedBankProductSchema).optional(),
        taxonomyOverrides: z.array(z.record(z.string(), z.unknown())).optional(),
        activeProductId: z.string().nullable().optional(),
        lockedMonth: z.string().nullable().optional(),
        connected: z.boolean().optional(),
        randomMode: z.boolean().optional(),
        productsModuleSkipped: z.boolean().optional(),
        uploadedFiles: z.array(z.string()).optional(),
        parsedDocuments: z.array(PersistedDocumentSchema).optional(),
      })
      .passthrough(),
    savedReports: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        fileUrl: z.string(),
        createdAt: z.string(),
        group: SavedReportGroupSchema.optional().default('other'),
      }).passthrough(),
    ),
    txProductsCreatedTotal: z.number().optional(),
    updatedAt: z.string(),
  }).passthrough(),
});

function normalizePanelStateForStore(
  panelState: z.input<typeof SavePanelStateSchema>['panelState'],
): StoredPanelState {
  return {
    ...panelState,
    budgetRows: panelState.budgetRows.map((row) => ({
      id: row.id,
      category: row.category,
      type: row.type,
      amount: row.amount,
      note: row.note ?? '',
    })),
    savedReports: panelState.savedReports.map((report) => {
      const group = report.group ?? 'other';
      return {
        id: report.id,
        title: report.title,
        fileUrl: report.fileUrl,
        createdAt: report.createdAt,
        group:
          group === 'plan_action' ||
          group === 'simulation' ||
          group === 'budget' ||
          group === 'diagnosis'
            ? group
            : 'other',
      };
    }),
    bankSimulation: panelState.bankSimulation,
    budgetChatAnswers: panelState.budgetChatAnswers,
    updatedAt: panelState.updatedAt,
  } as StoredPanelState;
}

type IntakeEnvelope = {
  intake?: Record<string, unknown>;
  intakeContext?: Record<string, unknown>;
  productsContext?: Record<string, unknown>;
  budgetContext?: Record<string, unknown>;
  llmSummary?: unknown;
  [key: string]: unknown;
};

function allowDevInjection(req: { headers?: Record<string, string | string[] | undefined> }) {
  if (process.env.ENABLE_DEV_INJECTION !== 'true') return false;

  const token = process.env.DEV_ADMIN_TOKEN;
  if (!token) return false;

  const header = req.headers?.['x-dev-admin-token'];
  const value = Array.isArray(header) ? header[0] : header;

  if (!value) return false;

  // SECURITY: Use timing-safe comparison to prevent timing attacks
  try {
    return timingSafeEqual(Buffer.from(value), Buffer.from(token));
  } catch {
    // timingSafeEqual throws if buffers have different lengths
    // This is expected for invalid tokens, return false
    return false;
  }
}

function requireDevInjectionAllowed(params: {
  req: Parameters<typeof allowDevInjection>[0];
  role?: UserRole;
}) {
  // SECURITY: Disable dev injection endpoints entirely in production
  if (process.env.NODE_ENV === 'production') {
    throw forbidden('Dev injection endpoints are disabled in production');
  }

  const byToken = allowDevInjection(params.req);
  const byRole = params.role ? hasPermission(params.role, PERMISSIONS.DEV_INJECT) : false;
  if (!byToken && !byRole) {
    throw forbidden('Dev injection endpoint is disabled');
  }
}

router.post(
  '/inject-profile',
  requireAuth,
  asyncHandler(async (req, res) => {
    requireDevInjectionAllowed({ req, role: req.authenticatedUser?.role });

    const { profile } = parseBody(InjectProfileSchema, req.body);
    const user = req.authenticatedUser;
    if (!user) throw unauthorized('Invalid session');

    const ok = await attachProfileToUser(user.id, profile);
    if (!ok) throw badRequest('Failed to attach profile');

    return sendSuccess(res, { updated: true });
  }),
);

router.post(
  '/inject-intake',
  requireAuth,
  asyncHandler(async (req, res) => {
    requireDevInjectionAllowed({ req, role: req.authenticatedUser?.role });

    const { intake, llmSummary, intakeContext, productsContext, budgetContext } = parseBody(InjectIntakeSchema, req.body);
    const user = req.authenticatedUser;
    if (!user) throw unauthorized('Invalid session');

    const ok = await replaceIntakeEnvelopeForDev(
      user.id,
      {
        intake: intake as Record<string, unknown>,
        llmSummary,
        intakeContext,
        productsContext,
        budgetContext,
      },
    );
    if (!ok) throw badRequest('Failed to attach intake');

    return sendSuccess(res, { updated: true });
  }),
);

router.post(
  '/merge-products-context',
  requireAuth,
  requirePermission(PERMISSIONS.PANEL_WRITE_SELF),
  asyncHandler(async (req, res) => {
    const user = req.authenticatedUser;
    if (!user) throw unauthorized('Invalid session');

    const { productsContext, budgetContext } = parseBody(MergeProductsContextSchema, req.body);

    const ok = await mergeFinancialContextIntoIntake(user.id, {
      productsContext,
      budgetContext,
    });
    if (!ok) throw badRequest('Failed to merge financial context into intake');

    try {
      const products =
        productsContext && typeof productsContext === 'object'
          ? (productsContext as Record<string, unknown>)
          : {};
      const budget =
        budgetContext && typeof budgetContext === 'object'
          ? (budgetContext as Record<string, unknown>)
          : {};
      await publishFinancialContextMergeObservation({
        userId: user.id,
        reason: 'panel_merge',
        productsCount: Number(products.productsCount ?? 0) || undefined,
        budgetRowsCount: Array.isArray(budget.rows) ? budget.rows.length : undefined,
      });
    } catch (fabricErr) {
      req.logger?.warn({ msg: 'context_fabric.merge_publish_failed', error: fabricErr });
    }

    return sendSuccess(res, { updated: true });
  }),
);

router.post(
  '/remove-injected-intake',
  requireAuth,
  asyncHandler(async (req, res) => {
    requireDevInjectionAllowed({ req, role: req.authenticatedUser?.role });

    const user = req.authenticatedUser;
    if (!user) throw unauthorized('Invalid session');

    const ok = await removeInjectedIntakeFromUser(user.id);
    if (!ok) throw badRequest('Failed to remove injected intake');

    return sendSuccess(res, { updated: true });
  }),
);

router.post(
  '/remove-injected-profile',
  requireAuth,
  asyncHandler(async (req, res) => {
    requireDevInjectionAllowed({ req, role: req.authenticatedUser?.role });

    const user = req.authenticatedUser;
    if (!user) throw unauthorized('Invalid session');

    const ok = await removeInjectedProfileFromUser(user.id);
    if (!ok) throw badRequest('Failed to remove injected profile');

    return sendSuccess(res, { updated: true });
  }),
);

router.get(
  '/sheets',
  requireAuth,
  requirePermission(PERMISSIONS.PANEL_READ_SELF),
  asyncHandler(async (req, res) => {
    const user = req.authenticatedUser;
    if (!user) throw unauthorized('Not authenticated');

    const storedSheets = await loadUserSheets(user.id);
    const turns = await listConversationTurns({ userId: user.id, limit: 200 });
    const hasStoredSheets = Array.isArray(storedSheets) && storedSheets.length > 0;
    const hasTurnHistory = turns.length > 0;

    if (!hasStoredSheets && !hasTurnHistory) {
      return sendSuccess(res, { sheets: [], repaired: false });
    }

    const { sheets, repaired } = repairUserSheetsFromTurns(storedSheets, turns);

    if (repaired) {
      await saveUserSheets(user.id, sheets);
    }

    return sendSuccess(res, { sheets, repaired });
  }),
);

router.post(
  '/sheets',
  requireAuth,
  requirePermission(PERMISSIONS.PANEL_WRITE_SELF),
  asyncHandler(async (req, res) => {
    const user = req.authenticatedUser;
    if (!user) throw unauthorized('Not authenticated');

    const { sheets } = parseBody(SaveSheetsSchema, req.body);
    const ok = await saveUserSheets(user.id, sheets);
    return sendSuccess(res, { saved: ok });
  }),
);

router.get(
  '/panel-state',
  requireAuth,
  requirePermission(PERMISSIONS.PANEL_READ_SELF),
  asyncHandler(async (req, res) => {
    const user = req.authenticatedUser;
    if (!user) throw unauthorized('Not authenticated');

    const panelState = await loadUserPanelState(user.id);
    return sendSuccess(res, { panelState: panelState ?? null });
  }),
);

router.post(
  '/panel-state',
  requireAuth,
  requirePermission(PERMISSIONS.PANEL_WRITE_SELF),
  asyncHandler(async (req, res) => {
    const user = req.authenticatedUser;
    if (!user) throw unauthorized('Not authenticated');

    const { panelState } = parseBody(SavePanelStateSchema, req.body);
    const ok = await saveUserPanelState(user.id, normalizePanelStateForStore(panelState));
    return sendSuccess(res, { saved: ok });
  }),
);

router.post(
  '/interview/realtime/token',
  requireAuth,
  requirePermission(PERMISSIONS.AGENT_CHAT_SELF),
  asyncHandler(async (req, res) => {
    const user = req.authenticatedUser;
    if (!user) throw unauthorized('Not authenticated');
    if (!config.OPENAI_API_KEY) throw forbidden('Realtime voice is not configured');
    const memoryBlob = (await loadUserMemoryBlob(user.id)) ?? (
      user.memoryBlob && typeof user.memoryBlob === 'object'
        ? (user.memoryBlob as Record<string, unknown>)
        : {}
    );
    const interviewVoice =
      memoryBlob.interviewVoice && typeof memoryBlob.interviewVoice === 'object'
        ? (memoryBlob.interviewVoice as Record<string, unknown>)
        : {};
    const callsStarted = resolveInterviewCallsStarted(interviewVoice);
    const activeCallId =
      typeof interviewVoice.activeCallId === 'string' && interviewVoice.activeCallId.length > 0
        ? interviewVoice.activeCallId
        : null;
    const hasCompletedVoiceInterview =
      Boolean(user.latestDiagnosticProfileId) ||
      interviewVoice.status === 'completed' ||
      Boolean(interviewVoice.lastFinalizedAt) ||
      Boolean(interviewVoice.lastReport);
    const totalUsedSec = resolveInterviewUsedSeconds(interviewVoice);
    const tokenGate = evaluateInterviewVoiceTokenGate({
      callsStarted,
      activeCallId,
      totalUsedSec,
      interviewCompleted: hasCompletedVoiceInterview,
    });
    const isResumeToken = tokenGate.isResume;
    const remainingSec = tokenGate.remainingSec;

    if (!isResumeToken) {
      const usage = getFincoinUsageForUser(user);
      if (usage.depleted || !canAffordOperation(usage, 'voice.realtime')) {
        const summaries = await ensureFincoinDepletionHandled(user.id);
        throw fincoinsDepleted(
          'Tus Fincoins se agotaron. El agente queda en pausa y ya no se realizan llamadas con costo.',
          {
            usage: fincoinUsagePayload(usage),
            closure_summaries: summaries,
          },
        );
      }
    }
    if (!tokenGate.allowed) {
      if (tokenGate.blockReason === 'exhausted') {
        throw forbidden(
          `Límite alcanzado: la entrevista en llamada permite máximo ${INTERVIEW_TOTAL_LIMIT_MINUTES} minutos totales por usuario.`,
        );
      }
      if (tokenGate.blockReason === 'completed') {
        throw forbidden('La entrevista senior por llamada ya fue usada para este usuario.');
      }
      throw forbidden('Esta entrevista permite una sola llamada por usuario.');
    }
    const callId = activeCallId ?? `call_${Date.now()}`;
    const nextCallsStarted = activeCallId ? Math.max(1, callsStarted) : callsStarted + 1;

    const serverIntake = resolveInterviewVoiceIntakeContext(user.injectedIntake);
    const persistedMinuteSummaries = normalizeInterviewVoiceMinuteSummaries(interviewVoice.minuteSummaries);
    const persistedFinalSummary = normalizeInterviewVoiceFinalSummary(interviewVoice.finalSummary);
    const sessionInstructions = [
      buildVoiceSessionInstructions({
        intake: serverIntake,
        minuteSummaries: persistedMinuteSummaries,
        finalSummary: persistedFinalSummary,
        callPhase: 'exploration',
      }),
      await buildInterviewFabricSupplement(user.id),
    ]
      .filter(Boolean)
      .join('\n\n');
    const sourcesLoaded = countInterviewVoiceSourcesLoaded(serverIntake);

    let voiceCharge: Awaited<ReturnType<typeof chargeFincoinOperation>> | null = null;
    if (!isResumeToken) {
      voiceCharge = await chargeFincoinOperation(user.id, 'voice.realtime');
      if (!voiceCharge.charged) {
        const summaries =
          voiceCharge.closureSummaries ?? (await ensureFincoinDepletionHandled(user.id));
        throw fincoinsDepleted(
          'Tus Fincoins se agotaron. El agente queda en pausa y ya no se realizan llamadas con costo.',
          {
            usage: fincoinUsagePayload(voiceCharge.usage),
            closure_summaries: summaries,
          },
        );
      }
    }

    const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session: {
          type: 'realtime',
          model: OPENAI_REALTIME_MODEL,
          audio: {
            input: {
              format: {
                type: 'audio/pcm',
                rate: 24000,
              },
              turn_detection: {
                type: 'server_vad',
                threshold: 0.5,
                prefix_padding_ms: 300,
                silence_duration_ms: 650,
              },
            },
            output: {
              voice: OPENAI_REALTIME_VOICE,
              speed: INTERVIEW_REALTIME_VOICE_SPEED,
            },
          },
          instructions: sessionInstructions,
        },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      let detail = text;
      try {
        const parsed = JSON.parse(text);
        detail = parsed?.error?.message ?? parsed?.message ?? text;
      } catch { /* use raw text */ }
      throw badRequest(`OpenAI Realtime error (${response.status}): ${detail}`);
    }

    const data = await response.json();
    const value =
      typeof data?.client_secret?.value === 'string' && data.client_secret.value.length > 0
        ? data.client_secret.value
        : typeof data?.value === 'string' && data.value.length > 0
        ? data.value
        : null;
    const expiresAt =
      typeof data?.client_secret?.expires_at === 'number'
        ? data.client_secret.expires_at
        : typeof data?.expires_at === 'number'
        ? data.expires_at
        : undefined;
    if (typeof value !== 'string' || value.length === 0) {
      throw badRequest(
        `OpenAI no devolvió client_secret usable para Realtime. Respuesta recibida: ${JSON.stringify(data).slice(0, 500)}`
      );
    }

    await saveUserMemoryBlob(user.id, {
      ...memoryBlob,
      interviewVoice: {
        ...interviewVoice,
        ...mergeInterviewVoiceQuotaMonotonic(interviewVoice, {
          callsStarted: nextCallsStarted,
          totalUsedSec,
        }),
        activeCallId: callId,
        status: 'in_progress',
        updatedAt: new Date().toISOString(),
      },
    });

    return sendSuccess(res, {
      value,
      expires_at: expiresAt,
      session_id: typeof data?.id === 'string' ? data.id : undefined,
      call_id: callId,
      resumed: isResumeToken,
      calls_used: nextCallsStarted,
      calls_left: Math.max(0, INTERVIEW_MAX_CALLS_PER_USER - nextCallsStarted),
      max_duration_sec: remainingSec,
      total_used_sec: totalUsedSec,
      remaining_total_sec: remainingSec,
      voice: OPENAI_REALTIME_VOICE,
      voice_speed: INTERVIEW_REALTIME_VOICE_SPEED,
      server_dossier_attached: true,
      session_instructions: sessionInstructions,
      sources_loaded: sourcesLoaded,
      interview_voice: {
        callsStarted: nextCallsStarted,
        activeCallId: callId,
        callId,
        status: 'in_progress',
        totalUsedSec,
        remainingTotalSec: remainingSec,
        maxDurationSec: INTERVIEW_TOTAL_LIMIT_SEC,
        minuteSummaries: persistedMinuteSummaries,
        finalSummary: persistedFinalSummary,
      },
      fincoin_usage: voiceCharge ? fincoinUsagePayload(voiceCharge.usage) : undefined,
    });
  }),
);

/**
 * POST /api/interview/realtime/abort
 *
 * Called by the client when WebRTC setup fails AFTER a token was already issued.
 * Rolls back the callsStarted increment so the user does not burn their single
 * allowed call due to a mic/network failure that was never the user's fault.
 *
 * Idempotent and safe: only acts if activeCallId is still set (not yet confirmed).
 */
router.post(
  '/interview/realtime/abort',
  requireAuth,
  requirePermission(PERMISSIONS.AGENT_CHAT_SELF),
  asyncHandler(async (req, res) => {
    const user = req.authenticatedUser;
    if (!user) throw unauthorized('Not authenticated');

    const memoryBlob =
      user.memoryBlob && typeof user.memoryBlob === 'object'
        ? (user.memoryBlob as Record<string, unknown>)
        : {};
    const interviewVoice =
      memoryBlob.interviewVoice && typeof memoryBlob.interviewVoice === 'object'
        ? (memoryBlob.interviewVoice as Record<string, unknown>)
        : {};

    const callsStarted = Number(interviewVoice.callsStarted ?? 0);
    const activeCallId =
      typeof interviewVoice.activeCallId === 'string' && interviewVoice.activeCallId.length > 0
        ? interviewVoice.activeCallId
        : null;
    const totalUsedSec = Math.max(
      0,
      Number(interviewVoice.totalUsedSec ?? 0),
      Number(interviewVoice.callSeconds ?? 0),
    );

    // Only roll back if a pending call exists and no time was actually consumed
    if (!activeCallId || callsStarted <= 0 || totalUsedSec > 0) {
      return sendSuccess(res, { rolled_back: false });
    }

    await saveUserMemoryBlob(user.id, {
      ...memoryBlob,
      interviewVoice: {
        ...interviewVoice,
        callsStarted: Math.max(0, callsStarted - 1),
        activeCallId: null,
        status: 'idle',
        updatedAt: new Date().toISOString(),
      },
    });

    req.logger?.info({
      msg: 'interview.voice.token.aborted',
      userId: user.id,
      previousCallsStarted: callsStarted,
    });

    return sendSuccess(res, { rolled_back: true });
  }),
);

router.get(
  '/welcome',
  requireAuth,
  requirePermission(PERMISSIONS.AUTH_READ_SELF),
  asyncHandler(async (req, res) => {
    const user = req.authenticatedUser;
    if (!user) throw unauthorized('Not authenticated');

    const injectedIntake = user.injectedIntake;
    const userName = user.name?.split(' ')[0] ?? 'amigo';

    if (!injectedIntake) {
      const { intro, message } = await resolveWelcomeIntroForUser({
        userId: user.id,
        firstName: userName,
        injectedIntake: null,
        persistWelcomeIntroCache,
      });
      return sendSuccess(res, { message, intro, cached: false });
    }

    const resolved = await resolveWelcomeIntroForUser({
      userId: user.id,
      firstName: userName,
      injectedIntake,
      persistWelcomeIntroCache,
    });

    return sendSuccess(res, {
      message: resolved.message,
      intro: resolved.intro,
      cached: resolved.cached,
    });
  }),
);

router.get(
  '/chat-intro',
  requireAuth,
  requirePermission(PERMISSIONS.AUTH_READ_SELF),
  asyncHandler(async (req, res) => {
    const user = req.authenticatedUser;
    if (!user) throw unauthorized('Not authenticated');

    const chatId = String(req.query.chatId ?? 'chat-1');
    if (chatId !== 'chat-1' && chatId !== 'chat-2' && chatId !== 'chat-3') {
      return res.status(400).json({ success: false, error: 'chatId invalido' });
    }

    const envelope = extractIntakeEnvelope(user.injectedIntake);
    const productHints =
      chatId === 'chat-1'
        ? []
        : user.injectedIntake
          ? await researchWelcomeProductHints({
              userId: user.id,
              intake: envelope.intake,
              chatId,
            })
          : [];

    const productBlurb = productHints
      .map((hint) => `${hint.label}: ${hint.fact}`)
      .slice(0, 2)
      .join(' · ');

    return sendSuccess(res, {
      chatId,
      productHints,
      productBlurb: productBlurb || undefined,
    });
  }),
);

router.get(
  '/usage',
  requireAuth,
  requirePermission(PERMISSIONS.AUTH_READ_SELF),
  asyncHandler(async (req, res) => {
    const user = req.authenticatedUser;
    if (!user) throw unauthorized('Invalid session');

    const usage = getFincoinUsageForUser(user);
    const closureSummaries = usage.depleted
      ? await ensureFincoinDepletionHandled(user.id)
      : undefined;

    return sendSuccess(res, {
      usage: fincoinUsagePayload(usage),
      closure_summaries: closureSummaries,
    });
  }),
);

router.get(
  '/session',
  requireAuth,
  requirePermission(PERMISSIONS.AUTH_READ_SELF),
  asyncHandler(async (req, res) => {
    const user = req.authenticatedUser;
    if (!user) throw unauthorized('Invalid session');

    const injectedIntake = user.injectedIntake
      ? {
          intake: (user.injectedIntake as IntakeEnvelope).intake,
          intakeContext: (user.injectedIntake as IntakeEnvelope).intakeContext,
          productsContext: (user.injectedIntake as IntakeEnvelope).productsContext,
          budgetContext: (user.injectedIntake as IntakeEnvelope).budgetContext,
          welcomeIntroCache: (user.injectedIntake as IntakeEnvelope).welcomeIntroCache,
        }
      : undefined;
    const memoryBlob =
      user.memoryBlob && typeof user.memoryBlob === 'object'
        ? (user.memoryBlob as Record<string, unknown>)
        : {};
    const interviewVoice =
      memoryBlob.interviewVoice && typeof memoryBlob.interviewVoice === 'object'
        ? (memoryBlob.interviewVoice as Record<string, unknown>)
        : null;

    const lifecycleState = getLifecycleFromMemory(user.memoryBlob);
    const resolvedDiagnosticProfile = await resolveUserDiagnosticProfile(user);

    const fincoinUsage = getFincoinUsageForUser(user);
    const contextFabric = await getContextFabricSessionSnapshot(user);

    return sendSuccess(res, {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      injectedProfile: resolvedDiagnosticProfile ?? user.injectedProfile,
      injectedIntake,
      interviewVoice,
      latestDiagnosticProfileId: user.latestDiagnosticProfileId,
      latestDiagnosticCompletedAt: user.latestDiagnosticCompletedAt,
      knowledgeBaseScore: user.knowledgeBaseScore ?? 0,
      knowledgeScore: user.knowledgeScore ?? 0,
      knowledgeLastUpdated: user.knowledgeLastUpdated,
      productLifecycle: lifecycleState,
      socialConsciousnessReflections: getSocialReflectionsFromMemory(user.memoryBlob),
      fincoinUsage: fincoinUsagePayload(fincoinUsage),
      contextFabric,
    });
  }),
);

router.get(
  '/agent/history',
  requireAuth,
  requirePermission(PERMISSIONS.AGENT_CHAT_SELF),
  asyncHandler(async (req, res) => {
    const user = req.authenticatedUser;
    if (!user) throw unauthorized('Not authenticated');
    const query = parseQuery(ConversationHistoryQuerySchema, req.query);
    const turns = await listConversationTurns({
      userId: user.id,
      chatId: query.chatId,
      sessionId: query.sessionId,
      limit: query.limit ?? 100,
    });
    return sendSuccess(res, { turns });
  }),
);

function returnAgentChatPayload(
  res: import('express').Response,
  payload: Record<string, unknown>,
  streamReporter?: AgentProgressReporter | null,
) {
  if (streamReporter) {
    streamReporter.complete(payload);
    return;
  }
  return sendSuccess(res, payload);
}

const SocialReflectionsBodySchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().min(1).max(64),
        question: z.string().min(1).max(280),
        choiceId: z.string().min(1).max(64),
        choiceLabel: z.string().min(1).max(120),
        choiceSubtext: z.string().max(160).optional(),
        thinker: z.string().max(120).optional(),
      }),
    )
    .min(1)
    .max(12),
  completedAt: z.string().optional(),
});

router.put(
  '/agent/social-reflections',
  requireAuth,
  requirePermission(PERMISSIONS.AGENT_CHAT_SELF),
  asyncHandler(async (req, res) => {
    const user = req.authenticatedUser;
    if (!user) throw unauthorized('Authentication required');

    const body = parseBody(SocialReflectionsBodySchema, req.body);
    const session = sanitizeSocialReflectionSession({
      answers: body.answers,
      completedAt: body.completedAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    if (!session) throw badRequest('INVALID_SOCIAL_REFLECTIONS');

    const currentMemory =
      user.memoryBlob && typeof user.memoryBlob === 'object'
        ? (user.memoryBlob as Record<string, unknown>)
        : {};
    const nextMemory = mergeSocialReflectionsInMemory(currentMemory, session);
    await saveUserMemoryBlob(user.id, nextMemory);

    return sendSuccess(res, {
      saved: true,
      socialConsciousnessReflections: session,
    });
  }),
);

router.post(
  '/agent',
  requireAuth,
  requirePermission(PERMISSIONS.AGENT_CHAT_SELF),
  asyncHandler(async (req, res) => {
    const authedUser = req.authenticatedUser;
    if (!authedUser) {
      throw unauthorized('Authentication required');
    }
    if (!authedUser.injectedIntake) {
      throw forbidden('INTAKE_REQUIRED');
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const useStream = wantsAgentStream({ query: req.query as Record<string, unknown>, headers: req.headers as Record<string, unknown>, body });
    const streamReporter = useStream ? initAgentSseResponse(res) : null;

    const fincoinBefore = getFincoinUsageForUser(authedUser);
    if (fincoinBefore.depleted || !canAffordOperation(fincoinBefore, 'agent.chat')) {
      const closureSummaries = await ensureFincoinDepletionHandled(authedUser.id);
      const lifecycleState = getLifecycleFromMemory(authedUser.memoryBlob);
      return returnAgentChatPayload(res, {
        message:
          'Tus Fincoins se agotaron. El agente queda en pausa: puedes revisar los resúmenes finales de cada chat desbloqueado, pero no se procesan nuevas solicitudes con costo.',
        mode: 'information',
        tool_calls: [],
        agent_blocks: [],
        artifacts: [],
        citations: [],
        suggested_replies: [],
        compliance: {
          mode: 'information',
          no_auto_execution: true,
          includes_recommendation: false,
          includes_simulation: false,
          includes_regulation: false,
          missing_information: [],
          disclaimers_shown: [],
          risk_score: 0,
          blocked: { is_blocked: true, reason: 'FINCOINS_DEPLETED' },
        },
        state_updates: {},
        meta: {
          fincoin_usage: fincoinUsagePayload(fincoinBefore),
          closure_summaries: closureSummaries,
          product_lifecycle: {
            phase: lifecycleState.phase,
            unlocked_chats: lifecycleState.unlockedChats,
            closed_chats: lifecycleState.closedChats,
          },
        },
      }, streamReporter);
    }

    if (process.env.NODE_ENV !== 'production') {
      try {
        req.logger?.debug({
          msg: '[API /agent] received body',
          body: req.body,
        });
      } catch {
        req.logger?.debug({ msg: '[API /agent] received body (non-serializable)' });
      }
    }

    const clientMessageId =
      typeof body.client_message_id === 'string' && body.client_message_id.trim().length > 0
        ? body.client_message_id.trim()
        : typeof body.clientMessageId === 'string' && body.clientMessageId.trim().length > 0
          ? body.clientMessageId.trim()
          : `msg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    const normalizedInput: Record<string, unknown> = {
      user_id: authedUser.id,
      user_name: body.user_name,
      session_id: body.session_id,
      client_message_id: clientMessageId,
      user_message: body.user_message ?? body.message,
      history: body.history ?? [],
      context: body.context,
      ui_state: body.ui_state,
      preferences: body.preferences,
    };

    normalizedInput.user_name = normalizedInput.user_name ?? authedUser.name;

    const resolvedDiagnosticProfile = await resolveUserDiagnosticProfile(authedUser);

    if (resolvedDiagnosticProfile) {
      normalizedInput.context = {
        ...((normalizedInput.context as Record<string, unknown>) ?? {}),
        injected_profile: resolvedDiagnosticProfile,
      };
    }

    if (authedUser.injectedIntake) {
      normalizedInput.context = {
        ...((normalizedInput.context as Record<string, unknown>) ?? {}),
        injected_intake: authedUser.injectedIntake,
        intake_context: (authedUser.injectedIntake as IntakeEnvelope | undefined)?.intakeContext,
      };
    }

    if (typeof authedUser.knowledgeScore === 'number') {
      normalizedInput.ui_state = {
        ...((normalizedInput.ui_state as Record<string, unknown>) ?? {}),
        knowledge_score: authedUser.knowledgeScore,
      };
    }

    const normalizedContext = ((normalizedInput.context as Record<string, unknown>) ?? {});
    const normalizedUiState = ((normalizedInput.ui_state as Record<string, unknown>) ?? {});
    normalizedInput.context = hydrateAgentFinancialContext({
      context: normalizedContext,
      intakeEnvelope: authedUser.injectedIntake as IntakeEnvelope | undefined,
    });
    normalizedInput.context = {
      ...((normalizedInput.context as Record<string, unknown>) ?? {}),
      injected_budget: resolveInjectedBudget({
        context: (normalizedInput.context as Record<string, unknown>) ?? {},
        uiState: normalizedUiState,
      }),
    };

    try {
      const activeChatId = (normalizedInput.ui_state as Record<string, unknown> | undefined)?.active_chat
        ? ((normalizedInput.ui_state as Record<string, unknown>).active_chat as Record<string, unknown>)?.id
        : undefined;
      const userMessage = String(normalizedInput.user_message ?? '');
      if (shouldAttachLiveMarketContext({ userMessage, activeChatId })) {
        const marketSnapshot = await getLiveMarketContextCached();
        normalizedInput.context = {
          ...((normalizedInput.context as Record<string, unknown>) ?? {}),
          market_snapshot: marketSnapshot,
        };
      }
    } catch (marketErr) {
      req.logger?.warn({ msg: 'Error loading market snapshot', error: marketErr });
    }

    try {
      const sessionId =
        typeof normalizedInput.session_id === 'string' ? normalizedInput.session_id : undefined;
      const query =
        typeof normalizedInput.user_message === 'string' ? normalizedInput.user_message : '';
      const memoryContext = await buildAgentMemoryContextRealtime(authedUser.id, {
        sessionId,
        query,
      });
      normalizedInput.context = {
        ...((normalizedInput.context as Record<string, unknown>) ?? {}),
        persistent_memory: memoryContext.user_memory,
        session_memory: memoryContext.session_memory,
        realtime_memory: memoryContext.session_memory,
        system_memory: memoryContext.system_memory,
      };

      normalizedInput.ui_state = {
        ...((normalizedInput.ui_state as Record<string, unknown>) ?? {}),
        memory_profile_summary: memoryContext.user_memory.profile_summary,
        memory_timeline_count: memoryContext.user_memory.recent_timeline.length,
        memory_session_turn_count: memoryContext.session_memory?.turn_count ?? 0,
      };
    } catch (memoryErr) {
      req.logger?.warn({ msg: 'Error loading persistent memory', error: memoryErr });
    }

    try {
      const memoryBlob =
        authedUser.memoryBlob && typeof authedUser.memoryBlob === 'object'
          ? (authedUser.memoryBlob as Record<string, unknown>)
          : {};
      const stored = getSocialReflectionsFromMemory(memoryBlob);
      const contextRecord = ((normalizedInput.context as Record<string, unknown>) ?? {}) as Record<
        string,
        unknown
      >;
      const clientRaw = contextRecord.social_consciousness_reflections;
      const clientSession = Array.isArray(clientRaw)
        ? sanitizeSocialReflectionSession({
            answers: clientRaw,
            completedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })
        : sanitizeSocialReflectionSession(clientRaw);
      const merged = pickSocialReflectionSession(stored, clientSession ?? undefined);
      if (clientSession) {
        const storedTs = stored ? Date.parse(stored.updatedAt ?? stored.completedAt) : 0;
        const clientTs = Date.parse(clientSession.updatedAt ?? clientSession.completedAt);
        if (!stored || clientTs >= storedTs) {
          const nextMemory = mergeSocialReflectionsInMemory(memoryBlob, clientSession);
          await saveUserMemoryBlob(authedUser.id, nextMemory);
          authedUser.memoryBlob = nextMemory;
        }
      }
      normalizedInput.context = {
        ...contextRecord,
        social_consciousness_reflections: merged?.answers ?? [],
      };
    } catch (reflectionErr) {
      req.logger?.warn({ msg: 'Error syncing social consciousness reflections', error: reflectionErr });
    }

    // Auto-hydrate conversation history from DB when the client sends an empty array
    // but a session_id is present. This preserves multi-turn context without requiring
    // the client to track and resend the full history on every request.
    const clientSentHistory =
      Array.isArray(body.history) && (body.history as unknown[]).length > 0;
    if (!clientSentHistory) {
      const sessionIdForHistory =
        typeof normalizedInput.session_id === 'string' ? normalizedInput.session_id : undefined;
      const activeChatIdForHistory = (() => {
        const ui = (normalizedInput.ui_state ?? {}) as Record<string, unknown>;
        const activeChat = ui.active_chat;
        if (activeChat && typeof activeChat === 'object') {
          return String((activeChat as Record<string, unknown>).id ?? 'chat-1');
        }
        return 'chat-1';
      })();
      const historyLimits = resolveCoreAgentHistoryLimits(activeChatIdForHistory);
      if (sessionIdForHistory) {
        try {
          const recentTurns = await listConversationTurns({
            userId: authedUser.id,
            sessionId: sessionIdForHistory,
            chatId: activeChatIdForHistory,
            limit: historyLimits.turnLimit,
          });
          if (recentTurns.length > 0) {
            normalizedInput.history = recentTurns.flatMap((turn) => [
              { role: 'user' as const, content: turn.userMessage },
              { role: 'assistant' as const, content: turn.assistantMessage },
            ]);
          }
        } catch (historyErr) {
          req.logger?.warn({ msg: 'Error auto-hydrating conversation history', error: historyErr });
        }
      }
    }

    try {
      const userMessage = String(normalizedInput.user_message ?? '');
      if (userMessage.trim().length > 0) {
        const documentHits = await searchUserDocumentContext(authedUser.id, userMessage, 6);
        if (documentHits.length > 0) {
          const currentContext = ((normalizedInput.context as Record<string, unknown>) ?? {});
          const uploadedDocuments = Array.isArray(currentContext.uploaded_documents)
            ? currentContext.uploaded_documents
            : [];
          normalizedInput.context = {
            ...currentContext,
            document_memory: documentHits,
            uploaded_documents: [
              ...uploadedDocuments,
              ...documentHits.map((hit) => ({
                name: hit.title,
                text: hit.text,
                documentId: hit.documentId,
                source: hit.source,
              })),
            ].slice(-10),
          };
        }
      }
    } catch (documentErr) {
      req.logger?.warn({
        msg: 'Error loading document context',
        error: documentErr,
        userId: authedUser.id,
      });
    }

    let input = ChatAgentInputSchema.parse(normalizedInput);
    const onboardingSignals = detectOnboardingSignals(input);
    const lifecycleDecision = buildLifecycleDecision({
      input,
      memoryBlob: authedUser.memoryBlob,
      hasIntake: Boolean(authedUser.injectedIntake),
    });

    if (lifecycleDecision.blocked) {
      return returnAgentChatPayload(res, {
        message:
          lifecycleDecision.reason ??
          buildResilientFallbackMessage({
            userMessage: String(input.user_message ?? ''),
            phase: lifecycleDecision.state.phase,
            activeChatId: lifecycleDecision.activeChatId,
            hasBudget: onboardingSignals.hasBudget,
            hasTransactions: onboardingSignals.hasTransactions,
          }),
        mode: 'information',
        tool_calls: [],
        agent_blocks: [],
        artifacts: [],
        citations: [],
        suggested_replies: buildLifecycleSuggestedReplies({
          lifecycleDecision,
          onboardingSignals,
          userMessage: String(input.user_message ?? ''),
        }),
        panel_action: buildBlockedPanelAction(lifecycleDecision.activeChatId),
        compliance: {
          mode: 'information',
          no_auto_execution: true,
          includes_recommendation: false,
          includes_simulation: false,
          includes_regulation: false,
          missing_information: [],
          disclaimers_shown: [],
          risk_score: 0,
          blocked: { is_blocked: true, reason: lifecycleDecision.reason },
        },
        state_updates: {},
        meta: lifecycleMeta(lifecycleDecision.state, lifecycleDecision.activeChatId),
      }, streamReporter);
    }

    input = {
      ...input,
      context: {
        ...(input.context ?? {}),
        product_lifecycle: lifecycleDecision.state,
        product_directive: lifecycleDecision.systemDirective,
      },
      ui_state: {
        ...(input.ui_state ?? {}),
        product_phase: lifecycleDecision.state.phase,
        product_turn_count: lifecycleDecision.state.chatTurns[lifecycleDecision.activeChatId] ?? 0,
        product_turns_remaining: getRemainingChatTurns(
          lifecycleDecision.activeChatId,
          lifecycleDecision.state.chatTurns[lifecycleDecision.activeChatId] ?? 0,
        ),
        product_closing_mode: lifecycleDecision.closingMode,
      },
    };

    // Pre-flight: block depleted users before running the agent
    const preFlightUsage = getFincoinUsageForUser(authedUser);
    if (preFlightUsage.depleted) {
      const closureSummaries = await ensureFincoinDepletionHandled(authedUser.id);
      const lifecycleState = getLifecycleFromMemory(authedUser.memoryBlob);
      return returnAgentChatPayload(
        res,
        {
          message:
            'Tus Fincoins se agotaron. El agente queda en pausa: puedes revisar los resúmenes finales de cada chat desbloqueado, pero no se procesan nuevas solicitudes con costo.',
          mode: 'information',
          tool_calls: [],
          agent_blocks: [],
          artifacts: [],
          citations: [],
          suggested_replies: [],
          compliance: {
            mode: 'information',
            no_auto_execution: true,
            includes_recommendation: false,
            includes_simulation: false,
            includes_regulation: false,
            missing_information: [],
            disclaimers_shown: [],
            risk_score: 0,
            blocked: { is_blocked: true, reason: 'FINCOINS_DEPLETED' },
          },
          state_updates: {},
          meta: {
            fincoin_usage: fincoinUsagePayload(preFlightUsage),
            closure_summaries: closureSummaries,
            product_lifecycle: {
              phase: lifecycleState.phase,
              unlocked_chats: lifecycleState.unlockedChats,
              closed_chats: lifecycleState.closedChats,
            },
          },
        },
        streamReporter,
      );
    }

    let response: any;
    let agentCostUsd = 0;
    try {
      const tracked = await runWithLLMCostTracking(() =>
        runCoreAgent(input, streamReporter ? { stream: streamReporter } : undefined),
      );
      response = tracked.result;
      agentCostUsd = tracked.costUsd;
    } catch (agentErr) {
      req.logger?.error({
        msg: streamReporter ? 'Core agent failed during stream; returning resilient fallback' : 'Core agent failed; returning conversational fallback',
        error: agentErr,
        userId: authedUser.id,
      });

      response = {
        message: buildResilientFallbackMessage({
          userMessage: String(input.user_message ?? ''),
          phase: lifecycleDecision.state.phase,
          activeChatId: lifecycleDecision.activeChatId,
          hasBudget: onboardingSignals.hasBudget,
          hasTransactions: onboardingSignals.hasTransactions,
        }),
        mode: 'information',
        tool_calls: [],
        agent_blocks: [],
        artifacts: [],
        citations: [],
        suggested_replies: buildLifecycleSuggestedReplies({
          lifecycleDecision,
          onboardingSignals,
          userMessage: String(input.user_message ?? ''),
        }),
        compliance: {
          mode: 'information',
          no_auto_execution: true,
          includes_recommendation: false,
          includes_simulation: false,
          includes_regulation: false,
          missing_information: [],
          disclaimers_shown: [],
          risk_score: 0,
          blocked: { is_blocked: false },
        },
        state_updates: { degraded: true, error_code: 'AGENT_FAILED' },
        meta: {
          fincoin_usage: fincoinUsagePayload(preFlightUsage),
        },
      };

      if (streamReporter) {
        streamReporter.complete(response);
        return;
      }
    }

    // Charge actual token cost accumulated during agent execution
    const charge = await chargeActualUsdSpent(authedUser.id, agentCostUsd);

    const recentAssistantMessages = (Array.isArray(input.history) ? input.history : [])
      .filter((h) => h && typeof h === 'object' && (h as Record<string, unknown>).role === 'assistant')
      .map((h) => String((h as Record<string, unknown>).content ?? ''))
      .filter((x) => x.trim().length > 0)
      .slice(-2);
    if (shouldReplaceWithDuplicateFallback({ response, recentAssistantMessages })) {
      response.message = buildResilientFallbackMessage({
        userMessage: String(input.user_message ?? ''),
        phase: lifecycleDecision.state.phase,
        activeChatId: lifecycleDecision.activeChatId,
        hasBudget: onboardingSignals.hasBudget,
        hasTransactions: onboardingSignals.hasTransactions,
      });
      response.suggested_replies = buildLifecycleSuggestedReplies({
        lifecycleDecision,
        onboardingSignals,
        userMessage: String(input.user_message ?? ''),
      });
    }

    if (
      lifecycleDecision.activeChatId === 'chat-2' ||
      lifecycleDecision.activeChatId === 'chat-3'
    ) {
      response.suggested_replies = buildLifecycleSuggestedReplies({
        lifecycleDecision,
        onboardingSignals,
        userMessage: String(input.user_message ?? ''),
      });
    }

    try {
      await appendTurnToMemoryRealtime({
        input,
        response,
        authenticatedUser: authedUser,
      });
    } catch (memoryErr) {
      req.logger?.warn({ msg: 'Error persisting turn memory', error: memoryErr });
    }

    try {
      const currentMemory =
        authedUser.memoryBlob && typeof authedUser.memoryBlob === 'object'
          ? (authedUser.memoryBlob as Record<string, unknown>)
          : {};
      const nextLifecycle = applyLifecycleAfterResponse({
        state: lifecycleDecision.state,
        activeChatId: lifecycleDecision.activeChatId,
        input,
        response,
      });
      await saveUserMemoryBlob(authedUser.id, {
        ...currentMemory,
        productLifecycle: nextLifecycle,
      });
      response.meta = {
        ...((response.meta as Record<string, unknown>) ?? {}),
        ...lifecycleMeta(nextLifecycle, lifecycleDecision.activeChatId, {
          userMessage: String(input.user_message ?? ''),
          assistantMessage: String(response.message ?? ''),
        }),
      };
    } catch (lifecycleErr) {
      req.logger?.warn({ msg: 'Error persisting product lifecycle', error: lifecycleErr });
      response.meta = {
        ...((response.meta as Record<string, unknown>) ?? {}),
        ...lifecycleMeta(lifecycleDecision.state, lifecycleDecision.activeChatId),
      };
    }

    try {
      const userMessage = String(input.user_message ?? '');
      const assistantMessage = String(response.message ?? '');
      if (userMessage.trim().length > 0 || assistantMessage.trim().length > 0) {
        await upsertConversationTurnRecord({
          userId: authedUser.id,
          sessionId: typeof input.session_id === 'string' ? input.session_id : undefined,
          chatId: String(lifecycleDecision.activeChatId ?? 'chat-1'),
          clientMessageId,
          userMessage,
          assistantMessage,
          history: Array.isArray(input.history) ? input.history : [],
          inputPayload: input,
          responsePayload: response,
        });

        const currentSheets = await loadUserSheets(authedUser.id);
        const turns = await listConversationTurns({
          userId: authedUser.id,
          chatId: String(lifecycleDecision.activeChatId ?? 'chat-1'),
          limit: 200,
        });
        const { sheets: repairedSheets, repaired } = repairUserSheetsFromTurns(currentSheets, turns);
        if (repaired) {
          await saveUserSheets(authedUser.id, repairedSheets);
        }
      }
    } catch (historyErr) {
      req.logger?.warn({ msg: 'Error persisting conversation turn', error: historyErr, userId: authedUser.id });
    }


    response.meta = {
      ...((response.meta as Record<string, unknown>) ?? {}),
      fincoin_usage: fincoinUsagePayload(charge.usage),
      ...(charge.closureSummaries ? { closure_summaries: charge.closureSummaries } : {}),
    };
    if (charge.justDepleted) {
      response.message =
        `${String(response.message ?? '').trim()}\n\n—\nTus Fincoins se agotaron. El agente queda en pausa; revisa los resúmenes finales en cada chat.`.trim();
    }

    return returnAgentChatPayload(res, response as Record<string, unknown>, streamReporter);
  }),
);

export default router;
