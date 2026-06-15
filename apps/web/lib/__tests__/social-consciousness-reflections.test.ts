/** @jest-environment node */

import {
  buildSocialReflectionContextBlock,
  writeSocialReflectionSession,
  readSocialReflectionSession,
  clearSocialReflectionSession,
} from '@/lib/agente/nucleo/social-consciousness-reflections';

describe('social consciousness reflections storage', () => {
  const userId = 'user-chat-3-test';
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string, value: string) => {
          store[key] = value;
        },
        removeItem: (key: string) => {
          delete store[key];
        },
      },
    });
    clearSocialReflectionSession(userId);
  });

  it('persists and reads reflection answers', () => {
    writeSocialReflectionSession(userId, {
      completedAt: '2026-06-15T12:00:00.000Z',
      answers: [
        {
          questionId: 'q-freedom',
          question: '¿En qué punto el ahorro deja de ser prudencia?',
          choiceId: 'anxiety',
          choiceLabel: 'Cuando el número importa más que vivir',
          choiceSubtext: 'El dinero se vuelve fin en sí mismo',
        },
      ],
    });

    const session = readSocialReflectionSession(userId);
    expect(session?.answers).toHaveLength(1);
    expect(buildSocialReflectionContextBlock(session)).toContain('modal de conciencia social');
  });
});
