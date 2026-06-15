import {
  createInitialAgentStreamUiState,
  createJsonTransportStreamUiState,
  readBrowserAgentTransportHint,
  shouldPreferAgentJsonTransport,
  type AgentStreamUiState,
} from '@financial-agent/shared';

import {
  buildChatIntroShellItem,
  isLegacyChatIntroItem,
  shouldSeedChatIntroMessage,
  type ChatIntroId,
} from '@/app/agent/flujo/chat-intro.shared';
import {
  buildWelcomeChatItem,
  isLegacyWelcomeAssistantItem,
  isWelcomeShellMessageContent,
  shouldSeedWelcomeMessage,
} from '@/app/agent/flujo/welcome-intro.shared';
import type { ChatItem } from '@/lib/agente/agent.response.types';

type AssistantMessageItem = Extract<ChatItem, { type: 'message'; role: 'assistant' }>;

function isStreamSessionAssistantItem(item: ChatItem): item is AssistantMessageItem {
  return item.type === 'message' && item.role === 'assistant' && item.stream != null;
}

function findStreamingAssistantIndex(list: ChatItem[]): number {
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (isStreamSessionAssistantItem(list[i])) return i;
  }
  return -1;
}

export function createStreamingAssistantPlaceholder(): AssistantMessageItem {
  const preferJson =
    typeof window !== 'undefined' &&
    shouldPreferAgentJsonTransport(readBrowserAgentTransportHint());

  return {
    type: 'message',
    role: 'assistant',
    content: '',
    mode: 'information',
    stream: preferJson ? createJsonTransportStreamUiState() : createInitialAgentStreamUiState(),
  };
}

export function readStreamingAssistantContent(list: ChatItem[]): string {
  const index = findStreamingAssistantIndex(list);
  if (index < 0) return '';
  const item = list[index];
  if (!isStreamSessionAssistantItem(item)) return '';
  return String(item.content ?? '').trim();
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
  if (!isStreamSessionAssistantItem(item)) return list;
  return [...list.slice(0, index), { ...item, ...patch }, ...list.slice(index + 1)];
}

function isLeadingIntroShell(item: ChatItem, threadId: string): boolean {
  if (item.type !== 'message' || item.role !== 'assistant') return false;
  if (item.stream?.streaming) return false;

  if (threadId === 'chat-1') {
    return (
      isWelcomeShellMessageContent(item.content) || isLegacyWelcomeAssistantItem(item)
    );
  }

  if (threadId === 'chat-2' || threadId === 'chat-3') {
    return (
      isWelcomeShellMessageContent(item.content) || isLegacyChatIntroItem(item, threadId)
    );
  }

  return false;
}

/** Keeps the executive welcome / chat intro carousel as the first bubble in the thread. */
export function ensureLeadingIntroShell(threadId: string, items: ChatItem[]): ChatItem[] {
  if (threadId !== 'chat-1' && threadId !== 'chat-2' && threadId !== 'chat-3') {
    return items;
  }

  const first = items[0];
  if (first && isLeadingIntroShell(first, threadId)) {
    return items;
  }

  const firstAssistant = items.find(
    (item): item is Extract<ChatItem, { type: 'message'; role: 'assistant' }> =>
      item.type === 'message' && item.role === 'assistant',
  );
  if (
    firstAssistant &&
    !isLeadingIntroShell(firstAssistant, threadId) &&
    first?.type === 'message' &&
    first.role !== 'user'
  ) {
    return items;
  }

  const shouldSeed =
    threadId === 'chat-1'
      ? shouldSeedWelcomeMessage(threadId, items)
      : shouldSeedChatIntroMessage(threadId, items);
  const firstIsUser = first?.type === 'message' && first.role === 'user';

  if (!shouldSeed && !firstIsUser && items.length > 0) {
    return items;
  }

  const shell =
    threadId === 'chat-1'
      ? buildWelcomeChatItem({})
      : buildChatIntroShellItem(threadId as ChatIntroId);

  return [shell as ChatItem, ...items];
}

export function appendOptimisticCoreAgentTurn(params: {
  list: ChatItem[];
  userMessage: string;
  hideUserMessage?: boolean;
  threadId?: string;
}): ChatItem[] {
  const base = params.threadId
    ? ensureLeadingIntroShell(params.threadId, params.list)
    : params.list;
  const next = params.hideUserMessage
    ? [...base]
    : [...base, { type: 'message' as const, role: 'user' as const, content: params.userMessage }];
  return [...next, createStreamingAssistantPlaceholder()];
}

export type { AgentStreamUiState };
