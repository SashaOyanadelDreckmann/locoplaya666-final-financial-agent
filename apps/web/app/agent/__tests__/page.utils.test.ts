/** @jest-environment node */

import { getChat1UxCopy, resolveChat1UxState, resolveUnlockedChatIds } from '../page.utils';

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

  it('promotes to general only when the diagnosis is completed', () => {
    const state = resolveChat1UxState({
      chatId: 'chat-1',
      diagnosisCompleted: true,
      canOpenInterview: true,
    });

    expect(state).toBe('diagnosisCompleted');
    expect(getChat1UxCopy(state).title).toBe('Chat general');
    expect(getChat1UxCopy(state).subtitle).toBe('chat general');
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
    ).toEqual(['chat-1', 'chat-2']);
  });
});
