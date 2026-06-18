import { describe, expect, it } from 'vitest';

import { extractChatHistoryFromSheet } from './conversation-history.helpers';

describe('conversation-history.helpers', () => {
  it('extractChatHistoryFromSheet keeps user and assistant turns', () => {
    const history = extractChatHistoryFromSheet({
      id: 'chat-1',
      label: '1',
      name: 'Diagnóstico financiero',
      autoNamed: false,
      items: [
        { type: 'message', role: 'user', content: 'Quién es Boric?' },
        { type: 'message', role: 'assistant', content: 'Gabriel Boric es presidente de Chile.' },
      ],
      draft: '',
      status: 'active',
      userMessageCount: 1,
      createdAt: '2026-06-18T00:00:00.000Z',
    });

    expect(history).toEqual([
      { role: 'user', content: 'Quién es Boric?' },
      { role: 'assistant', content: 'Gabriel Boric es presidente de Chile.' },
    ]);
  });

  it('extractChatHistoryFromSheet drops empty assistant shells', () => {
    const history = extractChatHistoryFromSheet({
      id: 'chat-1',
      label: '1',
      name: 'Diagnóstico financiero',
      autoNamed: false,
      items: [
        { type: 'message', role: 'assistant', content: '' },
        { type: 'message', role: 'user', content: 'Hola' },
      ],
      draft: '',
      status: 'active',
      userMessageCount: 1,
      createdAt: '2026-06-18T00:00:00.000Z',
    });

    expect(history).toEqual([{ role: 'user', content: 'Hola' }]);
  });
});
