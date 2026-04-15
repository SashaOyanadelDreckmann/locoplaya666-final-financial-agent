import type { FinancialDiagnosticProfile } from '../../schemas/profile.schema';
import type { StoredProfile } from '../types';
import { getPersistenceMode, getPrismaClient, memoryStore } from '../provider';

function toStoredProfile(record: {
  id: string;
  userId: string;
  payload: FinancialDiagnosticProfile;
  createdAt: string;
}): StoredProfile {
  return {
    id: record.id,
    userId: record.userId,
    payload: record.payload,
    createdAt: record.createdAt,
  };
}

export async function createFinancialProfile(params: {
  id: string;
  userId: string;
  payload: FinancialDiagnosticProfile;
}): Promise<StoredProfile> {
  const nowIso = new Date().toISOString();
  const mode = getPersistenceMode();

  if (mode === 'memory') {
    const record = toStoredProfile({
      id: params.id,
      userId: params.userId,
      payload: params.payload,
      createdAt: nowIso,
    });
    memoryStore.profiles.set(record.id, record);
    return record;
  }

  const prisma = await getPrismaClient();
  const created = await prisma.financialProfile.create({
    data: {
      id: params.id,
      userId: params.userId,
      payload: params.payload as any,
      createdAt: new Date(nowIso),
    },
  });

  return toStoredProfile({
    id: created.id,
    userId: created.userId,
    payload: created.payload as FinancialDiagnosticProfile,
    createdAt: created.createdAt.toISOString(),
  });
}

export async function getFinancialProfileById(profileId: string): Promise<StoredProfile | null> {
  const mode = getPersistenceMode();

  if (mode === 'memory') {
    return memoryStore.profiles.get(profileId) ?? null;
  }

  const prisma = await getPrismaClient();
  const record = await prisma.financialProfile.findUnique({ where: { id: profileId } });
  if (!record) return null;

  return toStoredProfile({
    id: record.id,
    userId: record.userId,
    payload: record.payload as FinancialDiagnosticProfile,
    createdAt: record.createdAt.toISOString(),
  });
}

export async function listFinancialProfilesByUser(userId: string): Promise<StoredProfile[]> {
  const mode = getPersistenceMode();

  if (mode === 'memory') {
    return Array.from(memoryStore.profiles.values())
      .filter((profile) => profile.userId === userId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  const prisma = await getPrismaClient();
  const rows = await prisma.financialProfile.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });

  return rows.map((row) =>
    toStoredProfile({
      id: row.id,
      userId: row.userId,
      payload: row.payload as FinancialDiagnosticProfile,
      createdAt: row.createdAt.toISOString(),
    }),
  );
}

export async function listFinancialProfiles(): Promise<StoredProfile[]> {
  const mode = getPersistenceMode();

  if (mode === 'memory') {
    return Array.from(memoryStore.profiles.values()).sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : -1,
    );
  }

  const prisma = await getPrismaClient();
  const rows = await prisma.financialProfile.findMany({
    orderBy: { createdAt: 'desc' },
  });

  return rows.map((row) =>
    toStoredProfile({
      id: row.id,
      userId: row.userId,
      payload: row.payload as FinancialDiagnosticProfile,
      createdAt: row.createdAt.toISOString(),
    }),
  );
}

export async function deleteFinancialProfile(profileId: string): Promise<boolean> {
  const mode = getPersistenceMode();

  if (mode === 'memory') {
    return memoryStore.profiles.delete(profileId);
  }

  const prisma = await getPrismaClient();
  const result = await prisma.financialProfile.deleteMany({ where: { id: profileId } });
  return result.count > 0;
}
