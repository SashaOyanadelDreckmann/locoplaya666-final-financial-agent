import type { ChatClosureSummary, BudgetTablePatch } from '@financial-agent/shared';

import type { FincoinUsageApiPayload } from '@/lib/api/cliente';
import {
  toChatItemsFromAgentResponse,
  type AgentResponse,
  type ChatItem,
} from '@/lib/agente/agent.response.types';
import {
  isRecoverableChatErrorMessage,
  isWelcomeShellMessageContent,
} from '@/app/agent/flujo/welcome-intro.shared';
import { sanitizeChatItems, sanitizeMessageText } from '@/app/agent/utilidades/page.utils';
import {
  readStreamingAssistantContent,
  removeStreamingAssistantMessage,
} from '@/lib/agente/nucleo/stream-session';

export type ProductLifecyclePatch = {
  phase?: string;
  unlockedChats?: string[];
  closedChats?: string[];
  chatTurns?: Record<string, number>;
  actionPlanFunnelStage?: 'brainstorm' | 'converge' | 'deliver' | null;
  socialConsciousnessFunnelStage?: 'explore' | 'tension' | 'synthesis' | null;
  closingMode?: boolean;
};

export type CoreAgentResponseSideEffects = {
  agentMeta?: { objective?: string; mode?: string };
  knowledgeScore?: number;
  milestoneUnlocked?: string;
  productLifecyclePatch?: ProductLifecyclePatch;
  closureSummary?: ChatClosureSummary | null;
  fincoinUsage?: FincoinUsageApiPayload;
  closureSummaries?: Record<string, unknown>;
  panelAction?: AgentResponse['panel_action'];
  budgetTablePatch?: BudgetTablePatch;
  /** @deprecated */
  budgetUpdates?: NonNullable<AgentResponse['budget_updates']>;
};

export type ApplyCoreAgentResponseResult = {
  items: ChatItem[];
  sideEffects: CoreAgentResponseSideEffects;
};

function resolveFinalAssistantMessage(
  response: AgentResponse,
  streamedContent: string,
): string {
  const fromResponse = sanitizeMessageText(response.message, '');
  const fromStream = sanitizeMessageText(streamedContent, '');

  if (fromResponse.trim()) {
    const shouldPreferStream =
      fromStream.trim() &&
      !isGenericOnboardingMessage(fromStream) &&
      (isGenericOnboardingMessage(fromResponse) || isFormatPhaseFallbackMessage(fromResponse));
    if (shouldPreferStream) {
      return fromStream;
    }
    return fromResponse;
  }

  if (fromStream.trim()) return fromStream;
  return sanitizeMessageText(response.message, '—');
}

function buildFinalAssistantMessageItem(
  response: AgentResponse,
  content: string,
): Extract<ChatItem, { type: 'message'; role: 'assistant' }> {
  return {
    type: 'message',
    role: 'assistant',
    content,
    mode: response.mode ?? response.reasoning_mode,
    objective: response.react?.objective,
    agent_blocks: response.agent_blocks,
    suggested_replies: Array.isArray(response.suggested_replies)
      ? response.suggested_replies.map((entry) => String(entry ?? '').trim()).filter(Boolean).slice(0, 4)
      : undefined,
    panel_action: response.panel_action,
  };
}

const FORMAT_PHASE_FALLBACK_SNIPPET =
  'preparé una respuesta base con los resultados disponibles';

function isFormatPhaseFallbackMessage(text: string): boolean {
  const normalized = (text || '').toLowerCase().replace(/\s+/g, ' ').trim();
  return normalized.includes(FORMAT_PHASE_FALLBACK_SNIPPET);
}

function isGenericOnboardingMessage(text: string): boolean {
  const normalized = (text || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!normalized) return false;
  return (
    normalized.includes('hola, bienvenido. soy tu agente financiero personal en chile') ||
    normalized.includes('aquí podemos hacer tres cosas concretas juntos') ||
    normalized.includes('puedo hacer 3 cosas contigo') ||
    normalized.includes('en el panel lateral vas a ver herramientas') ||
    normalized.includes('se van desbloqueando a medida que avanzamos') ||
    normalized.includes('generar informes') ||
    normalized.includes('pdfs personalizados') ||
    normalized.includes('informes que puedas descargar') ||
    normalized.includes('optimizar ahorros y generar informes') ||
    normalized.includes('partamos con una acción simple') ||
    normalized.includes('para empezar, cuéntame en una frase') ||
    normalized.includes('bienvenido a financieramente')
  );
}

function extractProductLifecyclePatch(
  res: AgentResponse,
): Pick<CoreAgentResponseSideEffects, 'productLifecyclePatch' | 'closureSummary'> {
  const metaLifecycle = res.meta?.product_lifecycle as
    | (NonNullable<AgentResponse['meta']>['product_lifecycle'] & {
        closing_summary?: ChatClosureSummary | null;
      })
    | undefined;

  if (!metaLifecycle) return {};

  const closureSummary =
    metaLifecycle.closing_summary && typeof metaLifecycle.closing_summary === 'object'
      ? (metaLifecycle.closing_summary as ChatClosureSummary)
      : null;

  return {
    closureSummary,
    productLifecyclePatch: {
      phase: typeof metaLifecycle.phase === 'string' ? metaLifecycle.phase : undefined,
      unlockedChats: Array.isArray(metaLifecycle.unlocked_chats)
        ? metaLifecycle.unlocked_chats
        : undefined,
      closedChats: Array.isArray(metaLifecycle.closed_chats)
        ? metaLifecycle.closed_chats
        : undefined,
      chatTurns:
        typeof metaLifecycle.active_chat_id === 'string' &&
        typeof metaLifecycle.turn_count === 'number'
          ? { [metaLifecycle.active_chat_id]: metaLifecycle.turn_count }
          : undefined,
      actionPlanFunnelStage:
        metaLifecycle.action_plan_funnel_stage === 'brainstorm' ||
        metaLifecycle.action_plan_funnel_stage === 'converge' ||
        metaLifecycle.action_plan_funnel_stage === 'deliver'
          ? metaLifecycle.action_plan_funnel_stage
          : undefined,
      socialConsciousnessFunnelStage:
        metaLifecycle.social_consciousness_funnel_stage === 'explore' ||
        metaLifecycle.social_consciousness_funnel_stage === 'tension' ||
        metaLifecycle.social_consciousness_funnel_stage === 'synthesis'
          ? metaLifecycle.social_consciousness_funnel_stage
          : undefined,
      closingMode:
        typeof metaLifecycle.closing_mode === 'boolean' ? metaLifecycle.closing_mode : undefined,
    },
  };
}

export function extractCoreAgentSideEffects(res: AgentResponse): CoreAgentResponseSideEffects {
  const lifecycle = extractProductLifecyclePatch(res);
  const fincoinMeta = res.meta as
    | {
        fincoin_usage?: FincoinUsageApiPayload;
        closure_summaries?: Record<string, unknown>;
      }
    | undefined;

  return {
    agentMeta: {
      objective: res.react?.objective,
      mode: res.mode ?? res.reasoning_mode,
    },
    knowledgeScore: typeof res.knowledge_score === 'number' ? res.knowledge_score : undefined,
    milestoneUnlocked: res.milestone_unlocked?.feature,
    panelAction: res.panel_action,
    budgetTablePatch: res.budget_table_patch as BudgetTablePatch | undefined,
    budgetUpdates: Array.isArray(res.budget_updates) ? res.budget_updates : undefined,
    fincoinUsage: fincoinMeta?.fincoin_usage,
    closureSummaries: fincoinMeta?.closure_summaries,
    ...lifecycle,
  };
}

export function applyCoreAgentResponseToItems(params: {
  items: ChatItem[];
  response: AgentResponse;
  filterGenericOnboarding?: boolean;
}): ChatItem[] {
  return applyCoreAgentResponse({
    currentItems: params.items,
    response: params.response,
    filterGenericOnboarding: params.filterGenericOnboarding,
  }).items;
}

export function applyCoreAgentResponse(params: {
  currentItems: ChatItem[];
  response: AgentResponse;
  filterGenericOnboarding?: boolean;
}): ApplyCoreAgentResponseResult {
  const { currentItems, response, filterGenericOnboarding = true } = params;
  const sideEffects = extractCoreAgentSideEffects(response);
  const streamedContent = readStreamingAssistantContent(currentItems);
  const finalMessage = resolveFinalAssistantMessage(response, streamedContent);
  const enrichedResponse: AgentResponse = {
    ...response,
    message: finalMessage,
  };
  const next = sanitizeChatItems(toChatItemsFromAgentResponse(enrichedResponse));

  const hasAssistantInHistory = currentItems.some(
    (item) => item.type === 'message' && item.role === 'assistant',
  );

  const nextFiltered =
    filterGenericOnboarding && hasAssistantInHistory
      ? next.filter((item) => {
          if (item.type !== 'message' || item.role !== 'assistant') return true;
          return !isGenericOnboardingMessage(item.content);
        })
      : next;

  const base = removeStreamingAssistantMessage(currentItems);
  const hasAssistantBubble = nextFiltered.some(
    (item) => item.type === 'message' && item.role === 'assistant',
  );

  if (nextFiltered.length === 0 || !hasAssistantBubble) {
    const assistantItem = buildFinalAssistantMessageItem(enrichedResponse, finalMessage);
    const supplemental = nextFiltered.filter(
      (item) => !(item.type === 'message' && item.role === 'assistant'),
    );
    return {
      sideEffects,
      items: [...base, assistantItem, ...supplemental],
    };
  }

  return {
    sideEffects,
    items: [...base, ...nextFiltered],
  };
}

export function applyCoreAgentErrorItems(
  currentItems: ChatItem[],
  errorText: string,
): { items: ChatItem[]; transientError?: string } {
  const base = removeStreamingAssistantMessage(currentItems).filter((item) => {
    if (item.type !== 'message' || item.role !== 'assistant') return true;
    return !isRecoverableChatErrorMessage(String(item.content ?? ''));
  });

  const hasWelcomeShell = base.some(
    (item) =>
      item.type === 'message' &&
      item.role === 'assistant' &&
      isWelcomeShellMessageContent(item.content),
  );

  return {
    items: [
      ...base,
      {
        type: 'message',
        role: 'assistant',
        content: errorText,
        mode: 'information',
      },
    ],
    transientError: hasWelcomeShell ? errorText : undefined,
  };
}
