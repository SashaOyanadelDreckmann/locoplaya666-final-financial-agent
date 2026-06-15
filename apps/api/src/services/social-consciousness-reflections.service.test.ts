import { describe, expect, it } from 'vitest';
import {
  getSocialReflectionsFromMemory,
  mergeSocialReflectionsInMemory,
  pickSocialReflectionSession,
  sanitizeSocialReflectionSession,
} from './social-consciousness-reflections.service';

describe('social-consciousness-reflections.service', () => {
  it('sanitizes and stores reflections in memory blob', () => {
    const session = sanitizeSocialReflectionSession({
      answers: [
        {
          questionId: 'q-freedom',
          question: '¿En qué punto el ahorro deja de ser prudencia?',
          choiceId: 'anxiety',
          choiceLabel: 'Cuando el número importa más que vivir',
        },
      ],
      completedAt: '2026-06-15T12:00:00.000Z',
    });
    expect(session).not.toBeNull();
    const merged = mergeSocialReflectionsInMemory({}, session!);
    expect(getSocialReflectionsFromMemory(merged)?.answers).toHaveLength(1);
  });

  it('picks the newest reflection session', () => {
    const older = sanitizeSocialReflectionSession({
      answers: [{ questionId: 'a', question: 'Q1', choiceId: '1', choiceLabel: 'A' }],
      completedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const newer = sanitizeSocialReflectionSession({
      answers: [{ questionId: 'b', question: 'Q2', choiceId: '2', choiceLabel: 'B' }],
      completedAt: '2026-06-15T12:00:00.000Z',
      updatedAt: '2026-06-15T12:00:00.000Z',
    });
    expect(pickSocialReflectionSession(older, newer)?.answers[0]?.questionId).toBe('b');
  });
});
