import { describe, expect, it } from 'vitest';

import {
  CORE_AGENT_HISTORY_MESSAGE_LIMIT,
  compactBudgetChatAnswers,
  compactCoreAgentHistory,
} from '../chat-history';

describe('chat-history', () => {
  it('keeps the latest core agent messages within the shared limit', () => {
    const history = Array.from({ length: 30 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `message-${index}`,
    }));

    const compact = compactCoreAgentHistory(history);
    expect(compact).toHaveLength(CORE_AGENT_HISTORY_MESSAGE_LIMIT);
    expect(compact[0]?.content).toBe(`message-${30 - CORE_AGENT_HISTORY_MESSAGE_LIMIT}`);
    expect(compact.at(-1)?.content).toBe('message-29');
  });

  it('trims budget wizard answers consistently', () => {
    const answers = Array.from({ length: 20 }, (_, index) => ({
      q: `q-${index}`,
      a: `a-${index}`,
    }));

    const compact = compactBudgetChatAnswers(answers, { maxTurns: 12 });
    expect(compact).toHaveLength(12);
    expect(compact[0]?.q).toBe('q-8');
  });
});
