import type { StoredSession } from '../types';
import { getPersistenceMode, getPrismaClient, memoryStore } from '../provider';

type SessionRow = {
  tokenHash: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
};

function toStoredSession(record: SessionRow): StoredSession {
  return {
    token: record.tokenHash,
    userId: record.userId,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
  };
}

export async function createSessionRecord(params: {
  tokenHash: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
  rotatedFromHash?: string;
}): Promise<StoredSession> {
  const mode = getPersistenceMode();

  if (mode === 'memory') {
    const session: StoredSession = {
      token: params.tokenHash,
      userId: params.userId,
      createdAt: params.createdAt,
      expiresAt: params.expiresAt,
    };
    memoryStore.sessions.set(params.tokenHash, session);
    return session;
  }

  const prisma = await getPrismaClient();
  const created = await prisma.session.create({
    data: {
      tokenHash: params.tokenHash,
      userId: params.userId,
      createdAt: new Date(params.createdAt),
      expiresAt: new Date(params.expiresAt),
      lastSeenAt: new Date(params.createdAt),
      rotatedFromHash: params.rotatedFromHash,
    },
  });

  return toStoredSession({
    tokenHash: created.tokenHash,
    userId: created.userId,
    createdAt: created.createdAt.toISOString(),
    expiresAt: created.expiresAt.toISOString(),
  });
}

export async function getSessionByTokenHash(tokenHash: string): Promise<StoredSession | null> {
  const mode = getPersistenceMode();

  if (mode === 'memory') {
    return memoryStore.sessions.get(tokenHash) ?? null;
  }

  const prisma = await getPrismaClient();
  const record = await prisma.session.findUnique({ where: { tokenHash } });
  if (!record) return null;

  return toStoredSession({
    tokenHash: record.tokenHash,
    userId: record.userId,
    createdAt: record.createdAt.toISOString(),
    expiresAt: record.expiresAt.toISOString(),
  });
}

export async function deleteSessionByTokenHash(tokenHash: string): Promise<boolean> {
  const mode = getPersistenceMode();

  if (mode === 'memory') {
    return memoryStore.sessions.delete(tokenHash);
  }

  const prisma = await getPrismaClient();
  const result = await prisma.session.deleteMany({ where: { tokenHash } });
  return result.count > 0;
}

export async function deleteSessionsByUserId(userId: string): Promise<number> {
  const mode = getPersistenceMode();

  if (mode === 'memory') {
    let deleted = 0;
    for (const [key, value] of memoryStore.sessions.entries()) {
      if (value.userId === userId) {
        memoryStore.sessions.delete(key);
        deleted += 1;
      }
    }
    return deleted;
  }

  const prisma = await getPrismaClient();
  const result = await prisma.session.deleteMany({ where: { userId } });
  return result.count;
}

export async function touchSession(tokenHash: string): Promise<void> {
  const mode = getPersistenceMode();

  if (mode === 'memory') {
    const current = memoryStore.sessions.get(tokenHash);
    if (!current) return;
    memoryStore.sessions.set(tokenHash, {
      ...current,
      createdAt: current.createdAt,
    });
    return;
  }

  const prisma = await getPrismaClient();
  await prisma.session.updateMany({
    where: { tokenHash },
    data: { lastSeenAt: new Date() },
  });
}

export async function purgeExpiredSessions(nowIso: string): Promise<number> {
  const mode = getPersistenceMode();

  if (mode === 'memory') {
    let deleted = 0;
    for (const [key, value] of memoryStore.sessions.entries()) {
      if (Date.parse(value.expiresAt) <= Date.parse(nowIso)) {
        memoryStore.sessions.delete(key);
        deleted += 1;
      }
    }
    return deleted;
  }

  const prisma = await getPrismaClient();
  const result = await prisma.session.deleteMany({
    where: {
      expiresAt: {
        lte: new Date(nowIso),
      },
    },
  });
  return result.count;
}
