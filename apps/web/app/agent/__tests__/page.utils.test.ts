/** @jest-environment node */

import {
  dedupeConsecutiveAssistantMessages,
  dedupeConsecutiveUserMessages,
  dedupeDuplicateAssistantMessages,
  getChat1UxCopy,
  resolveChat1UxState,
  resolveUnlockedChatIds,
  sanitizeChatThreadMessages,
} from '../utilidades/page.utils';
import type { ChatItem } from '@/lib/agente/agent.response.types';

const assistant = (content: string): ChatItem => ({
  type: 'message',
  role: 'assistant',
  content,
  mode: 'information',
});

const user = (content: string): ChatItem => ({
  type: 'message',
  role: 'user',
  content,
});

describe('chat message dedupe', () => {
  it('removes consecutive duplicate assistant messages', () => {
    const items = [assistant('Hola'), assistant('Hola'), user('ok'), assistant('Siguiente')];
    expect(dedupeConsecutiveAssistantMessages(items)).toHaveLength(3);
  });

  it('removes consecutive duplicate user messages', () => {
    const items = [user('Hola'), user('Hola'), assistant('ok')];
    expect(dedupeConsecutiveUserMessages(items)).toHaveLength(2);
  });

  it('removes non-consecutive duplicate assistant messages', () => {
    const items = [assistant('Bienvenida'), user('hola'), assistant('Bienvenida')];
    expect(dedupeDuplicateAssistantMessages(items)).toHaveLength(2);
  });

  it('sanitizes thread messages with both dedupe passes', () => {
    const items = [
      assistant('**Bienvenida**'),
      assistant('Bienvenida'),
      user('hola'),
      assistant('Bienvenida'),
    ];
    expect(sanitizeChatThreadMessages(items)).toHaveLength(2);
  });
});

describe('chat 1 UX state', () => {
  it('keeps base reading until interview is actually available', () => {
    const state = resolveChat1UxState({
      chatId: 'chat-1',
      diagnosisCompleted: false,
      canOpenInterview: false,
    });

    expect(state).toBe('baseReading');
    expect(getChat1UxCopy(state).threadTitle).toBe('Lectura base en curso');
  });

  it('exposes interview available without marking the chat as completed', () => {
    const state = resolveChat1UxState({
      chatId: 'chat-1',
      diagnosisCompleted: false,
      canOpenInterview: true,
    });

    expect(state).toBe('interviewAvailable');
    expect(getChat1UxCopy(state).subtitle).toBe('Entrevista disponible');
    expect(getChat1UxCopy(state).title).toBe('Diagnóstico');
    expect(getChat1UxCopy(state).threadTitle).toBe('Entrevista estratégica');
    expect(getChat1UxCopy(state).threadKicker).toBe('Entrevista');
  });

  it('promotes to general only after deepen in chat', () => {
    const completedOnly = resolveChat1UxState({
      chatId: 'chat-1',
      diagnosisCompleted: true,
      generalChatStarted: false,
      canOpenInterview: true,
    });

    expect(completedOnly).toBe('interviewAvailable');
    expect(getChat1UxCopy(completedOnly).title).toBe('Diagnóstico');

    const general = resolveChat1UxState({
      chatId: 'chat-1',
      diagnosisCompleted: true,
      generalChatStarted: true,
      canOpenInterview: true,
    });

    expect(general).toBe('diagnosisCompleted');
    expect(getChat1UxCopy(general).title).toBe('Chat general');
    expect(getChat1UxCopy(general).subtitle).toBe('chat general');
  });
});

describe('unlocked chat ids', () => {
  it('keeps only chat 1 before diagnosis completes', () => {
    expect(
      resolveUnlockedChatIds({
        interviewCompleted: false,
        unlockedChats: ['chat-1'],
      }),
    ).toEqual(['chat-1']);
  });

  it('unlocks chats 2 and 3 after diagnosis completes', () => {
    expect(
      resolveUnlockedChatIds({
        interviewCompleted: true,
        unlockedChats: ['chat-1'],
      }),
    ).toEqual(['chat-1', 'chat-2', 'chat-3']);
  });

  it('preserves chat 1 when upstream payload omits it', () => {
    expect(
      resolveUnlockedChatIds({
        interviewCompleted: false,
        unlockedChats: ['chat-2'],
      }),
    ).toEqual(['chat-1']);
  });

  it('ignores premature chat 2/3 unlocks before diagnosis completes', () => {
    expect(
      resolveUnlockedChatIds({
        interviewCompleted: false,
        unlockedChats: ['chat-1', 'chat-2', 'chat-3'],
      }),
    ).toEqual(['chat-1']);
  });
});
