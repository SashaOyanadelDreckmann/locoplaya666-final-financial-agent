import { describe, expect, it } from 'vitest';

import {
  ensureProductChatSheets,
  repairSheetFromTurns,
  repairUserSheetsFromTurns,
} from './sheet-restore.service';
import type { StoredSheet } from '../persistencia/types';
import type { ConversationTurnRecord } from '../persistencia/repos/conversation.repository';

function baseSheet(overrides: Partial<StoredSheet> = {}): StoredSheet {
  return {
    id: 'chat-1',
    label: '1',
    name: 'Diagnóstico financiero',
    autoNamed: false,
    items: [],
    draft: '',
    status: 'active',
    userMessageCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function turn(overrides: Partial<ConversationTurnRecord>): ConversationTurnRecord {
  return {
    id: 'turn_1',
    userId: 'user_1',
    sessionId: 'sess_1',
    chatId: 'chat-1',
    clientMessageId: 'msg_1',
    userMessage: 'Hola',
    assistantMessage: 'Respuesta',
    createdAt: '2026-01-01T00:00:01.000Z',
    updatedAt: '2026-01-01T00:00:01.000Z',
    ...overrides,
  };
}

describe('sheet-restore.service', () => {
  it('ensures the three product chat sheets exist', () => {
    const sheets = ensureProductChatSheets([]);
    expect(sheets).toHaveLength(3);
    expect(sheets.map((sheet) => sheet.id)).toEqual(['chat-1', 'chat-2', 'chat-3']);
  });

  it('rebuilds messages from conversation turns when sheets lag behind', () => {
    const sheet = baseSheet({
      items: [{ type: 'message', role: 'assistant', content: 'Bienvenida' }],
      userMessageCount: 0,
    });
    const turns = [
      turn({
        clientMessageId: 'a',
        userMessage: 'Primera pregunta',
        assistantMessage: 'Primera respuesta',
        createdAt: '2026-01-01T00:00:02.000Z',
      }),
      turn({
        clientMessageId: 'b',
        userMessage: 'Segunda pregunta',
        assistantMessage: 'Segunda respuesta',
        createdAt: '2026-01-01T00:00:03.000Z',
      }),
    ];

    const repaired = repairSheetFromTurns(sheet, turns);
    expect(repaired.items).toHaveLength(5);
    expect(countUserMessages(repaired.items)).toBe(2);
    expect(repaired.userMessageCount).toBe(2);
  });

  it('does not downgrade a sheet that already has all user messages', () => {
    const sheet = baseSheet({
      items: [
        { type: 'message', role: 'user', content: 'Ya guardado' },
        { type: 'message', role: 'assistant', content: 'Ok' },
      ],
      userMessageCount: 1,
    });
    const repaired = repairSheetFromTurns(sheet, [
      turn({ userMessage: 'Ya guardado', assistantMessage: 'Ok' }),
    ]);
    expect(repaired).toBe(sheet);
  });

  it('restores artifacts from response payload when rebuilding', () => {
    const sheet = baseSheet();
    const repaired = repairSheetFromTurns(sheet, [
      turn({
        userMessage: 'Genera informe',
        assistantMessage: '',
        responsePayload: {
          message: 'Listo',
          artifacts: [
            {
              id: 'art_1',
              type: 'pdf',
              title: 'Informe',
              fileUrl: '/api/pdfs/serve?file=x.pdf',
              createdAt: '2026-01-01T00:00:00.000Z',
            },
          ],
        },
      }),
    ]);

    expect(repaired.items.some((item) => isRecord(item) && item.type === 'artifact')).toBe(true);
  });

  it('marks repair when any sheet was upgraded', () => {
    const { sheets, repaired } = repairUserSheetsFromTurns([baseSheet()], [
      turn({ userMessage: 'Hola', assistantMessage: 'Hola de vuelta' }),
    ]);
    expect(repaired).toBe(true);
    expect(sheets[0].userMessageCount).toBe(1);
  });
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function countUserMessages(items: unknown[]): number {
  return items.filter(
    (item) =>
      isRecord(item) && item.type === 'message' && item.role === 'user' && String(item.content ?? '').trim(),
  ).length;
}
