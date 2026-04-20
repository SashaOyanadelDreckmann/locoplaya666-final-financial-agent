import type { PrismaClient } from '@prisma/client';
import type { StoredProfile, StoredSession, StoredUser, StoredUserDocument, StoredUserVectorStore } from './types';

export type PersistenceMode = 'postgres' | 'memory';

const memoryUsers = new Map<string, StoredUser>();
const memoryUsersByEmail = new Map<string, string>();
const memorySessions = new Map<string, StoredSession>();
const memoryProfiles = new Map<string, StoredProfile>();
const memoryDocuments = new Map<string, StoredUserDocument>();
const memoryVectorStores = new Map<string, StoredUserVectorStore>();

let prismaClient: PrismaClient | null = null;

function canUsePostgres(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function getPersistenceMode(): PersistenceMode {
  return canUsePostgres() ? 'postgres' : 'memory';
}

export async function getPrismaClient(): Promise<PrismaClient> {
  if (!canUsePostgres()) {
    throw new Error('DATABASE_URL is not configured');
  }

  if (!prismaClient) {
    const { PrismaClient: PrismaClientCtor } = await import('@prisma/client');
    prismaClient = new PrismaClientCtor({
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
  }

  return prismaClient;
}

export const memoryStore = {
  users: memoryUsers,
  usersByEmail: memoryUsersByEmail,
  sessions: memorySessions,
  profiles: memoryProfiles,
  documents: memoryDocuments,
  vectorStores: memoryVectorStores,
};
