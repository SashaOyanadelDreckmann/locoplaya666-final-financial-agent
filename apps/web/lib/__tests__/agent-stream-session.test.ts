/** @jest-environment node */

import {
  appendOptimisticCoreAgentTurn,
  ensureLeadingIntroShell,
  patchStreamingAssistantMessage,
  readStreamingAssistantContent,
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

  it('prepends chat-1 welcome shell before the first user turn', () => {
    const next = appendOptimisticCoreAgentTurn({
      list: [],
      userMessage: 'hola',
      threadId: 'chat-1',
    });
    expect(next).toHaveLength(3);
    expect(next[0]).toMatchObject({ type: 'message', role: 'assistant', content: '' });
    expect(next[1]).toMatchObject({ type: 'message', role: 'user', content: 'hola' });
    expect(next[2]).toMatchObject({
      type: 'message',
      role: 'assistant',
      stream: { streaming: true },
    });
  });

  it('repairs threads where the user message was appended before the welcome shell', () => {
    const repaired = ensureLeadingIntroShell('chat-1', [
      { type: 'message', role: 'user', content: 'hola' },
      {
        type: 'message',
        role: 'assistant',
        content: '',
        mode: 'information',
        stream: { tools: [], streaming: true, startedAt: 1, phase: 'format' },
      },
    ]);
    expect(repaired).toHaveLength(3);
    expect(repaired[0]).toMatchObject({ type: 'message', role: 'assistant', content: '' });
    expect(repaired[1]).toMatchObject({ type: 'message', role: 'user', content: 'hola' });
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

  it('reads streamed assistant content from the active stream session bubble', () => {
    const list: ChatItem[] = [
      { type: 'message', role: 'user', content: 'q' },
      {
        type: 'message',
        role: 'assistant',
        content: 'parcial visible',
        stream: { tools: [], streaming: true, startedAt: 1 },
      },
    ];
    expect(readStreamingAssistantContent(list)).toBe('parcial visible');
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

  it('removes stream session bubble after run.complete clears streaming flag', () => {
    const list: ChatItem[] = [
      { type: 'message', role: 'user', content: 'q' },
      {
        type: 'message',
        role: 'assistant',
        content: '<PANEL>{"section":"profile"}</PANEL>',
        stream: { tools: [], streaming: false, startedAt: 1, phaseStatus: 'done' },
      },
    ];
    expect(removeStreamingAssistantMessage(list)).toEqual([
      { type: 'message', role: 'user', content: 'q' },
    ]);
  });
});
