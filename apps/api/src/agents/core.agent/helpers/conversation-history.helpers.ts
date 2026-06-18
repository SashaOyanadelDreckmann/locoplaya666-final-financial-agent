import {
  compactCoreAgentHistory,
  resolveCoreAgentHistoryLimits,
} from '@financial-agent/shared';

import { listConversationTurnsSafe } from '../../../persistencia/repos/conversation.repository';
import type { StoredSheet } from '../../../persistencia/types';
import { loadUserSheets } from '../../../services/user.service';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function extractChatHistoryFromSheet(
  sheet: StoredSheet | null | undefined,
): Array<{ role: string; content: string }> {
  if (!sheet || !Array.isArray(sheet.items)) return [];

  return sheet.items
    .filter((item): item is Record<string, unknown> => isRecord(item) && item.type === 'message')
    .map((item) => ({
      role: item.role === 'assistant' ? 'assistant' : 'user',
      content: String(item.content ?? '').trim(),
    }))
    .filter((entry) => entry.content.length > 0);
}

export async function resolveAgentConversationHistory(params: {
  userId: string;
  chatId: string;
  sessionId?: string;
  clientHistory?: unknown;
}): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  const limits = resolveCoreAgentHistoryLimits(params.chatId);
  const compactOpts = {
    maxMessages: limits.maxMessages,
    maxCharsPerMessage: limits.maxCharsPerMessage,
  };

  const fromClient = compactCoreAgentHistory(
    Array.isArray(params.clientHistory) ? (params.clientHistory as Array<{ role: string; content: string }>) : [],
    compactOpts,
  );

  let fromStorage: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  const turns = await listConversationTurnsSafe({
    userId: params.userId,
    sessionId: params.sessionId,
    chatId: params.chatId,
    limit: limits.turnLimit,
  });

  if (turns.length > 0) {
    fromStorage = compactCoreAgentHistory(
      turns.flatMap((turn) => [
        { role: 'user', content: turn.userMessage },
        { role: 'assistant', content: turn.assistantMessage },
      ]),
      compactOpts,
    );
  } else {
    const sheets = await loadUserSheets(params.userId);
    const sheet = sheets?.find((entry) => entry.id === params.chatId);
    fromStorage = compactCoreAgentHistory(extractChatHistoryFromSheet(sheet), compactOpts);
  }

  return fromStorage.length > fromClient.length ? fromStorage : fromClient;
}
