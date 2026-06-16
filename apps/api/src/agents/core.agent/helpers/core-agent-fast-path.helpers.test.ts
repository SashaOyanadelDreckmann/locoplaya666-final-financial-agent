import { describe, expect, it } from 'vitest';

import {
  buildCoreAgentTrivialResponse,
  isCoreAgentTrivialTurn,
} from './core-agent-fast-path.helpers';

describe('core-agent-fast-path.helpers', () => {
  it('detects trivial greetings and acknowledgements', () => {
    expect(isCoreAgentTrivialTurn('hola')).toBe(true);
    expect(isCoreAgentTrivialTurn('  Gracias! ')).toBe(true);
    expect(isCoreAgentTrivialTurn('¿Cuánto debería ahorrar al mes?')).toBe(false);
  });

  it('builds a deterministic response without tool calls', () => {
    const response = buildCoreAgentTrivialResponse({
      user_message: 'hola',
      user_id: 'user-1',
      history: [],
      ui_state: { active_chat: { id: 'chat-1' } },
    } as any);

    expect(response.mode).toBe('information');
    expect(response.tool_calls).toEqual([]);
    expect(response.message.toLowerCase()).toContain('hola');
    expect(response.suggested_replies?.length).toBeGreaterThan(0);
  });
});
