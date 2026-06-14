import crypto from 'crypto';
import { getPersistenceMode, getPrismaClient, memoryStore } from '../provider';

export type ConversationTurnRecord = {
  id: string;
  userId: string;
  sessionId?: string | null;
  chatId: string;
  clientMessageId: string;
  userMessage: string;
  assistantMessage: string;
  history?: unknown;
  inputPayload?: unknown;
  responsePayload?: unknown;
  createdAt: string;
  updatedAt: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function toRecord(row: Record<string, unknown>): ConversationTurnRecord {
  return {
    id: String(row.id),
    userId: String(row.userId),
    sessionId: (row.sessionId ?? null) as string | null,
    chatId: String(row.chatId),
    clientMessageId: String(row.clientMessageId),
    userMessage: String(row.userMessage),
    assistantMessage: String(row.assistantMessage),
    history: row.history ?? undefined,
    inputPayload: row.inputPayload ?? undefined,
    responsePayload: row.responsePayload ?? undefined,
    createdAt: row.createdAt ? new Date(row.createdAt as string | Date).toISOString() : nowIso(),
    updatedAt: row.updatedAt ? new Date(row.updatedAt as string | Date).toISOString() : nowIso(),
  };
}

export async function upsertConversationTurnRecord(input: {
  userId: string;
  sessionId?: string | null;
  chatId: string;
  clientMessageId: string;
  userMessage: string;
  assistantMessage: string;
  history?: unknown;
  inputPayload?: unknown;
  responsePayload?: unknown;
}): Promise<ConversationTurnRecord> {
  const mode = getPersistenceMode();
  const candidate: ConversationTurnRecord = {
    id: `turn_${crypto.randomUUID()}`,
    userId: input.userId,
    sessionId: input.sessionId ?? null,
    chatId: input.chatId,
    clientMessageId: input.clientMessageId,
    userMessage: input.userMessage,
    assistantMessage: input.assistantMessage,
    history: input.history,
    inputPayload: input.inputPayload,
    responsePayload: input.responsePayload,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  if (mode === 'memory') {
    const key = `${input.userId}::${input.chatId}::${input.clientMessageId}`;
    const record: ConversationTurnRecord = candidate;
    memoryStore.conversationTurns.set(key, record);
    return record;
  }

  const prisma = await getPrismaClient();
  const row = await prisma.conversationTurn.upsert({
    where: {
      userId_chatId_clientMessageId: {
        userId: input.userId,
        chatId: input.chatId,
        clientMessageId: input.clientMessageId,
      },
    },
    create: {
      id: candidate.id,
      userId: candidate.userId,
      sessionId: candidate.sessionId,
      chatId: candidate.chatId,
      clientMessageId: candidate.clientMessageId,
      userMessage: candidate.userMessage,
      assistantMessage: candidate.assistantMessage,
      history: candidate.history as any,
      inputPayload: candidate.inputPayload as any,
      responsePayload: candidate.responsePayload as any,
      createdAt: new Date(candidate.createdAt),
      updatedAt: new Date(candidate.updatedAt),
    } as any,
    update: {
      sessionId: input.sessionId ?? null,
      userMessage: input.userMessage,
      assistantMessage: input.assistantMessage,
      history: input.history as any,
      inputPayload: input.inputPayload as any,
      responsePayload: input.responsePayload as any,
    } as any,
  });

  return toRecord(row as Record<string, unknown>);
}

export async function listConversationTurns(params: {
  userId: string;
  chatId?: string;
  sessionId?: string;
  limit?: number;
}): Promise<ConversationTurnRecord[]> {
  if (getPersistenceMode() === 'memory') {
    return Array.from(memoryStore.conversationTurns.values())
      .filter((record) => {
        if (record.userId !== params.userId) return false;
        if (params.chatId && record.chatId !== params.chatId) return false;
        if (params.sessionId && record.sessionId !== params.sessionId) return false;
        return true;
      })
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, Math.max(1, Math.min(params.limit ?? 50, 200)));
  }

  const prisma = await getPrismaClient();
  const rows = await prisma.conversationTurn.findMany({
    where: {
      userId: params.userId,
      ...(params.chatId ? { chatId: params.chatId } : {}),
      ...(params.sessionId ? { sessionId: params.sessionId } : {}),
    },
    orderBy: { createdAt: 'asc' },
    take: Math.max(1, Math.min(params.limit ?? 50, 200)),
  });
  return rows.map((row: unknown) => toRecord(row as Record<string, unknown>));
}
