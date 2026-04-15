import crypto from 'crypto';
import type { StoredUser } from '../types';
import { getPersistenceMode, getPrismaClient, memoryStore } from '../provider';
import { USER_ROLES, type UserRole } from '../../auth/rbac';

type CreateUserInput = {
  name: string;
  email: string;
  passwordHash: string;
  role?: UserRole;
};

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function buildDefaultUser(input: CreateUserInput): StoredUser {
  const timestamp = nowIso();
  return {
    id: `user_${crypto.randomUUID()}`,
    name: input.name,
    email: normalizeEmail(input.email),
    passwordHash: input.passwordHash,
    role: input.role ?? USER_ROLES.USER,
    knowledgeBaseScore: 0,
    knowledgeScore: 0,
    knowledgeHistory: [],
    knowledgeLastUpdated: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function toStoredUser(record: Record<string, unknown>): StoredUser {
  return {
    id: String(record.id),
    name: String(record.name),
    email: String(record.email),
    passwordHash: String(record.passwordHash),
    role: (record.role as UserRole) ?? USER_ROLES.USER,
    injectedProfile: (record.injectedProfile ?? undefined) as StoredUser['injectedProfile'],
    injectedIntake: (record.injectedIntake ?? undefined) as StoredUser['injectedIntake'],
    latestDiagnosticProfileId: (record.latestDiagnosticProfileId ?? undefined) as string | undefined,
    latestDiagnosticCompletedAt: record.latestDiagnosticCompletedAt
      ? new Date(record.latestDiagnosticCompletedAt).toISOString()
      : undefined,
    panelState: (record.panelState ?? undefined) as StoredUser['panelState'],
    sheets: (record.sheets ?? undefined) as StoredUser['sheets'],
    knowledgeBaseScore: Number(record.knowledgeBaseScore ?? 0),
    knowledgeScore: Number(record.knowledgeScore ?? 0),
    knowledgeHistory: (record.knowledgeHistory ?? []) as StoredUser['knowledgeHistory'],
    knowledgeLastUpdated: record.knowledgeLastUpdated
      ? new Date(record.knowledgeLastUpdated).toISOString()
      : nowIso(),
    memoryBlob: (record.memoryBlob ?? undefined) as Record<string, unknown> | undefined,
    createdAt: record.createdAt ? new Date(record.createdAt).toISOString() : nowIso(),
    updatedAt: record.updatedAt ? new Date(record.updatedAt).toISOString() : nowIso(),
  };
}

export async function createUserRecord(input: CreateUserInput): Promise<StoredUser> {
  const mode = getPersistenceMode();
  const candidate = buildDefaultUser(input);

  if (mode === 'memory') {
    if (memoryStore.usersByEmail.has(candidate.email)) {
      throw new Error(`User with email ${candidate.email} already exists`);
    }
    memoryStore.users.set(candidate.id, candidate);
    memoryStore.usersByEmail.set(candidate.email, candidate.id);
    return candidate;
  }

  const prisma = await getPrismaClient();
  const created = await prisma.user.create({
    data: {
      id: candidate.id,
      name: candidate.name,
      email: candidate.email,
      passwordHash: candidate.passwordHash,
      role: candidate.role,
      knowledgeBaseScore: candidate.knowledgeBaseScore,
      knowledgeScore: candidate.knowledgeScore,
      knowledgeHistory: candidate.knowledgeHistory,
      knowledgeLastUpdated: new Date(candidate.knowledgeLastUpdated),
    },
  }).catch((error: unknown) => {
    if ((error as { code?: string })?.code === 'P2002') {
      throw new Error(`User with email ${candidate.email} already exists`);
    }
    throw error;
  });

  return toStoredUser(created);
}

export async function getUserById(userId: string): Promise<StoredUser | null> {
  const mode = getPersistenceMode();

  if (mode === 'memory') {
    return memoryStore.users.get(userId) ?? null;
  }

  const prisma = await getPrismaClient();
  const record = await prisma.user.findUnique({ where: { id: userId } });
  return record ? toStoredUser(record) : null;
}

export async function getUserByEmail(email: string): Promise<StoredUser | null> {
  const normalizedEmail = normalizeEmail(email);
  const mode = getPersistenceMode();

  if (mode === 'memory') {
    const userId = memoryStore.usersByEmail.get(normalizedEmail);
    if (!userId) return null;
    return memoryStore.users.get(userId) ?? null;
  }

  const prisma = await getPrismaClient();
  const record = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  return record ? toStoredUser(record) : null;
}

type UserPatch = Partial<Omit<StoredUser, 'id' | 'email' | 'createdAt' | 'updatedAt'>> & {
  injectedProfile?: StoredUser['injectedProfile'] | null;
  injectedIntake?: StoredUser['injectedIntake'] | null;
  panelState?: StoredUser['panelState'] | null;
  sheets?: StoredUser['sheets'] | null;
  memoryBlob?: StoredUser['memoryBlob'] | null;
};

export async function patchUserRecord(userId: string, patch: UserPatch): Promise<StoredUser | null> {
  const mode = getPersistenceMode();

  if (mode === 'memory') {
    const current = memoryStore.users.get(userId);
    if (!current) return null;
    const normalizedPatch = {
      ...patch,
      ...(patch.injectedProfile === null ? { injectedProfile: undefined } : {}),
      ...(patch.injectedIntake === null ? { injectedIntake: undefined } : {}),
      ...(patch.panelState === null ? { panelState: undefined } : {}),
      ...(patch.sheets === null ? { sheets: undefined } : {}),
      ...(patch.memoryBlob === null ? { memoryBlob: undefined } : {}),
    };
    const updated: StoredUser = {
      ...current,
      ...normalizedPatch,
      updatedAt: nowIso(),
    };
    memoryStore.users.set(userId, updated);
    return updated;
  }

  const prisma = await getPrismaClient();

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.passwordHash !== undefined ? { passwordHash: patch.passwordHash } : {}),
      ...(patch.role !== undefined ? { role: patch.role } : {}),
      ...(patch.injectedProfile !== undefined ? { injectedProfile: patch.injectedProfile as any } : {}),
      ...(patch.injectedIntake !== undefined ? { injectedIntake: patch.injectedIntake as any } : {}),
      ...(patch.latestDiagnosticProfileId !== undefined
        ? { latestDiagnosticProfileId: patch.latestDiagnosticProfileId }
        : {}),
      ...(patch.latestDiagnosticCompletedAt !== undefined
        ? {
            latestDiagnosticCompletedAt: patch.latestDiagnosticCompletedAt
              ? new Date(patch.latestDiagnosticCompletedAt)
              : null,
          }
        : {}),
      ...(patch.panelState !== undefined ? { panelState: patch.panelState as any } : {}),
      ...(patch.sheets !== undefined ? { sheets: patch.sheets as any } : {}),
      ...(patch.knowledgeBaseScore !== undefined
        ? { knowledgeBaseScore: patch.knowledgeBaseScore }
        : {}),
      ...(patch.knowledgeScore !== undefined ? { knowledgeScore: patch.knowledgeScore } : {}),
      ...(patch.knowledgeHistory !== undefined
        ? { knowledgeHistory: patch.knowledgeHistory as any }
        : {}),
      ...(patch.knowledgeLastUpdated !== undefined
        ? { knowledgeLastUpdated: new Date(patch.knowledgeLastUpdated) }
        : {}),
      ...(patch.memoryBlob !== undefined ? { memoryBlob: patch.memoryBlob as any } : {}),
    },
  }).catch((error: unknown) => {
    if ((error as { code?: string })?.code === 'P2025') {
      return null;
    }
    throw error;
  });

  return updated ? toStoredUser(updated) : null;
}
