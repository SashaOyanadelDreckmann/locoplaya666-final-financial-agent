/** @jest-environment node */

import {
  appendOptimisticCoreAgentTurn,
  patchStreamingAssistantMessage,
  removeStreamingAssistantMessage,
} from '@/lib/agente/nucleo/stream-session';
import type { ChatItem } from '@/lib/agente/agent.response.types';

describe('stream-session helpers', () => {
  it('appends user bubble and streaming assistant placeholder', () => {
    const next = appendOptimisticCoreAgentTurn({
      list: [],
      userMessage: 'Hola',
    });
    expect(next).toHaveLength(2);
    expect(next[0]).toMatchObject({ type: 'message', role: 'user', content: 'Hola' });
    expect(next[1]).toMatchObject({
      type: 'message',
      role: 'assistant',
      stream: { streaming: true },
    });
  });

  it('patches only the active streaming assistant bubble', () => {
    const list: ChatItem[] = [
      { type: 'message', role: 'assistant', content: 'prev', mode: 'information' },
      {
        type: 'message',
        role: 'assistant',
        content: '',
        mode: 'information',
        stream: { tools: [], streaming: true, startedAt: 1, phase: 'format' },
      },
    ];
    const patched = patchStreamingAssistantMessage(list, { content: 'parcial' });
    expect((patched[1] as Extract<ChatItem, { type: 'message'; role: 'assistant' }>).content).toBe(
      'parcial',
    );
    expect((patched[0] as Extract<ChatItem, { type: 'message'; role: 'assistant' }>).content).toBe(
      'prev',
    );
  });

  it('removes the streaming assistant placeholder', () => {
    const list: ChatItem[] = [
      { type: 'message', role: 'user', content: 'q' },
      {
        type: 'message',
        role: 'assistant',
        content: '',
        stream: { tools: [], streaming: true, startedAt: 1 },
      },
    ];
    expect(removeStreamingAssistantMessage(list)).toEqual([
      { type: 'message', role: 'user', content: 'q' },
    ]);
  });
});
