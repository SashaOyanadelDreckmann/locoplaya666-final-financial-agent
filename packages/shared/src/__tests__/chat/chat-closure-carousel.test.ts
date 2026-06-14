import { describe, expect, it } from 'vitest';

import { buildChatClosureSummary } from '../../chat/chat-closure-summary';
import { buildClosureCarouselPages } from '../../chat/chat-closure-carousel';

describe('buildClosureCarouselPages', () => {
  it('maps closure sections into four carousel pages with footer on last slide', () => {
    const summary = buildChatClosureSummary({
      chatId: 'chat-2',
      userMessage: 'Prioriza liquidez y plazo de 12 meses',
      assistantMessage: 'Plan con tres frentes y validación semanal',
      turnsRemaining: 0,
    });

    const pages = buildClosureCarouselPages(summary);
    expect(pages).toHaveLength(4);
    expect(pages[0]).toMatchObject({ roman: 'I', tone: 'gold' });
    expect(pages[3].footer).toBe(summary.footer);
    expect(pages[0].body).toContain('Prioriza liquidez');
  });
});
