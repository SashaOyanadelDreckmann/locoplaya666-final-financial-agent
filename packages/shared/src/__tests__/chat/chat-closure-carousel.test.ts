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
    expect(pages[0].footer).toContain('Chat cerrado');
    expect(pages[0].body).toContain('Prioriza liquidez');
  });
});

describe('buildChatClosureSummary', () => {
  it('builds a premium narrative summary without chat transcript formatting', () => {
    const summary = buildChatClosureSummary({
      chatId: 'chat-1',
      messages: [
        { role: 'user', content: 'Como voy con el presupuesto?' },
        { role: 'assistant', content: 'Tu balance mensual queda positivo en 120 mil. Conviene reforzar el colchon.' },
        { role: 'user', content: 'Que deberia priorizar?' },
        { role: 'assistant', content: 'Primero colchon de emergencia y luego APV voluntario.' },
      ],
      turnsRemaining: 0,
    });

    expect(summary.body).toContain('Este cierre resume');
    expect(summary.body).not.toContain('**Consulta:**');
    expect(summary.body).not.toContain('**Respuesta:**');
    expect(summary.body).not.toContain('Recorrido');
    expect(summary.body).not.toContain('retoma');
    expect(summary.nextStep).toMatch(/^Fuera de la app,/);
    expect(summary.thankYou).toContain('Gracias');
    expect(summary.footer).toContain('Chat cerrado');
  });
});
