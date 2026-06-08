import type { FinancialDiagnosticProfile } from '../schemas/profile.schema';
import { attachProfileToUser } from './user.service';
import { loadProfile } from './storage.service';

function hasDiagnosticNarrative(value: unknown): value is FinancialDiagnosticProfile {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as FinancialDiagnosticProfile).diagnosticNarrative === 'string' &&
      (value as FinancialDiagnosticProfile).diagnosticNarrative.trim().length > 0,
  );
}

export async function resolveUserDiagnosticProfile(user: {
  id: string;
  injectedProfile?: unknown;
  latestDiagnosticProfileId?: string | null;
}): Promise<FinancialDiagnosticProfile | null> {
  if (hasDiagnosticNarrative(user.injectedProfile)) {
    return user.injectedProfile;
  }

  const profileId =
    typeof user.latestDiagnosticProfileId === 'string' && user.latestDiagnosticProfileId.length > 0
      ? user.latestDiagnosticProfileId
      : null;
  if (!profileId) return null;

  const loaded = await loadProfile(profileId);
  if (!hasDiagnosticNarrative(loaded)) return null;

  if (!hasDiagnosticNarrative(user.injectedProfile)) {
    void attachProfileToUser(user.id, loaded).catch(() => {});
  }

  return loaded;
}
