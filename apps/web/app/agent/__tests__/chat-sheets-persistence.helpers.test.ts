import {
  serializeChatThreadsForSave,
  sanitizeChatThreadItems,
} from '../utilidades/chat-sheets-persistence.helpers';
import type { ChatItem } from '@/lib/agente/agent.response.types';

describe('chat-sheets-persistence.helpers', () => {
  it('serializes closure summary and general chat flag', () => {
    const payload = serializeChatThreadsForSave([
      {
        id: 'chat-1',
        label: '1',
        name: 'Diagnóstico financiero',
        autoNamed: false,
        items: [{ type: 'message', role: 'user', content: 'Hola' }],
        draft: 'borrador',
        status: 'context',
        userMessageCount: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        completedAt: '2026-01-02T00:00:00.000Z',
        closureSummary: { title: 'Cierre', kicker: 'Fin', subtitle: 'Listo', sections: [] },
        generalChatStarted: true,
      },
    ]);

    expect(payload[0]).toMatchObject({
      closureSummary: { title: 'Cierre' },
      generalChatStarted: true,
      draft: 'borrador',
    });
  });

  it('drops stale session error bubbles before save', () => {
    const items: ChatItem[] = [
      { type: 'message', role: 'assistant', content: 'Tu sesión expiró. Inicia sesión nuevamente para continuar.' },
      { type: 'message', role: 'user', content: 'Hola' },
    ];

    expect(sanitizeChatThreadItems(items)).toEqual([
      { type: 'message', role: 'user', content: 'Hola' },
    ]);
  });
});
