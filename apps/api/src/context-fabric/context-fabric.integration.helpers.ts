import type { ContextPack, ContextPackPurpose } from '@financial-agent/shared';
import { estimateTokensFromJson } from '@financial-agent/shared';
import type { Classification } from '../agents/core.agent/agent-types';
import type { ReasoningMode } from '../agents/core.agent/chat.types';
import type { AgentBudgetRow } from '../agents/core.agent/helpers/agent-financial-evidence.helpers';
import type { FinancialEvidenceSnapshot } from '../agents/core.agent/helpers/agent-financial-evidence.helpers';
import { getContextFabricFlags } from './context-fabric.policy';
import { loadContextSourceBundle } from './context-source.loader';
import { buildContextPackFromBundle } from './context-pack.service';
import { loadUserById } from '../services/user.service';
import { getLogger } from '../logger';
import { compareContextPackShadow } from '../agents/core.agent/helpers/context-fabric-shadow.helpers';

export function mapClassificationToPackPurpose(params: {
  mode: ReasoningMode | string;
  activeChatId: string;
}): ContextPackPurpose {
  if (params.activeChatId === 'chat-3') return 'social_reflection';
  const mode = String(params.mode ?? '');
  if (mode === 'regulation') return 'regulation';
  if (mode === 'budgeting' || mode === 'comparison') return 'budget_analysis';
  if (mode === 'simulation') return 'simulation';
  if (mode === 'planification' || mode === 'decision_support') return 'planning';
  if (mode === 'education' || mode === 'information') return 'answer';
  return 'answer';
}

export function resolvePackMaxTokens(mode: string): number {
  if (mode === 'regulation' || mode === 'decision_support' || mode === 'planification') return 6144;
  if (mode === 'education' || mode === 'information') return 2048;
  return 4096;
}

function slimUploadedDocuments(documents: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(documents)) return [];
  return documents.slice(0, 8).map((item) => {
    if (!item || typeof item !== 'object') return { name: 'documento' };
    const doc = item as Record<string, unknown>;
    return {
      name: typeof doc.name === 'string' ? doc.name : 'documento',
      documentId: typeof doc.documentId === 'string' ? doc.documentId : undefined,
      source: doc.source,
      indexed: doc.indexed,
      text_preview_chars:
        typeof doc.text === 'string' ? Math.min(doc.text.length, 120) : 0,
    };
  });
}

function slimSessionMemory(memory: unknown): Record<string, unknown> | null {
  if (!memory || typeof memory !== 'object') return null;
  const row = memory as Record<string, unknown>;
  return {
    turn_count: row.turn_count ?? row.turnCount,
    rolling_summary: typeof row.rolling_summary === 'string' ? row.rolling_summary.slice(0, 400) : row.rollingSummary,
    recent_user_intents: Array.isArray(row.recent_user_intents)
      ? row.recent_user_intents.slice(-3)
      : Array.isArray(row.recentUserIntents)
        ? row.recentUserIntents.slice(-3)
        : [],
    live_signals: row.live_signals ?? row.liveSignals ?? null,
  };
}

function slimPersistentMemory(memory: unknown): unknown {
  if (!Array.isArray(memory)) {
    if (memory && typeof memory === 'object') {
      const row = memory as Record<string, unknown>;
      if (Array.isArray(row.facts)) {
        return {
          profile_summary: row.profile_summary ?? row.profileSummary,
          facts: row.facts.slice(-8),
        };
      }
    }
    return memory;
  }
  return memory.slice(-8);
}

function rebuildBudgetFromPack(pack: ContextPack, legacyBudget: unknown): Record<string, unknown> {
  const base =
    legacyBudget && typeof legacyBudget === 'object'
      ? { ...(legacyBudget as Record<string, unknown>) }
      : {};
  const income = pack.facts.find((f) => f.predicate === 'monthly_income' && f.subject.startsWith('budget'));
  const expenses = pack.facts.find((f) => f.predicate === 'monthly_expenses');
  const balance = pack.facts.find((f) => f.predicate === 'monthly_balance');
  return {
    ...base,
    income: income?.value ?? base.income,
    expenses: expenses?.value ?? base.expenses,
    balance: balance?.value ?? base.balance,
    source: 'context_fabric',
  };
}

function slimConsolidatedTransactions(
  legacy: Record<string, unknown>,
  pack: ContextPack,
  evidence?: FinancialEvidenceSnapshot,
): Record<string, unknown> {
  const txSummary = pack.deterministicSummaries.transactions as Record<string, unknown> | undefined;
  const legacyTx =
    legacy.transactions && typeof legacy.transactions === 'object'
      ? (legacy.transactions as Record<string, unknown>)
      : {};
  return {
    transactions: {
      scope: legacyTx.scope ?? 'fabric_summary',
      productsCount: txSummary?.productsCount ?? legacyTx.productsCount ?? evidence?.products_count ?? 0,
      activeProductLabel: txSummary?.activeProductLabel ?? legacyTx.activeProductLabel ?? evidence?.active_product_label,
      activeProductMovementCount: evidence?.movement_count ?? legacyTx.activeProductMovementCount ?? 0,
      has_movements: Boolean(evidence?.has_transactions),
      evidence_note:
        'Movimientos completos disponibles via finance.transactions_charts y cartolas persistidas. No re-pedir upload si has_movements=true.',
      productsIndex: Array.isArray(legacyTx.productsIndex)
        ? (legacyTx.productsIndex as unknown[]).slice(0, 6).map((item) => {
            if (!item || typeof item !== 'object') return item;
            const row = item as Record<string, unknown>;
            return {
              id: row.id,
              label: row.label,
              bank: row.bank,
              productType: row.productType,
            };
          })
        : [],
    },
  };
}

export type LegacyContextSummary = Record<string, unknown>;

export function applyContextPackToSummary(
  legacy: LegacyContextSummary,
  pack: ContextPack,
  options: {
    activeChatId: string;
    budgetRows: AgentBudgetRow[];
    financialEvidence?: FinancialEvidenceSnapshot;
  },
): LegacyContextSummary {
  const intakeSummary = pack.deterministicSummaries.intake ?? null;
  const lifecycleSummary = pack.deterministicSummaries.lifecycle ?? null;

  const slimRows = options.budgetRows
    .filter((row) => row.amount > 0 || row.category.trim().length > 0)
    .slice(0, 12);

  const optimized: LegacyContextSummary = {
    ...legacy,
    reference_date: legacy.reference_date,
    profile: legacy.profile,
    intake: intakeSummary ?? legacy.intake,
    budget: rebuildBudgetFromPack(pack, legacy.budget),
    budget_rows: slimRows,
    financial_evidence: legacy.financial_evidence,
    consolidated_context: slimConsolidatedTransactions(
      (legacy.consolidated_context as Record<string, unknown>) ?? {},
      pack,
      options.financialEvidence,
    ),
    uploaded_documents: slimUploadedDocuments(legacy.uploaded_documents),
    uploaded_evidence_files: Array.isArray(legacy.uploaded_evidence_files)
      ? (legacy.uploaded_evidence_files as unknown[]).slice(0, 8)
      : [],
    persistent_memory: slimPersistentMemory(legacy.persistent_memory),
    session_memory: slimSessionMemory(legacy.session_memory),
    realtime_memory: slimSessionMemory(legacy.realtime_memory ?? legacy.session_memory),
    recent_artifacts: Array.isArray(legacy.recent_artifacts) ? legacy.recent_artifacts.slice(-3) : [],
    recent_chart_summaries: Array.isArray(legacy.recent_chart_summaries)
      ? legacy.recent_chart_summaries.slice(-3)
      : [],
    context_fabric: {
      contextVersion: pack.contextVersion,
      packVersion: pack.packVersion,
      includedSections: pack.includedSections,
      omittedSections: pack.omittedSections,
      resourceUris: pack.resourceUris,
      facts: pack.facts,
      activeConflicts: pack.activeConflicts,
      lifecycle: lifecycleSummary,
      hasMore: pack.hasMore ?? false,
      cacheStatus: pack.cacheStatus,
      token_estimate: pack.tokenEstimate,
    },
    recommendation_profile: legacy.recommendation_profile,
    product_directive: legacy.product_directive,
    product_lifecycle: lifecycleSummary ?? legacy.product_lifecycle,
    social_consciousness_reflections: legacy.social_consciousness_reflections,
    market_snapshot: legacy.market_snapshot,
    ui_state_snapshot: legacy.ui_state_snapshot,
    recent_thread_context: legacy.recent_thread_context,
    action_plan_session_brief: legacy.action_plan_session_brief,
  };

  if (options.activeChatId === 'chat-3') {
    optimized.consolidated_context = { transactions: { scope: 'chat3_minimal', has_movements: false } };
    optimized.budget_rows = slimRows.filter((row) => row.amount > 0).slice(0, 4);
  }

  return optimized;
}

export async function resolveCoreContextPackForTurn(params: {
  userId: string;
  classification: Classification;
  activeChatId: string;
  userMessage: string;
}): Promise<ContextPack | null> {
  const flags = getContextFabricFlags();
  if (!flags.coreContextPackEnabled && !flags.enabled) return null;
  if (process.env.NODE_ENV === 'test' && process.env.CORE_CONTEXT_PACK_ENABLED !== 'true') {
    return null;
  }

  const user = await loadUserById(params.userId);
  if (!user) return null;

  const bundle = await loadContextSourceBundle(user);
  const purpose = mapClassificationToPackPurpose({
    mode: params.classification.mode,
    activeChatId: params.activeChatId,
  });

  return buildContextPackFromBundle(bundle, {
    consumer: 'core-agent',
    purpose,
    activeChat: params.activeChatId as 'chat-1' | 'chat-2' | 'chat-3',
    userMessage: params.userMessage,
    reasoningMode: params.classification.mode,
    maxInputTokens: resolvePackMaxTokens(params.classification.mode),
  });
}

export function logContextFabricPackMetrics(params: {
  turnId: string;
  userId: string;
  legacyContext: Record<string, unknown>;
  legacyUiState: Record<string, unknown>;
  pack: ContextPack;
  optimizedSummary: LegacyContextSummary;
  applied: boolean;
}): void {
  const logger = getLogger();
  const shadow = compareContextPackShadow({
    legacyContext: params.legacyContext,
    legacyUiState: params.legacyUiState,
    pack: params.pack,
  });
  const optimizedTokens = estimateTokensFromJson(params.optimizedSummary);
  logger.info({
    msg: params.applied ? 'context_fabric.pack_applied' : 'context_fabric.shadow',
    turn_id: params.turnId,
    user_id: params.userId,
    applied: params.applied,
    legacy_token_estimate: shadow.legacyTokenEstimate,
    pack_token_estimate: shadow.packTokenEstimate,
    optimized_summary_token_estimate: optimizedTokens,
    token_reduction_pct: shadow.tokenReductionPct,
    optimized_reduction_pct:
      shadow.legacyTokenEstimate > 0
        ? Math.round(((shadow.legacyTokenEstimate - optimizedTokens) / shadow.legacyTokenEstimate) * 100)
        : 0,
    fact_count: shadow.factCount,
    conflict_count: shadow.conflictCount,
    included_sections: shadow.includedSections,
    omitted_sections: shadow.omittedSections,
    context_version: shadow.contextVersion,
    pack_version: shadow.packVersion,
    cache_status: shadow.cacheStatus,
  });
}

export async function buildBudgetFabricPromptBlock(userId: string): Promise<string | null> {
  const flags = getContextFabricFlags();
  if (process.env.NODE_ENV === 'test' && process.env.BUDGET_CONTEXT_PACK_ENABLED !== 'true') {
    return null;
  }
  if (!flags.budgetContextPackEnabled && !flags.enabled) return null;

  const user = await loadUserById(userId);
  if (!user) return null;

  const bundle = await loadContextSourceBundle(user);
  const pack = buildContextPackFromBundle(bundle, {
    consumer: 'budget-agent',
    purpose: 'budget_analysis',
    maxInputTokens: 3072,
  });

  const lines = [
    'CONTEXTO CANÓNICO (Context Fabric — lectura, no mutar fuera de table actions):',
    `version=${pack.contextVersion}`,
  ];
  if (pack.deterministicSummaries.intake) {
    lines.push(`intake=${JSON.stringify(pack.deterministicSummaries.intake)}`);
  }
  if (pack.deterministicSummaries.transactions) {
    lines.push(`transactions=${JSON.stringify(pack.deterministicSummaries.transactions)}`);
  }
  if (pack.activeConflicts.length > 0) {
    lines.push(
      `conflicts=${pack.activeConflicts
        .slice(0, 3)
        .map((c) => c.explanationCode)
        .join('|')}`,
    );
  }
  if (pack.omittedSections.length > 0) {
    lines.push(`omitted_sections=${pack.omittedSections.join(',')}`);
  }
  return lines.join('\n');
}

export async function buildTransactionsFabricPromptBlock(userId: string): Promise<string | null> {
  const flags = getContextFabricFlags();
  if (process.env.NODE_ENV === 'test' && process.env.TRANSACTIONS_CONTEXT_PUBLISH_ENABLED !== 'true') {
    return null;
  }
  if (!flags.transactionsContextPublishEnabled && !flags.enabled) {
    return null;
  }

  const user = await loadUserById(userId);
  if (!user) return null;

  const bundle = await loadContextSourceBundle(user);
  const pack = buildContextPackFromBundle(bundle, {
    consumer: 'transactions-agent',
    purpose: 'transaction_analysis',
    maxInputTokens: 3072,
  });

  const lines = [
    'CONTEXTO CANÓNICO TRANSACCIONAL (Context Fabric — lectura; no mutar presupuesto):',
    `version=${pack.contextVersion}`,
  ];
  if (pack.deterministicSummaries.transactions) {
    lines.push(`transactions=${JSON.stringify(pack.deterministicSummaries.transactions)}`);
  }
  if (pack.deterministicSummaries.budget) {
    lines.push(`budget_crosscheck=${JSON.stringify(pack.deterministicSummaries.budget)}`);
  }
  if (pack.activeConflicts.length > 0) {
    lines.push(
      `conflicts=${pack.activeConflicts
        .slice(0, 4)
        .map((conflict) => `${conflict.explanationCode}:${conflict.severity}`)
        .join('|')}`,
    );
  }
  if (pack.resourceUris.length > 0) {
    lines.push(`recover_via=${pack.resourceUris.slice(0, 4).join(',')}`);
  }
  return lines.join('\n');
}

export async function buildDiagnosticFabricSupplement(userId: string): Promise<string | null> {
  const flags = getContextFabricFlags();
  if (process.env.NODE_ENV === 'test' && process.env.DIAGNOSTIC_CONTEXT_PACK_ENABLED !== 'true') {
    return null;
  }
  if (!flags.diagnosticContextPackEnabled && !flags.enabled) return null;

  const user = await loadUserById(userId);
  if (!user) return null;

  const bundle = await loadContextSourceBundle(user);
  const pack = buildContextPackFromBundle(bundle, {
    consumer: 'diagnostic-agent',
    purpose: 'diagnosis',
    maxInputTokens: 4096,
  });

  return [
    'DOSSIER CONTEXT FABRIC (referencia estructurada; datos completos en URIs):',
    `context_version=${pack.contextVersion}`,
    `sections=${pack.includedSections.join(',')}`,
    `summaries=${JSON.stringify(pack.deterministicSummaries)}`,
    pack.activeConflicts.length > 0
      ? `conflicts=${pack.activeConflicts
          .slice(0, 5)
          .map((c) => c.deterministicReason)
          .join(' | ')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}
