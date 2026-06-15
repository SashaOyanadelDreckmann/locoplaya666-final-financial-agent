import type { StoredSheet } from '../persistencia/types';
import type { ConversationTurnRecord } from '../persistencia/repos/conversation.repository';

const PRODUCT_CHAT_DEFS: Array<{ id: string; label: string; name: string }> = [
  { id: 'chat-1', label: '1', name: 'Diagnóstico financiero' },
  { id: 'chat-2', label: '2', name: 'Plan post-diagnóstico' },
  { id: 'chat-3', label: '3', name: 'Conciencia social post-diagnóstico' },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function countUserMessages(items: unknown[]): number {
  return items.filter(
    (item) =>
      isRecord(item) && item.type === 'message' && item.role === 'user' && String(item.content ?? '').trim(),
  ).length;
}

function extractLeadingShellItems(items: unknown[]): unknown[] {
  const shell: unknown[] = [];
  for (const item of items) {
    if (isRecord(item) && item.type === 'message' && item.role === 'user') break;
    shell.push(item);
  }
  return shell;
}

function buildItemsFromAgentPayload(payload: Record<string, unknown>): unknown[] {
  const items: unknown[] = [];
  const message = typeof payload.message === 'string' ? payload.message.trim() : '';
  const hasArtifacts = Array.isArray(payload.artifacts) && payload.artifacts.length > 0;
  const hasBlocks = Array.isArray(payload.agent_blocks) && payload.agent_blocks.length > 0;

  if (message) {
    items.push({
      type: 'message',
      role: 'assistant',
      content: message,
      mode: typeof payload.mode === 'string' ? payload.mode : payload.reasoning_mode,
      objective:
        isRecord(payload.react) && typeof payload.react.objective === 'string'
          ? payload.react.objective
          : undefined,
      agent_blocks: hasBlocks ? payload.agent_blocks : undefined,
      panel_action: payload.panel_action,
      suggested_replies: Array.isArray(payload.suggested_replies) ? payload.suggested_replies : undefined,
    });
  } else if (hasArtifacts || hasBlocks) {
    items.push({
      type: 'message',
      role: 'assistant',
      content:
        'Entregable generado y anexado al chat. Puedes abrir, descargar o guardar el resultado.',
      agent_blocks: hasBlocks ? payload.agent_blocks : undefined,
    });
  }

  if (Array.isArray(payload.artifacts)) {
    for (const artifact of payload.artifacts) {
      if (!isRecord(artifact) || !artifact.id || !artifact.type) continue;
      items.push({ type: 'artifact', role: 'assistant', artifact });
    }
  }

  if (Array.isArray(payload.citations)) {
    for (const citation of payload.citations) {
      if (!isRecord(citation)) continue;
      items.push({ type: 'citation', role: 'assistant', citation });
    }
  }

  return items;
}

function buildItemsFromTurn(turn: ConversationTurnRecord): unknown[] {
  const items: unknown[] = [];
  const userMessage = String(turn.userMessage ?? '').trim();
  if (userMessage) {
    items.push({ type: 'message', role: 'user', content: userMessage });
  }

  const payload = isRecord(turn.responsePayload) ? turn.responsePayload : null;
  if (payload) {
    items.push(...buildItemsFromAgentPayload(payload));
    return items;
  }

  const assistantMessage = String(turn.assistantMessage ?? '').trim();
  if (assistantMessage) {
    items.push({ type: 'message', role: 'assistant', content: assistantMessage });
  }

  return items;
}

function makeEmptySheet(def: { id: string; label: string; name: string }): StoredSheet {
  return {
    id: def.id,
    label: def.label,
    name: def.name,
    autoNamed: false,
    items: [],
    draft: '',
    status: 'active',
    userMessageCount: 0,
    createdAt: new Date().toISOString(),
  };
}

export function ensureProductChatSheets(sheets: StoredSheet[] | null | undefined): StoredSheet[] {
  const byId = new Map((sheets ?? []).map((sheet) => [sheet.id, sheet]));
  return PRODUCT_CHAT_DEFS.map((def) => {
    const existing = byId.get(def.id);
    if (existing) {
      return {
        ...existing,
        label: def.label,
        name: existing.name?.trim() && existing.name !== 'Nueva conversación' ? existing.name : def.name,
      };
    }
    return makeEmptySheet(def);
  });
}

export function repairSheetFromTurns(sheet: StoredSheet, turns: ConversationTurnRecord[]): StoredSheet {
  const chatTurns = turns
    .filter((turn) => turn.chatId === sheet.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  if (chatTurns.length === 0) return sheet;

  const sheetItems = Array.isArray(sheet.items) ? sheet.items : [];
  const sheetUserCount = countUserMessages(sheetItems);
  const turnUserCount = chatTurns.filter((turn) => String(turn.userMessage ?? '').trim()).length;

  if (turnUserCount <= sheetUserCount) return sheet;

  const shellItems = extractLeadingShellItems(sheetItems);
  const rebuiltMessages = chatTurns.flatMap((turn) => buildItemsFromTurn(turn));

  return {
    ...sheet,
    items: [...shellItems, ...rebuiltMessages],
    userMessageCount: Math.max(sheet.userMessageCount ?? 0, turnUserCount),
    draft: sheet.draft ?? '',
  };
}

export function repairUserSheetsFromTurns(
  sheets: StoredSheet[] | null | undefined,
  turns: ConversationTurnRecord[],
): { sheets: StoredSheet[]; repaired: boolean } {
  const normalized = ensureProductChatSheets(sheets);
  let repaired = false;

  const nextSheets = normalized.map((sheet) => {
    const repairedSheet = repairSheetFromTurns(sheet, turns);
    if (repairedSheet !== sheet) repaired = true;
    return repairedSheet;
  });

  return { sheets: nextSheets, repaired };
}
