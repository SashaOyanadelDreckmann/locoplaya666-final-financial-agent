import crypto from 'crypto';
import { getLogger } from '../../logger';
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

/** Returns [] when ConversationTurn storage is unavailable (e.g. pending migration). */
export async function listConversationTurnsSafe(
  params: Parameters<typeof listConversationTurns>[0],
): Promise<ConversationTurnRecord[]> {
  try {
    return await listConversationTurns(params);
  } catch (error) {
    getLogger().warn({
      msg: 'ConversationTurn lookup failed; continuing without turn repair',
      userId: params.userId,
      error,
    });
    return [];
  }
}

const MAX_TURNS_PER_USER_ANALYTICS = 200;
const MAX_TURNS_GLOBAL_ANALYTICS = 8000;

function turnToTimelineEntry(turn: ConversationTurnRecord): {
  id: string;
  chatId: string;
  sessionId: string | null;
  turnId: string | null;
  timestamp: string;
  mode: string | null;
  toolNames: string[];
  artifactTitles: string[];
  userMessage: string;
  agentMessage: string;
  summary: string;
} {
  const response =
    turn.responsePayload && typeof turn.responsePayload === 'object'
      ? (turn.responsePayload as Record<string, unknown>)
      : null;
  const toolNames = Array.isArray(response?.tool_calls)
    ? response.tool_calls
        .map((item) => {
          if (!item || typeof item !== 'object') return '';
          return String((item as Record<string, unknown>).tool ?? '').trim();
        })
        .filter((name) => name.length > 0)
    : [];
  const artifactTitles = Array.isArray(response?.artifacts)
    ? response.artifacts
        .map((item) => {
          if (!item || typeof item !== 'object') return '';
          return String((item as Record<string, unknown>).title ?? '').trim();
        })
        .filter((title) => title.length > 0)
    : [];

  return {
    id: turn.id,
    chatId: turn.chatId,
    sessionId: turn.sessionId ?? null,
    turnId: turn.clientMessageId,
    timestamp: turn.createdAt,
    mode: typeof response?.mode === 'string' ? response.mode : null,
    toolNames,
    artifactTitles,
    userMessage: turn.userMessage,
    agentMessage: turn.assistantMessage,
    summary: '',
  };
}

export async function countConversationTurnsForUser(userId: string): Promise<number> {
  if (getPersistenceMode() === 'memory') {
    return Array.from(memoryStore.conversationTurns.values()).filter((turn) => turn.userId === userId).length;
  }

  const prisma = await getPrismaClient();
  return prisma.conversationTurn.count({ where: { userId } });
}

/** Returns 0 when ConversationTurn storage is unavailable (e.g. pending migration). */
export async function countConversationTurnsForUserSafe(userId: string): Promise<number> {
  try {
    return await countConversationTurnsForUser(userId);
  } catch (error) {
    getLogger().warn({
      msg: 'ConversationTurn count failed; continuing with zero turns',
      userId,
      error,
    });
    return 0;
  }
}

/** Returns 0 when ConversationTurn storage is unavailable (e.g. pending migration). */
export async function countConversationTurnsGlobalSafe(): Promise<number> {
  if (getPersistenceMode() === 'memory') {
    return memoryStore.conversationTurns.size;
  }

  try {
    const prisma = await getPrismaClient();
    return await prisma.conversationTurn.count();
  } catch (error) {
    getLogger().warn({
      msg: 'ConversationTurn global count failed; continuing with zero turns',
      error,
    });
    return 0;
  }
}

export async function listConversationTurnTimelinesByUser(): Promise<
  Map<string, ReturnType<typeof turnToTimelineEntry>[]>
> {
  const grouped = new Map<string, ReturnType<typeof turnToTimelineEntry>[]>();

  const pushTurn = (userId: string, turn: ConversationTurnRecord) => {
    const list = grouped.get(userId) ?? [];
    if (list.length >= MAX_TURNS_PER_USER_ANALYTICS) return;
    list.push(turnToTimelineEntry(turn));
    grouped.set(userId, list);
  };

  if (getPersistenceMode() === 'memory') {
    const turns = Array.from(memoryStore.conversationTurns.values()).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
    for (const turn of turns) {
      pushTurn(turn.userId, turn);
    }
    return grouped;
  }

  const prisma = await getPrismaClient();
  const rows = await prisma.conversationTurn.findMany({
    orderBy: { createdAt: 'desc' },
    take: MAX_TURNS_GLOBAL_ANALYTICS,
  });

  for (const row of rows) {
    pushTurn(row.userId, toRecord(row as Record<string, unknown>));
  }

  return grouped;
}

/** Returns empty map when ConversationTurn storage is unavailable (e.g. pending migration). */
export async function listConversationTurnTimelinesByUserSafe(): Promise<
  Map<string, ReturnType<typeof turnToTimelineEntry>[]>
> {
  try {
    return await listConversationTurnTimelinesByUser();
  } catch (error) {
    getLogger().warn({
      msg: 'ConversationTurn timeline lookup failed; continuing without turn analytics',
      error,
    });
    return new Map();
  }
}
