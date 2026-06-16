import crypto from 'crypto';
import type { StoredUser } from '../types';
import { getPersistenceMode, getPrismaClient, memoryStore } from '../provider';
import { USER_ROLES, type UserRole } from '../../auth/rbac';
import { APPROVAL_STATUS, type ApprovalStatus } from '../../auth/approval';

type CreateUserInput = {
  name: string;
  email: string;
  passwordHash: string;
  role?: UserRole;
  approvalStatus?: ApprovalStatus;
  approvedAt?: string;
  approvedByEmail?: string;
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
    approvalStatus: input.approvalStatus ?? APPROVAL_STATUS.APPROVED,
    approvedAt: input.approvedAt,
    approvedByEmail: input.approvedByEmail,
    knowledgeBaseScore: 0,
    knowledgeScore: 0,
    knowledgeHistory: [],
    knowledgeLastUpdated: timestamp,
    usdSpentTotal: 0,
    fincoinDepletionHandled: false,
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
    approvalStatus: (record.approvalStatus as ApprovalStatus) ?? APPROVAL_STATUS.APPROVED,
    approvedAt: record.approvedAt
      ? new Date(record.approvedAt as string | number | Date).toISOString()
      : undefined,
    approvedByEmail: (record.approvedByEmail ?? undefined) as string | undefined,
    injectedProfile: (record.injectedProfile ?? undefined) as StoredUser['injectedProfile'],
    injectedIntake: (record.injectedIntake ?? undefined) as StoredUser['injectedIntake'],
    latestDiagnosticProfileId: (record.latestDiagnosticProfileId ?? undefined) as string | undefined,
    latestDiagnosticCompletedAt: record.latestDiagnosticCompletedAt
      ? new Date(record.latestDiagnosticCompletedAt as string | number | Date).toISOString()
      : undefined,
    panelState: (record.panelState ?? undefined) as StoredUser['panelState'],
    sheets: (record.sheets ?? undefined) as StoredUser['sheets'],
    knowledgeBaseScore: Number(record.knowledgeBaseScore ?? 0),
    knowledgeScore: Number(record.knowledgeScore ?? 0),
    knowledgeHistory: (record.knowledgeHistory ?? []) as StoredUser['knowledgeHistory'],
    knowledgeLastUpdated: record.knowledgeLastUpdated
      ? new Date(record.knowledgeLastUpdated as string | number | Date).toISOString()
      : nowIso(),
    memoryBlob: (record.memoryBlob ?? undefined) as Record<string, unknown> | undefined,
    usdSpentTotal: Number(record.usdSpentTotal ?? 0),
    fincoinDepletedAt: record.fincoinDepletedAt
      ? new Date(record.fincoinDepletedAt as string | number | Date).toISOString()
      : undefined,
    fincoinDepletionHandled: Boolean(record.fincoinDepletionHandled ?? false),
    createdAt: record.createdAt
      ? new Date(record.createdAt as string | number | Date).toISOString()
      : nowIso(),
    updatedAt: record.updatedAt
      ? new Date(record.updatedAt as string | number | Date).toISOString()
      : nowIso(),
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
      approvalStatus: candidate.approvalStatus,
      approvedAt: candidate.approvedAt ? new Date(candidate.approvedAt) : null,
      approvedByEmail: candidate.approvedByEmail ?? null,
      knowledgeBaseScore: candidate.knowledgeBaseScore,
      knowledgeScore: candidate.knowledgeScore,
      knowledgeHistory: candidate.knowledgeHistory as any,
      knowledgeLastUpdated: new Date(candidate.knowledgeLastUpdated),
    } as any,
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
  approvedAt?: string | null;
  approvedByEmail?: string | null;
};

const FINCOIN_SPEND_EPSILON = 1e-9;

export type AtomicUsdSpendResult =
  | { charged: true; usdSpentTotal: number; justDepleted: boolean }
  | { charged: false; reason: 'user_not_found' | 'depleted' | 'insufficient' };

export async function chargeUsdSpentTotalAtomic(
  userId: string,
  costUsd: number,
  maxUsdSpend: number,
): Promise<AtomicUsdSpendResult> {
  if (!Number.isFinite(costUsd) || costUsd <= 0) {
    const user = await getUserById(userId);
    if (!user) return { charged: false, reason: 'user_not_found' };
    const spent = Math.max(0, Number(user.usdSpentTotal ?? 0));
    return {
      charged: true,
      usdSpentTotal: spent,
      justDepleted: spent >= maxUsdSpend - FINCOIN_SPEND_EPSILON,
    };
  }

  const mode = getPersistenceMode();

  if (mode === 'memory') {
    const currentUser = memoryStore.users.get(userId);
    if (!currentUser) return { charged: false, reason: 'user_not_found' };

    const current = Math.max(0, Number(currentUser.usdSpentTotal ?? 0));
    if (current >= maxUsdSpend - FINCOIN_SPEND_EPSILON) {
      return { charged: false, reason: 'depleted' };
    }
    if (current + costUsd > maxUsdSpend + FINCOIN_SPEND_EPSILON) {
      return { charged: false, reason: 'insufficient' };
    }

    const next = Math.min(current + costUsd, maxUsdSpend);
    const justDepleted = next >= maxUsdSpend - FINCOIN_SPEND_EPSILON;
    memoryStore.users.set(userId, {
      ...currentUser,
      usdSpentTotal: next,
      ...(justDepleted && !currentUser.fincoinDepletedAt
        ? { fincoinDepletedAt: nowIso() }
        : {}),
      updatedAt: nowIso(),
    });

    return { charged: true, usdSpentTotal: next, justDepleted };
  }

  const prisma = await getPrismaClient();
  const rows = await prisma.$queryRaw<Array<{ usdSpentTotal: number }>>`
    UPDATE "User"
    SET
      "usdSpentTotal" = LEAST("usdSpentTotal" + ${costUsd}::double precision, ${maxUsdSpend}::double precision),
      "fincoinDepletedAt" = CASE
        WHEN LEAST("usdSpentTotal" + ${costUsd}::double precision, ${maxUsdSpend}::double precision)
          >= (${maxUsdSpend}::double precision - ${FINCOIN_SPEND_EPSILON})
        THEN COALESCE("fincoinDepletedAt", NOW())
        ELSE "fincoinDepletedAt"
      END,
      "updatedAt" = NOW()
    WHERE "id" = ${userId}
      AND "usdSpentTotal" + ${costUsd}::double precision <= ${maxUsdSpend}::double precision + ${FINCOIN_SPEND_EPSILON}
    RETURNING "usdSpentTotal"
  `;

  if (rows.length === 0) {
    const user = await getUserById(userId);
    if (!user) return { charged: false, reason: 'user_not_found' };
    const current = Math.max(0, Number(user.usdSpentTotal ?? 0));
    if (current >= maxUsdSpend - FINCOIN_SPEND_EPSILON) {
      return { charged: false, reason: 'depleted' };
    }
    return { charged: false, reason: 'insufficient' };
  }

  const usdSpentTotal = Number(rows[0]?.usdSpentTotal ?? 0);
  return {
    charged: true,
    usdSpentTotal,
    justDepleted: usdSpentTotal >= maxUsdSpend - FINCOIN_SPEND_EPSILON,
  };
}

export async function patchUserRecord(
  userId: string,
  patch: UserPatch,
  options?: { expectedUpdatedAt?: string },
): Promise<StoredUser | null> {
  const mode = getPersistenceMode();

  if (mode === 'memory') {
    const current = memoryStore.users.get(userId);
    if (!current) return null;
    if (options?.expectedUpdatedAt && current.updatedAt !== options.expectedUpdatedAt) {
      return null;
    }
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

  const data = {
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.passwordHash !== undefined ? { passwordHash: patch.passwordHash } : {}),
    ...(patch.role !== undefined ? { role: patch.role } : {}),
    ...(patch.approvalStatus !== undefined ? { approvalStatus: patch.approvalStatus } : {}),
    ...(patch.approvedAt !== undefined ? { approvedAt: patch.approvedAt ? new Date(patch.approvedAt) : null } : {}),
    ...(patch.approvedByEmail !== undefined ? { approvedByEmail: patch.approvedByEmail ?? null } : {}),
    ...(patch.injectedProfile !== undefined ? { injectedProfile: patch.injectedProfile as any } : {}),
    ...(patch.injectedIntake !== undefined ? { injectedIntake: patch.injectedIntake as any } : {}),
    ...(patch.latestDiagnosticProfileId !== undefined ? { latestDiagnosticProfileId: patch.latestDiagnosticProfileId } : {}),
    ...(patch.latestDiagnosticCompletedAt !== undefined
      ? {
          latestDiagnosticCompletedAt: patch.latestDiagnosticCompletedAt
            ? new Date(patch.latestDiagnosticCompletedAt)
            : null,
        }
      : {}),
    ...(patch.panelState !== undefined ? { panelState: patch.panelState as any } : {}),
    ...(patch.sheets !== undefined ? { sheets: patch.sheets as any } : {}),
    ...(patch.knowledgeBaseScore !== undefined ? { knowledgeBaseScore: patch.knowledgeBaseScore } : {}),
    ...(patch.knowledgeScore !== undefined ? { knowledgeScore: patch.knowledgeScore } : {}),
    ...(patch.knowledgeHistory !== undefined ? { knowledgeHistory: patch.knowledgeHistory as any } : {}),
    ...(patch.knowledgeLastUpdated !== undefined ? { knowledgeLastUpdated: new Date(patch.knowledgeLastUpdated) } : {}),
    ...(patch.memoryBlob !== undefined ? { memoryBlob: patch.memoryBlob as any } : {}),
    ...(patch.usdSpentTotal !== undefined ? { usdSpentTotal: patch.usdSpentTotal } : {}),
    ...(patch.fincoinDepletedAt !== undefined
      ? { fincoinDepletedAt: patch.fincoinDepletedAt ? new Date(patch.fincoinDepletedAt) : null }
      : {}),
    ...(patch.fincoinDepletionHandled !== undefined
      ? { fincoinDepletionHandled: patch.fincoinDepletionHandled }
      : {}),
  } as any;

  if (options?.expectedUpdatedAt) {
    const result = await prisma.user.updateMany({
      where: {
        id: userId,
        updatedAt: new Date(options.expectedUpdatedAt),
      },
      data,
    });
    if (result.count === 0) return null;
    const updatedRecord = await prisma.user.findUnique({ where: { id: userId } });
    return updatedRecord ? toStoredUser(updatedRecord) : null;
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data,
  }).catch((error: unknown) => {
    if ((error as { code?: string })?.code === 'P2025') {
      return null;
    }
    throw error;
  });

  return updated ? toStoredUser(updated) : null;
}

export async function deleteUserRecord(userId: string): Promise<boolean> {
  const mode = getPersistenceMode();

  if (mode === 'memory') {
    const user = memoryStore.users.get(userId);
    if (!user) return false;

    memoryStore.users.delete(userId);
    memoryStore.usersByEmail.delete(user.email);
    memoryStore.vectorStores.delete(userId);

    for (const [tokenHash, session] of memoryStore.sessions.entries()) {
      if (session.userId === userId) memoryStore.sessions.delete(tokenHash);
    }

    for (const [profileId, profile] of memoryStore.profiles.entries()) {
      if (profile.userId === userId) memoryStore.profiles.delete(profileId);
    }

    for (const [docId, document] of memoryStore.documents.entries()) {
      if (document.userId === userId) memoryStore.documents.delete(docId);
    }

    return true;
  }

  const prisma = await getPrismaClient();
  const deleted = await prisma.user
    .delete({
      where: { id: userId },
    })
    .catch((error: unknown) => {
      if ((error as { code?: string })?.code === 'P2025') return null;
      throw error;
    });

  return Boolean(deleted);
}
