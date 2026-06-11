/** @jest-environment node */

import {
  isRecoverableChatErrorMessage,
  repairChat1WelcomeItems,
  shouldSeedWelcomeMessage,
} from '../welcome-intro.shared';
import type { ChatItem } from '@/lib/agent.response.types';

const errorItem = (content: string): ChatItem => ({
  type: 'message',
  role: 'assistant',
  content,
  mode: 'information',
});

describe('welcome intro recovery', () => {
  it('detects recoverable chat errors', () => {
    expect(
      isRecoverableChatErrorMessage(
        'No pude procesar tu mensaje ahora. Inténtalo nuevamente en unos segundos.',
      ),
    ).toBe(true);
    expect(isRecoverableChatErrorMessage('Tu plan de acción está listo.')).toBe(false);
  });

  it('seeds welcome when chat-1 only has a recoverable error', () => {
    expect(
      shouldSeedWelcomeMessage('chat-1', [
        errorItem('No pude procesar tu mensaje ahora. Inténtalo nuevamente en unos segundos.'),
      ]),
    ).toBe(true);
  });

  it('repairs chat-1 by removing recoverable errors and prepending welcome shell', () => {
    const repaired = repairChat1WelcomeItems([
      errorItem('No pude procesar tu mensaje ahora. Inténtalo nuevamente en unos segundos.'),
    ]);

    expect(repaired).toHaveLength(1);
    expect(repaired[0].type).toBe('message');
    if (repaired[0].type === 'message') {
      expect(repaired[0].role).toBe('assistant');
      expect(String(repaired[0].content ?? '')).toBe('');
    }
  });
});
