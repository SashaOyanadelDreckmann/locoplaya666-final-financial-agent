import { describe, expect, it } from 'vitest';

import { buildChatClosureSummary } from '../../chat/chat-closure-summary';
import { buildClosureCarouselPages } from '../../chat/chat-closure-carousel';

describe('buildClosureCarouselPages', () => {
  it('maps closure summary into a single page with footer', () => {
    const summary = buildChatClosureSummary({
      chatId: 'chat-2',
      messages: [
        { role: 'user', content: 'Prioriza liquidez y plazo de 12 meses' },
        { role: 'assistant', content: 'Plan con tres frentes y validación semanal' },
      ],
      turnsRemaining: 0,
    });

    const pages = buildClosureCarouselPages(summary);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({ roman: 'I', tone: 'gold', label: 'Resumen' });
    expect(pages[0].footer).toContain('no admite nuevas interacciones');
    expect(pages[0].body).toContain('Prioriza liquidez');
    expect(pages[0].body).toContain('Plan con tres frentes');
  });
});

describe('buildChatClosureSummary', () => {
  it('builds a long single-page body from conversation messages', () => {
    const summary = buildChatClosureSummary({
      chatId: 'chat-1',
      messages: [
        { role: 'user', content: 'Como voy con el presupuesto?' },
        { role: 'assistant', content: 'Tu balance mensual queda positivo en 120 mil.' },
        { role: 'user', content: 'Que deberia priorizar?' },
        { role: 'assistant', content: 'Primero colchon de emergencia y luego APV voluntario.' },
      ],
      turnsRemaining: 0,
    });

    expect(summary.body).toContain('Recorrido');
    expect(summary.body).toContain('Sintesis de cierre');
    expect(summary.body).toContain('Primero colchon de emergencia');
    expect(summary.body).not.toContain('retoma');
    expect(summary.nextStep).toMatch(/^Fuera de la app,/);
    expect(summary.footer).toContain('no admite nuevas interacciones');
    expect(summary.body.length).toBeGreaterThan(200);
  });
});
