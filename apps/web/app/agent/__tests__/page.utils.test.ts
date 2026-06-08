/** @jest-environment node */

import { getChat1UxCopy, resolveChat1UxState } from '../page.utils';

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
