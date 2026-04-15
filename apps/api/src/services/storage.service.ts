import crypto from 'crypto';
import type { FinancialDiagnosticProfile } from '../schemas/profile.schema';
import {
  createFinancialProfile,
  deleteFinancialProfile,
  getFinancialProfileById,
  listFinancialProfiles,
} from '../persistence/repos';
import { getPersistenceMode, getPrismaClient } from '../persistence/provider';
import { patchUserRecord } from '../persistence/repos';

function generateProfileId(): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  return `financial_profile_${ts}_${crypto.randomUUID()}`;
}

export async function saveProfile(
  userId: string,
  profile: FinancialDiagnosticProfile,
): Promise<{ profileId: string }> {
  const profileId = generateProfileId();

  if (getPersistenceMode() === 'postgres') {
    const prisma = await getPrismaClient();
    await prisma.$transaction([
      prisma.financialProfile.create({
        data: {
          id: profileId,
          userId,
          payload: profile as any,
        },
      }),
      prisma.user.update({
        where: { id: userId },
        data: {
          latestDiagnosticProfileId: profileId,
          latestDiagnosticCompletedAt: new Date(),
        },
      }),
    ]);
  } else {
    await createFinancialProfile({
      id: profileId,
      userId,
      payload: profile,
    });
    const updated = await patchUserRecord(userId, {
      latestDiagnosticProfileId: profileId,
      latestDiagnosticCompletedAt: new Date().toISOString(),
    });
    if (!updated) {
      await deleteFinancialProfile(profileId);
      throw new Error('User not found while linking financial profile');
    }
  }

  return { profileId };
}

export async function loadProfile(profileId: string): Promise<FinancialDiagnosticProfile | null> {
  const profile = await getFinancialProfileById(profileId);
  return profile?.payload ?? null;
}

export async function listProfiles(): Promise<string[]> {
  const profiles = await listFinancialProfiles();
  return profiles.map((profile) => profile.id);
}

export async function deleteProfile(profileId: string): Promise<boolean> {
  return deleteFinancialProfile(profileId);
}
