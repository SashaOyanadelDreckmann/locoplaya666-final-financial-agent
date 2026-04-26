import crypto from 'crypto';
import type { ChatAgentInput, ChatAgentResponse } from '../agents/core.agent/chat.types';
import { listTools } from '../mcp/tools/registry';
import { getLogger } from '../logger';
import { loadUserMemoryBlob, saveUserMemoryBlob } from './user.service';

export type MemoryFactType =
  | 'identity'
  | 'goal'
  | 'preference'
  | 'financial_snapshot'
  | 'risk_profile'
  | 'knowledge'
  | 'artifact'
  | 'decision'
  | 'system_note';

export type MemoryFact = {
  id: string;
  type: MemoryFactType;
  key: string;
  value: string;
  confidence: number;
  source_chat_id: string;
  createdAt: string;
  updatedAt: string;
  last_confirmed_at: string;
};

export type MemoryTimelineEntry = {
  id: string;
  chat_id: string;
  session_id?: string;
  turn_id?: string;
  timestamp: string;
  user_message: string;
  agent_message: string;
  mode?: string;
  tool_names: string[];
  artifact_titles: string[];
  summary: string;
};

export type UserMemory = {
  userId: string;
  createdAt: string;
  updatedAt: string;
  profileSummary: string;
  preferences: {
    preferred_output?: 'pdf' | 'charts' | 'mixed';
    detail_level?: 'standard' | 'high';
    tone?: string;
  };
  financialSnapshot: {
    income?: number;
    expenses?: number;
    balance?: number;
    debt_to_income_pct?: number;
    emergency_fund_months?: number;
  };
  learningState: {
    knowledge_score: number;
    milestones: string[];
    last_mode?: string;
  };
  facts: MemoryFact[];
  timeline: MemoryTimelineEntry[];
};

export type SessionWorkingMemory = {
  userId: string;
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  turnCount: number;
  rollingSummary: string;
  recentUserIntents: string[];
  openLoops: string[];
  recentTools: string[];
  recentArtifacts: string[];
  liveSignals: {
    hasDocuments: boolean;
    hasTransactions: boolean;
    hasBudget: boolean;
    knowledgeScore?: number;
  };
};

export type SystemMemory = {
  version: string;
  updatedAt: string;
  capabilities: string[];
  modules: string[];
  routes: string[];
  tools: string[];
};

const USER_MEMORY_STORE = new Map<string, UserMemory>();
const SESSION_WORKING_STORE = new Map<string, SessionWorkingMemory>();
const FACT_TTL_MS: Record<MemoryFactType, number> = {
  identity: 365 * 24 * 60 * 60 * 1000,
  goal: 120 * 24 * 60 * 60 * 1000,
  preference: 180 * 24 * 60 * 60 * 1000,
  financial_snapshot: 45 * 24 * 60 * 60 * 1000,
  risk_profile: 180 * 24 * 60 * 60 * 1000,
  knowledge: 365 * 24 * 60 * 60 * 1000,
  artifact: 90 * 24 * 60 * 60 * 1000,
  decision: 30 * 24 * 60 * 60 * 1000,
  system_note: 14 * 24 * 60 * 60 * 1000,
};

function sessionStoreKey(userId: string, sessionId: string) {
  return `${userId}::${sessionId}`;
}

function defaultSessionWorkingMemory(userId: string, sessionId: string): SessionWorkingMemory {
  const now = new Date().toISOString();
  return {
    userId,
    sessionId,
    createdAt: now,
    updatedAt: now,
    turnCount: 0,
    rollingSummary: 'Sin actividad de sesión todavía.',
    recentUserIntents: [],
    openLoops: [],
    recentTools: [],
    recentArtifacts: [],
    liveSignals: {
      hasDocuments: false,
      hasTransactions: false,
      hasBudget: false,
    },
  };
}

function toTimestamp(value: string | undefined): number {
  if (!value) return 0;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : 0;
}

function tokenizeForRelevance(text: string): string[] {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3)
    .slice(0, 40);
}

function scoreTextByTokens(text: string, tokens: string[]): number {
  if (tokens.length === 0) return 0;
  const hay = String(text ?? '').toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (hay.includes(token)) score += 1;
  }
  return score;
}

function normalizeList(values: string[], limit = 8): string[] {
  const compact = values
    .map((value) => truncate(value, 120))
    .filter((value) => value.length > 0);
  const deduped = Array.from(new Set(compact));
  return deduped.slice(-limit);
}

function extractSessionIntent(message: string): string | null {
  const trimmed = truncate(message, 140);
  if (!trimmed) return null;
  if (/\b(presupuesto|gasto|ingreso|balance|flujo)\b/i.test(trimmed)) return 'Optimizar presupuesto';
  if (/\b(transaccion|cartola|movimiento|banco|cuenta)\b/i.test(trimmed)) return 'Analizar transacciones';
  if (/\b(pdf|informe|reporte|documento)\b/i.test(trimmed)) return 'Generar reporte';
  if (/\b(simul|escenario|proyecci[oó]n|rentabilidad)\b/i.test(trimmed)) return 'Simular escenario';
  if (/\b(deuda|cuota|inter[eé]s)\b/i.test(trimmed)) return 'Gestionar deuda';
  return trimmed;
}

function inferOpenLoops(input: ChatAgentInput, response: ChatAgentResponse): string[] {
  const loops: string[] = [];
  if (Array.isArray(response.suggested_replies) && response.suggested_replies.length > 0) {
    loops.push(...response.suggested_replies.slice(0, 3).map((item) => truncate(item, 90)));
  }
  const userMessage = String(input.user_message ?? '');
  if (/\b(revisar|analizar|profundizar|continuar)\b/i.test(userMessage)) {
    loops.push('Seguimiento solicitado por el usuario');
  }
  if (response.mode === 'decision_support') {
    loops.push('Cerrar decisión con plan accionable');
  }
  return normalizeList(loops, 5);
}

function buildRollingSessionSummary(params: {
  previous: string;
  input: ChatAgentInput;
  response: ChatAgentResponse;
}): string {
  const user = truncate(String(params.input.user_message ?? ''), 120);
  const agent = truncate(String(params.response.message ?? ''), 140);
  const candidate = `Último avance: Usuario=${user} | Agente=${agent}`;
  if (!params.previous || params.previous === 'Sin actividad de sesión todavía.') return candidate;
  return truncate(`${params.previous} || ${candidate}`, 420);
}

function saveSessionWorkingMemory(memory: SessionWorkingMemory): SessionWorkingMemory {
  const normalized = {
    ...memory,
    updatedAt: new Date().toISOString(),
    recentUserIntents: normalizeList(memory.recentUserIntents, 8),
    openLoops: normalizeList(memory.openLoops, 5),
    recentTools: normalizeList(memory.recentTools, 10),
    recentArtifacts: normalizeList(memory.recentArtifacts, 10),
  };
  SESSION_WORKING_STORE.set(sessionStoreKey(memory.userId, memory.sessionId), normalized);
  if (SESSION_WORKING_STORE.size > 400) {
    const oldestKey = SESSION_WORKING_STORE.keys().next().value;
    if (oldestKey) SESSION_WORKING_STORE.delete(oldestKey);
  }
  return normalized;
}

function updateSessionWorkingMemory(params: {
  userId: string;
  input: ChatAgentInput;
  response: ChatAgentResponse;
}): SessionWorkingMemory {
  const sessionId = params.input.session_id ?? `session_${new Date().toISOString().slice(0, 10)}`;
  const key = sessionStoreKey(params.userId, sessionId);
  const current = SESSION_WORKING_STORE.get(key) ?? defaultSessionWorkingMemory(params.userId, sessionId);
  const intent = extractSessionIntent(String(params.input.user_message ?? ''));
  const tools = (params.response.tool_calls ?? []).map((tool) => tool.tool);
  const artifacts = (params.response.artifacts ?? []).map((artifact) => artifact.title);
  const knowledge =
    typeof params.response.knowledge_score === 'number'
      ? params.response.knowledge_score
      : current.liveSignals.knowledgeScore;

  return saveSessionWorkingMemory({
    ...current,
    turnCount: current.turnCount + 1,
    rollingSummary: buildRollingSessionSummary({
      previous: current.rollingSummary,
      input: params.input,
      response: params.response,
    }),
    recentUserIntents: normalizeList(
      [...current.recentUserIntents, ...(intent ? [intent] : [])],
      8
    ),
    openLoops: inferOpenLoops(params.input, params.response),
    recentTools: normalizeList([...current.recentTools, ...tools], 10),
    recentArtifacts: normalizeList([...current.recentArtifacts, ...artifacts], 10),
    liveSignals: {
      hasDocuments:
        Boolean((params.input.context as Record<string, unknown> | undefined)?.uploaded_documents) ||
        current.liveSignals.hasDocuments,
      hasTransactions:
        Boolean(
          (params.input.context as Record<string, unknown> | undefined)?.consolidated_context &&
            (params.input.context as Record<string, any>).consolidated_context?.transactions
        ) || current.liveSignals.hasTransactions,
      hasBudget:
        Boolean(
          (params.input.ui_state as Record<string, unknown> | undefined)?.budget_summary ||
            (params.input.context as Record<string, unknown> | undefined)?.budget_summary
        ) || current.liveSignals.hasBudget,
      knowledgeScore: knowledge,
    },
  });
}

function getSessionWorkingMemory(userId: string, sessionId?: string): SessionWorkingMemory | null {
  if (!sessionId) return null;
  return SESSION_WORKING_STORE.get(sessionStoreKey(userId, sessionId)) ?? null;
}

function defaultUserMemory(userId: string): UserMemory {
  const now = new Date().toISOString();
  return {
    userId,
    createdAt: now,
    updatedAt: now,
    profileSummary: 'Sin memoria consolidada todavía.',
    preferences: {},
    financialSnapshot: {},
    learningState: {
      knowledge_score: 0,
      milestones: [],
    },
    facts: [],
    timeline: [],
  };
}

function upsertFact(memory: UserMemory, partial: Omit<MemoryFact, 'id' | 'createdAt' | 'updatedAt' | 'last_confirmed_at'>) {
  const now = new Date().toISOString();
  const existing = memory.facts.find((fact) => fact.type === partial.type && fact.key === partial.key);

  if (existing) {
    existing.value = partial.value;
    existing.confidence = Math.max(existing.confidence, partial.confidence);
    existing.updatedAt = now;
    existing.last_confirmed_at = now;
    existing.source_chat_id = partial.source_chat_id;
    return;
  }

  memory.facts.push({
    ...partial,
    id: `fact_${crypto.randomUUID()}`,
    createdAt: now,
    updatedAt: now,
    last_confirmed_at: now,
  });
}

function truncate(text: string, max = 280): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

function extractCurrencyValue(message: string): number | undefined {
  const match = message.match(/\$?\s*([\d.]{4,})(?:,\d+)?/);
  if (!match) return undefined;
  const value = Number(match[1].replace(/\./g, ''));
  return Number.isFinite(value) ? value : undefined;
}

function extractGoals(message: string): string[] {
  const patterns = [
    /meta (?:es|principal es|principal:)?\s*([^.,\n]+)/gi,
    /quiero (?:lograr|ahorrar para|juntar para|invertir para)\s*([^.,\n]+)/gi,
    /objetivo (?:es|principal es|:)?\s*([^.,\n]+)/gi,
  ];

  const goals = new Set<string>();
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(message)) !== null) {
      const goal = truncate(match[1], 120);
      if (goal.length >= 4) goals.add(goal);
    }
  }
  return Array.from(goals);
}

function extractPreferenceFacts(message: string): Array<{ key: string; value: string }> {
  const preferences: Array<{ key: string; value: string }> = [];

  if (/\b(pdf|informe|reporte)\b/i.test(message)) {
    preferences.push({ key: 'preferred_output', value: 'pdf' });
  }
  if (/\b(gr[aá]fico|chart|tabla)\b/i.test(message)) {
    preferences.push({ key: 'preferred_output', value: 'charts' });
  }
  if (/\b(detallado|profundo|tecnico|t[eé]cnico)\b/i.test(message)) {
    preferences.push({ key: 'detail_level', value: 'high' });
  }
  if (/\b(simple|breve|resumido|ejecutivo)\b/i.test(message)) {
    preferences.push({ key: 'detail_level', value: 'standard' });
  }

  return preferences;
}

function extractRiskFact(message: string): string | undefined {
  if (/\b(conservador|bajo riesgo|seguro)\b/i.test(message)) return 'conservative';
  if (/\b(balanceado|equilibrado|moderado)\b/i.test(message)) return 'balanced';
  if (/\b(agresivo|alto riesgo|growth|crecimiento)\b/i.test(message)) return 'aggressive';
  return undefined;
}

function scoreFactRelevance(fact: MemoryFact, tokens: string[]): number {
  const tokenScore = scoreTextByTokens(`${fact.key} ${fact.value}`, tokens);
  const recencyBoost = Math.max(0, 1 - (Date.now() - toTimestamp(fact.updatedAt)) / (60 * 24 * 60 * 60 * 1000));
  const confidenceBoost = Math.min(1, Math.max(0, fact.confidence));
  return tokenScore * 1.8 + recencyBoost * 0.8 + confidenceBoost;
}

function scoreTimelineRelevance(entry: MemoryTimelineEntry, tokens: string[]): number {
  const tokenScore = scoreTextByTokens(
    `${entry.user_message} ${entry.agent_message} ${entry.summary} ${entry.mode ?? ''}`,
    tokens
  );
  const recencyBoost = Math.max(0, 1 - (Date.now() - toTimestamp(entry.timestamp)) / (30 * 24 * 60 * 60 * 1000));
  return tokenScore * 1.6 + recencyBoost * 0.8;
}

function isFactExpired(fact: MemoryFact): boolean {
  const ttl = FACT_TTL_MS[fact.type] ?? 90 * 24 * 60 * 60 * 1000;
  const lastSeen = Math.max(toTimestamp(fact.updatedAt), toTimestamp(fact.last_confirmed_at));
  if (!lastSeen) return false;
  return Date.now() - lastSeen > ttl;
}

function pruneMemoryForEfficiency(memory: UserMemory): UserMemory {
  const facts = memory.facts
    .filter((fact) => !isFactExpired(fact))
    .sort((a, b) => toTimestamp(b.updatedAt) - toTimestamp(a.updatedAt))
    .slice(0, 200);
  const timeline = memory.timeline
    .sort((a, b) => toTimestamp(b.timestamp) - toTimestamp(a.timestamp))
    .slice(0, 220);
  return {
    ...memory,
    facts,
    timeline,
  };
}

function buildSemanticDigest(memory: UserMemory): Array<{ theme: string; weight: number }> {
  const buckets: Record<string, number> = {
    goals: 0,
    preferences: 0,
    budget: 0,
    risk: 0,
    evidence: 0,
    decisions: 0,
  };
  for (const fact of memory.facts) {
    if (fact.type === 'goal') buckets.goals += 2;
    if (fact.type === 'preference') buckets.preferences += 2;
    if (fact.type === 'financial_snapshot') buckets.budget += 2;
    if (fact.type === 'risk_profile') buckets.risk += 2;
    if (fact.type === 'artifact') buckets.evidence += 2;
    if (fact.type === 'decision') buckets.decisions += 2;
  }
  if (memory.learningState.knowledge_score > 0) {
    buckets.decisions += Math.round(memory.learningState.knowledge_score / 20);
  }
  return Object.entries(buckets)
    .map(([theme, weight]) => ({ theme, weight }))
    .filter((item) => item.weight > 0)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 6);
}

function buildProfileSummary(memory: UserMemory): string {
  const facts = memory.facts
    .filter((fact) => ['goal', 'preference', 'risk_profile', 'identity'].includes(fact.type))
    .slice(-8)
    .map((fact) => `${fact.key}: ${fact.value}`);

  const snapshotParts = [
    memory.financialSnapshot.income ? `ingreso ${memory.financialSnapshot.income}` : null,
    memory.financialSnapshot.expenses ? `gastos ${memory.financialSnapshot.expenses}` : null,
    memory.financialSnapshot.balance !== undefined ? `balance ${memory.financialSnapshot.balance}` : null,
    memory.learningState.knowledge_score
      ? `knowledge ${memory.learningState.knowledge_score}/100`
      : null,
  ].filter(Boolean);

  const parts = [...facts, ...snapshotParts].slice(0, 10);
  return parts.length > 0
    ? truncate(`Perfil recordado: ${parts.join(' | ')}`, 500)
    : 'Sin memoria consolidada todavía.';
}

function buildTimelineSummary(userMessage: string, response: ChatAgentResponse): string {
  const base = `Usuario: ${truncate(userMessage, 120)} | Agente: ${truncate(response.message, 160)}`;
  return truncate(base, 240);
}

function buildSystemMemoryPayload(): SystemMemory {
  const now = new Date().toISOString();
  const tools = listTools().map((tool) => tool.name).sort();

  return {
    version: 'v1',
    updatedAt: now,
    capabilities: [
      'Chat financiero persistente para Chile',
      'Simulaciones, presupuesto, deuda, APV, metas y PDFs',
      'RAG regulatorio y glosario financiero',
      'Persistencia de contexto, sheets, artefactos y aprendizaje',
    ],
    modules: [
      'core_agent',
      'interview',
      'diagnostic_profile',
      'budget_panel',
      'documents',
      'simulations',
      'knowledge_tracking',
      'persistent_memory',
    ],
    routes: [
      '/api/agent',
      '/api/welcome',
      '/api/session',
      '/api/sheets',
      '/conversation/next',
      '/intake/submit',
      '/simulations',
      '/health',
    ],
    tools,
  };
}

export function loadSystemMemory(): SystemMemory {
  return buildSystemMemoryPayload();
}

export function loadUserMemory(userId: string): UserMemory {
  const memory = USER_MEMORY_STORE.get(userId);
  if (!memory) {
    return defaultUserMemory(userId);
  }

  try {
    const parsed = memory;
    return {
      ...defaultUserMemory(userId),
      ...parsed,
      userId,
      facts: Array.isArray(parsed.facts) ? parsed.facts : [],
      timeline: Array.isArray(parsed.timeline) ? parsed.timeline : [],
    };
  } catch (err) {
    getLogger().warn({ msg: '[Memory] Failed to parse user memory', userId, error: err });
    return defaultUserMemory(userId);
  }
}

export async function hydrateUserMemoryFromBlob(userId: string): Promise<UserMemory> {
  const cached = USER_MEMORY_STORE.get(userId);
  if (cached) return cached;

  try {
    const blob = await loadUserMemoryBlob(userId);
    if (!blob) return defaultUserMemory(userId);
    const parsed = blob as Partial<UserMemory>;
    const hydrated: UserMemory = {
      ...defaultUserMemory(userId),
      ...parsed,
      userId,
      facts: Array.isArray(parsed.facts) ? (parsed.facts as MemoryFact[]) : [],
      timeline: Array.isArray(parsed.timeline) ? (parsed.timeline as MemoryTimelineEntry[]) : [],
      preferences:
        parsed.preferences && typeof parsed.preferences === 'object'
          ? (parsed.preferences as UserMemory['preferences'])
          : {},
      financialSnapshot:
        parsed.financialSnapshot && typeof parsed.financialSnapshot === 'object'
          ? (parsed.financialSnapshot as UserMemory['financialSnapshot'])
          : {},
      learningState:
        parsed.learningState && typeof parsed.learningState === 'object'
          ? (parsed.learningState as UserMemory['learningState'])
          : { knowledge_score: 0, milestones: [] },
    };
    USER_MEMORY_STORE.set(userId, hydrated);
    return hydrated;
  } catch (err) {
    getLogger().warn({ msg: '[Memory] Failed to hydrate from blob', userId, error: err });
    return defaultUserMemory(userId);
  }
}

export async function persistUserMemoryToBlob(memory: UserMemory): Promise<void> {
  try {
    await saveUserMemoryBlob(memory.userId, memory as unknown as Record<string, unknown>);
  } catch (err) {
    getLogger().warn({
      msg: '[Memory] Failed to persist memory blob',
      userId: memory.userId,
      error: err,
    });
  }
}

export function saveUserMemory(memory: UserMemory): UserMemory {
  const compacted = pruneMemoryForEfficiency(memory);
  const normalized: UserMemory = {
    ...compacted,
    updatedAt: new Date().toISOString(),
    profileSummary: buildProfileSummary(compacted),
  };
  USER_MEMORY_STORE.set(memory.userId, normalized);
  return normalized;
}

export function buildAgentMemoryContext(
  userId: string,
  options?: { sessionId?: string; query?: string }
): {
  user_memory: {
    profile_summary: string;
    preferences: UserMemory['preferences'];
    financial_snapshot: UserMemory['financialSnapshot'];
    learning_state: UserMemory['learningState'];
    key_facts: MemoryFact[];
    recent_timeline: MemoryTimelineEntry[];
    optimized_memory: {
      relevant_facts: MemoryFact[];
      relevant_timeline: MemoryTimelineEntry[];
      semantic_digest: Array<{ theme: string; weight: number }>;
    };
  };
  session_memory?: {
    session_id: string;
    rolling_summary: string;
    recent_intents: string[];
    open_loops: string[];
    recent_tools: string[];
    recent_artifacts: string[];
    turn_count: number;
    live_signals: SessionWorkingMemory['liveSignals'];
  } | null;
  system_memory: SystemMemory;
} {
  const userMemory = loadUserMemory(userId);
  const systemMemory = loadSystemMemory();
  const sessionMemory = getSessionWorkingMemory(userId, options?.sessionId);
  const queryTokens = tokenizeForRelevance(options?.query ?? '');
  const relevantFacts = userMemory.facts
    .map((fact) => ({ fact, score: scoreFactRelevance(fact, queryTokens) }))
    .sort((a, b) => b.score - a.score || toTimestamp(b.fact.updatedAt) - toTimestamp(a.fact.updatedAt))
    .slice(0, 16)
    .map((item) => item.fact);
  const relevantTimeline = userMemory.timeline
    .map((entry) => ({ entry, score: scoreTimelineRelevance(entry, queryTokens) }))
    .sort((a, b) => b.score - a.score || toTimestamp(b.entry.timestamp) - toTimestamp(a.entry.timestamp))
    .slice(0, 8)
    .map((item) => item.entry);
  const semanticDigest = buildSemanticDigest(userMemory);

  return {
    user_memory: {
      profile_summary: userMemory.profileSummary,
      preferences: userMemory.preferences,
      financial_snapshot: userMemory.financialSnapshot,
      learning_state: userMemory.learningState,
      key_facts: userMemory.facts.slice(-20),
      recent_timeline: userMemory.timeline.slice(-12),
      optimized_memory: {
        relevant_facts: relevantFacts,
        relevant_timeline: relevantTimeline,
        semantic_digest: semanticDigest,
      },
    },
    session_memory: sessionMemory
      ? {
          session_id: sessionMemory.sessionId,
          rolling_summary: sessionMemory.rollingSummary,
          recent_intents: sessionMemory.recentUserIntents,
          open_loops: sessionMemory.openLoops,
          recent_tools: sessionMemory.recentTools,
          recent_artifacts: sessionMemory.recentArtifacts,
          turn_count: sessionMemory.turnCount,
          live_signals: sessionMemory.liveSignals,
        }
      : null,
    system_memory: systemMemory,
  };
}

export async function buildAgentMemoryContextRealtime(
  userId: string,
  options?: { sessionId?: string; query?: string }
) {
  await hydrateUserMemoryFromBlob(userId);
  return buildAgentMemoryContext(userId, options);
}

export function appendTurnToMemory(params: {
  input: ChatAgentInput;
  response: ChatAgentResponse;
  authenticatedUser?: Record<string, unknown> | null;
}): UserMemory {
  const { input, response, authenticatedUser } = params;
  if (!input.user_id) return {} as UserMemory; // no persisting guest turns
  const memory = loadUserMemory(input.user_id);
  const now = new Date().toISOString();
  const chatId = input.session_id ?? `chat_${new Date().toISOString().slice(0, 10)}`;

  if (input.user_name) {
    upsertFact(memory, {
      type: 'identity',
      key: 'first_name',
      value: truncate(input.user_name, 80),
      confidence: 0.95,
      source_chat_id: chatId,
    });
  }

  const message = input.user_message;
  const goals = extractGoals(message);
  for (const goal of goals) {
    upsertFact(memory, {
      type: 'goal',
      key: goal.toLowerCase(),
      value: goal,
      confidence: 0.8,
      source_chat_id: chatId,
    });
  }

  for (const preference of extractPreferenceFacts(message)) {
    upsertFact(memory, {
      type: 'preference',
      key: preference.key,
      value: preference.value,
      confidence: 0.75,
      source_chat_id: chatId,
    });

    if (preference.key === 'preferred_output' && ['pdf', 'charts', 'mixed'].includes(preference.value)) {
      memory.preferences.preferred_output = preference.value as 'pdf' | 'charts' | 'mixed';
    }
    if (preference.key === 'detail_level' && ['standard', 'high'].includes(preference.value)) {
      memory.preferences.detail_level = preference.value as 'standard' | 'high';
    }
  }

  const risk = extractRiskFact(message);
  if (risk) {
    upsertFact(memory, {
      type: 'risk_profile',
      key: 'risk_preference',
      value: risk,
      confidence: 0.7,
      source_chat_id: chatId,
    });
  }

  const budgetSummary = (input.ui_state?.budget_summary ?? {}) as Record<string, unknown>;
  const contextBudget = (input.context?.budget_summary ?? {}) as Record<string, unknown>;
  const mergedBudget = {
    income: Number(budgetSummary.income ?? contextBudget.income),
    expenses: Number(budgetSummary.expenses ?? contextBudget.expenses),
    balance: Number(budgetSummary.balance ?? contextBudget.balance),
    debt_to_income_pct: Number(budgetSummary.debt_to_income_pct ?? contextBudget.debt_to_income_pct),
    emergency_fund_months: Number(
      budgetSummary.emergency_fund_months ?? contextBudget.emergency_fund_months
    ),
  };

  for (const [key, value] of Object.entries(mergedBudget)) {
    if (Number.isFinite(value)) {
      (memory.financialSnapshot as Record<string, number>)[key] = value;
      upsertFact(memory, {
        type: 'financial_snapshot',
        key,
        value: String(value),
        confidence: 0.9,
        source_chat_id: chatId,
      });
    }
  }

  const amount = extractCurrencyValue(message);
  if (amount) {
    upsertFact(memory, {
      type: 'financial_snapshot',
      key: 'last_explicit_amount',
      value: String(amount),
      confidence: 0.65,
      source_chat_id: chatId,
    });
  }

  if (typeof response.knowledge_score === 'number') {
    memory.learningState.knowledge_score = response.knowledge_score;
    upsertFact(memory, {
      type: 'knowledge',
      key: 'knowledge_score',
      value: String(response.knowledge_score),
      confidence: 0.95,
      source_chat_id: chatId,
    });
  }

  if (response.milestone_unlocked?.feature) {
    const nextMilestones = new Set(memory.learningState.milestones);
    nextMilestones.add(response.milestone_unlocked.feature);
    memory.learningState.milestones = Array.from(nextMilestones);
  }

  if (response.mode) {
    memory.learningState.last_mode = response.mode;
  }

  for (const artifact of response.artifacts ?? []) {
    upsertFact(memory, {
      type: 'artifact',
      key: artifact.id,
      value: artifact.title,
      confidence: 0.9,
      source_chat_id: chatId,
    });
  }

  if (response.state_updates?.coherence_validation?.warnings?.length) {
    upsertFact(memory, {
      type: 'decision',
      key: 'last_coherence_warning',
      value: truncate(response.state_updates.coherence_validation.warnings.join(' | '), 240),
      confidence: 0.8,
      source_chat_id: chatId,
    });
  }

  const injectedProfileRecord =
    authenticatedUser && typeof authenticatedUser.injectedProfile === 'object'
      ? (authenticatedUser.injectedProfile as Record<string, unknown>)
      : null;
  const profileRecord =
    injectedProfileRecord && typeof injectedProfileRecord.profile === 'object'
      ? (injectedProfileRecord.profile as Record<string, unknown>)
      : null;

  if (typeof profileRecord?.emotionalPattern === 'string' && profileRecord.emotionalPattern.length > 0) {
    upsertFact(memory, {
      type: 'identity',
      key: 'emotional_pattern',
      value: profileRecord.emotionalPattern,
      confidence: 0.85,
      source_chat_id: chatId,
    });
  }

  memory.timeline.push({
    id: `turn_${crypto.randomUUID()}`,
    chat_id: chatId,
    session_id: input.session_id,
    turn_id: typeof response.meta?.turn_id === 'string' ? response.meta.turn_id : undefined,
    timestamp: now,
    user_message: truncate(input.user_message, 500),
    agent_message: truncate(response.message, 500),
    mode: response.mode,
    tool_names: (response.tool_calls ?? []).map((tool) => tool.tool),
    artifact_titles: (response.artifacts ?? []).map((artifact) => artifact.title),
    summary: buildTimelineSummary(input.user_message, response),
  });

  saveUserMemory(memory);
  return memory;
}

export async function appendTurnToMemoryRealtime(params: {
  input: ChatAgentInput;
  response: ChatAgentResponse;
  authenticatedUser?: Record<string, unknown> | null;
}): Promise<{ memory: UserMemory; session_memory: SessionWorkingMemory }> {
  const userId = params.input.user_id;
  if (!userId) {
    return {
      memory: defaultUserMemory('guest'),
      session_memory: defaultSessionWorkingMemory('guest', 'session_guest'),
    };
  }

  await hydrateUserMemoryFromBlob(userId);
  const memory = appendTurnToMemory(params);
  const sessionMemory = updateSessionWorkingMemory({
    userId,
    input: params.input,
    response: params.response,
  });
  await persistUserMemoryToBlob(memory);
  return { memory, session_memory: sessionMemory };
}

export function appendMemoryTimelineNote(params: {
  userId: string;
  chatId: string;
  sessionId?: string;
  userMessage: string;
  agentMessage: string;
  mode?: string;
  summary?: string;
  facts?: Array<{ type: MemoryFactType; key: string; value: string; confidence?: number }>;
}): UserMemory {
  const memory = loadUserMemory(params.userId);
  const now = new Date().toISOString();

  for (const fact of params.facts ?? []) {
    upsertFact(memory, {
      type: fact.type,
      key: fact.key,
      value: truncate(fact.value, 240),
      confidence: fact.confidence ?? 0.7,
      source_chat_id: params.chatId,
    });
  }

  memory.timeline.push({
    id: `turn_${crypto.randomUUID()}`,
    chat_id: params.chatId,
    session_id: params.sessionId,
    timestamp: now,
    user_message: truncate(params.userMessage, 500),
    agent_message: truncate(params.agentMessage, 500),
    mode: params.mode,
    tool_names: [],
    artifact_titles: [],
    summary:
      params.summary ??
      truncate(`Usuario: ${params.userMessage} | Sistema: ${params.agentMessage}`, 240),
  });

  saveUserMemory(memory);
  return memory;
}
