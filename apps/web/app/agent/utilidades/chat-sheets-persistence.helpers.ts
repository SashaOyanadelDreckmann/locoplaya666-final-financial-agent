import type { ChatItem } from '@/lib/agente/agent.response.types';
import { sanitizeChatThreadMessages } from '../utilidades/page.utils';

export type PersistableChatThread = {
  id: string;
  label: string;
  name: string;
  autoNamed: boolean;
  items: ChatItem[];
  draft: string;
  status: 'active' | 'context';
  userMessageCount: number;
  createdAt: string;
  completedAt?: string;
  closureSummary?: Record<string, unknown> | null;
  generalChatStarted?: boolean;
};

function containsStaleSessionError(item: ChatItem): boolean {
  try {
    const normalized = JSON.stringify(item).toLowerCase();
    return (
      normalized.includes('tu sesión expiró') ||
      normalized.includes('inicia sesión nuevamente para continuar')
    );
  } catch {
    return false;
  }
}

export function sanitizeChatThreadItems(items: ChatItem[]): ChatItem[] {
  return sanitizeChatThreadMessages(items)
    .map((item) => {
      if (item.type !== 'message' || item.role !== 'assistant' || !item.stream) return item;
      const { stream: _stream, ...rest } = item;
      return rest as ChatItem;
    })
    .filter((item) => !containsStaleSessionError(item));
}

export function serializeChatThreadsForSave(threads: PersistableChatThread[]): Record<string, unknown>[] {
  return threads.map((thread) => ({
    id: thread.id,
    label: thread.label,
    name: thread.name,
    autoNamed: thread.autoNamed,
    items: sanitizeChatThreadItems(thread.items),
    draft: thread.draft,
    status: thread.status,
    userMessageCount: thread.userMessageCount,
    createdAt: thread.createdAt,
    completedAt: thread.completedAt,
    closureSummary: thread.closureSummary ?? null,
    generalChatStarted: Boolean(thread.generalChatStarted),
  }));
}

export const SHEETS_SAVE_DEBOUNCE_MS = 700;
export const PANEL_SAVE_DEBOUNCE_MS = 600;
