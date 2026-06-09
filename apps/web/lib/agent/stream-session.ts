import {
  createInitialAgentStreamUiState,
  type AgentStreamUiState,
} from '@financial-agent/shared';

import type { ChatItem } from '@/lib/agent.response.types';

type AssistantMessageItem = Extract<ChatItem, { type: 'message'; role: 'assistant' }>;

function isStreamingAssistantItem(item: ChatItem): item is AssistantMessageItem {
  return item.type === 'message' && item.role === 'assistant' && Boolean(item.stream?.streaming);
}

function findStreamingAssistantIndex(list: ChatItem[]): number {
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (isStreamingAssistantItem(list[i])) return i;
  }
  return -1;
}

export function createStreamingAssistantPlaceholder(): AssistantMessageItem {
  return {
    type: 'message',
    role: 'assistant',
    content: '',
    mode: 'information',
    stream: createInitialAgentStreamUiState(),
  };
}

export function removeStreamingAssistantMessage(list: ChatItem[]): ChatItem[] {
  const index = findStreamingAssistantIndex(list);
  if (index < 0) return list;
  return [...list.slice(0, index), ...list.slice(index + 1)];
}

export function patchStreamingAssistantMessage(
  list: ChatItem[],
  patch: Partial<AssistantMessageItem>,
): ChatItem[] {
  const index = findStreamingAssistantIndex(list);
  if (index < 0) return list;
  const item = list[index];
  if (!isStreamingAssistantItem(item)) return list;
  return [...list.slice(0, index), { ...item, ...patch }, ...list.slice(index + 1)];
}

export function appendOptimisticCoreAgentTurn(params: {
  list: ChatItem[];
  userMessage: string;
  hideUserMessage?: boolean;
}): ChatItem[] {
  const next = params.hideUserMessage
    ? [...params.list]
    : [...params.list, { type: 'message' as const, role: 'user' as const, content: params.userMessage }];
  return [...next, createStreamingAssistantPlaceholder()];
}

export type { AgentStreamUiState };
