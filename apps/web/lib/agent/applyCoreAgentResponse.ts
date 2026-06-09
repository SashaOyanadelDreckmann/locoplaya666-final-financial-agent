import type { ChatClosureSummary } from '@financial-agent/shared';

import type { FincoinUsageApiPayload } from '@/lib/api';
import {
  toChatItemsFromAgentResponse,
  type AgentResponse,
  type ChatItem,
} from '@/lib/agent.response.types';
import { sanitizeChatItems, sanitizeMessageText } from '@/app/agent/page.utils';
import { removeStreamingAssistantMessage } from '@/lib/agent/stream-session';

export type ProductLifecyclePatch = {
  phase?: string;
  unlockedChats?: string[];
  closedChats?: string[];
  chatTurns?: Record<string, number>;
  actionPlanFunnelStage?: 'brainstorm' | 'converge' | 'deliver' | null;
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
  budgetUpdates?: NonNullable<AgentResponse['budget_updates']>;
  contextScore?: number;
};

export type ApplyCoreAgentResponseResult = {
  items: ChatItem[];
  sideEffects: CoreAgentResponseSideEffects;
};

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
    budgetUpdates: Array.isArray(res.budget_updates) ? res.budget_updates : undefined,
    contextScore: typeof res.context_score === 'number' ? res.context_score : undefined,
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
  const next = sanitizeChatItems(toChatItemsFromAgentResponse(response));

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

  if (nextFiltered.length === 0) {
    return {
      sideEffects,
      items: [
        ...base,
        {
          type: 'message',
          role: 'assistant',
          content: sanitizeMessageText(response.message, '—'),
          mode: response.mode ?? response.reasoning_mode,
          objective: response.react?.objective,
          agent_blocks: response.agent_blocks,
        },
      ],
    };
  }

  return {
    sideEffects,
    items: [...base, ...nextFiltered],
  };
}

export function applyCoreAgentErrorItems(currentItems: ChatItem[], errorText: string): ChatItem[] {
  return [
    ...removeStreamingAssistantMessage(currentItems),
    {
      type: 'message',
      role: 'assistant',
      content: errorText,
    },
  ];
}
