export const CORE_AGENT_HISTORY_TURN_LIMIT = 12;
export const CORE_AGENT_HISTORY_MESSAGE_LIMIT = CORE_AGENT_HISTORY_TURN_LIMIT * 2;
export const CORE_AGENT_HISTORY_MESSAGE_CHAR_LIMIT = 360;

/** Chat 2 allows the full product turn budget with richer message retention. */
export const CHAT_2_AGENT_HISTORY_TURN_LIMIT = 20;
export const CHAT_2_AGENT_HISTORY_MESSAGE_LIMIT = CHAT_2_AGENT_HISTORY_TURN_LIMIT * 2;
export const CHAT_2_AGENT_HISTORY_MESSAGE_CHAR_LIMIT = 1600;

export const CHAT_3_AGENT_HISTORY_TURN_LIMIT = 10;
export const CHAT_3_AGENT_HISTORY_MESSAGE_LIMIT = CHAT_3_AGENT_HISTORY_TURN_LIMIT * 2;
export const CHAT_3_AGENT_HISTORY_MESSAGE_CHAR_LIMIT = 900;

export type CoreAgentHistoryLimits = {
  turnLimit: number;
  maxMessages: number;
  maxCharsPerMessage: number;
};

export function resolveCoreAgentHistoryLimits(activeChatId?: unknown): CoreAgentHistoryLimits {
  const chatId = String(activeChatId ?? 'chat-1');
  if (chatId === 'chat-2') {
    return {
      turnLimit: CHAT_2_AGENT_HISTORY_TURN_LIMIT,
      maxMessages: CHAT_2_AGENT_HISTORY_MESSAGE_LIMIT,
      maxCharsPerMessage: CHAT_2_AGENT_HISTORY_MESSAGE_CHAR_LIMIT,
    };
  }
  if (chatId === 'chat-3') {
    return {
      turnLimit: CHAT_3_AGENT_HISTORY_TURN_LIMIT,
      maxMessages: CHAT_3_AGENT_HISTORY_MESSAGE_LIMIT,
      maxCharsPerMessage: CHAT_3_AGENT_HISTORY_MESSAGE_CHAR_LIMIT,
    };
  }
  return {
    turnLimit: CORE_AGENT_HISTORY_TURN_LIMIT,
    maxMessages: CORE_AGENT_HISTORY_MESSAGE_LIMIT,
    maxCharsPerMessage: CORE_AGENT_HISTORY_MESSAGE_CHAR_LIMIT,
  };
}

export const BUDGET_CHAT_QA_TURN_LIMIT = 12;
export const BUDGET_CHAT_QA_CHAR_LIMIT = 320;

export const TRANSACTIONS_CHAT_HISTORY_MESSAGE_LIMIT = 12;
export const TRANSACTIONS_CHAT_HISTORY_CHAR_LIMIT = 600;

export type AgentHistoryMessage = {
  role: string;
  content: string;
};

export function compactCoreAgentHistory(
  history: AgentHistoryMessage[] | undefined,
  options?: {
    maxMessages?: number;
    maxCharsPerMessage?: number;
  },
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const maxMessages = options?.maxMessages ?? CORE_AGENT_HISTORY_MESSAGE_LIMIT;
  const maxChars = options?.maxCharsPerMessage ?? CORE_AGENT_HISTORY_MESSAGE_CHAR_LIMIT;

  if (!Array.isArray(history)) return [];

  return history
    .filter(
      (entry) =>
        entry &&
        typeof entry === 'object' &&
        typeof entry.role === 'string' &&
        typeof entry.content === 'string' &&
        entry.content.trim().length > 0,
    )
    .slice(-maxMessages)
    .map((entry) => ({
      role: (entry.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
      content: entry.content.trim().slice(0, maxChars),
    }));
}

export function compactBudgetChatAnswers(
  answers: Array<{ q: string; a: string }> | undefined,
  options?: { maxTurns?: number; maxChars?: number },
): Array<{ q: string; a: string }> {
  const maxTurns = options?.maxTurns ?? BUDGET_CHAT_QA_TURN_LIMIT;
  const maxChars = options?.maxChars ?? BUDGET_CHAT_QA_CHAR_LIMIT;

  if (!Array.isArray(answers)) return [];

  return answers.slice(-maxTurns).map((entry) => ({
    q: String(entry.q ?? '').trim().slice(0, maxChars),
    a: String(entry.a ?? '').trim().slice(0, maxChars),
  }));
}
