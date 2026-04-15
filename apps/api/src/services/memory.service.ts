import crypto from 'crypto';
import type { ChatAgentInput, ChatAgentResponse } from '../agents/core.agent/chat.types';
import { listTools } from '../mcp/tools/registry';
import { getLogger } from '../logger';

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

export type SystemMemory = {
  version: string;
  updatedAt: string;
  capabilities: string[];
  modules: string[];
  routes: string[];
  tools: string[];
};

const USER_MEMORY_STORE = new Map<string, UserMemory>();

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

export function saveUserMemory(memory: UserMemory): UserMemory {
  const normalized: UserMemory = {
    ...memory,
    updatedAt: new Date().toISOString(),
    profileSummary: buildProfileSummary(memory),
  };
  USER_MEMORY_STORE.set(memory.userId, normalized);
  return normalized;
}

export function buildAgentMemoryContext(userId: string): {
  user_memory: {
    profile_summary: string;
    preferences: UserMemory['preferences'];
    financial_snapshot: UserMemory['financialSnapshot'];
    learning_state: UserMemory['learningState'];
    key_facts: MemoryFact[];
    recent_timeline: MemoryTimelineEntry[];
  };
  system_memory: SystemMemory;
} {
  const userMemory = loadUserMemory(userId);
  const systemMemory = loadSystemMemory();

  return {
    user_memory: {
      profile_summary: userMemory.profileSummary,
      preferences: userMemory.preferences,
      financial_snapshot: userMemory.financialSnapshot,
      learning_state: userMemory.learningState,
      key_facts: userMemory.facts.slice(-20),
      recent_timeline: userMemory.timeline.slice(-12),
    },
    system_memory: systemMemory,
  };
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

  if (authenticatedUser?.injectedProfile?.profile?.emotionalPattern) {
    upsertFact(memory, {
      type: 'identity',
      key: 'emotional_pattern',
      value: authenticatedUser.injectedProfile.profile.emotionalPattern,
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
