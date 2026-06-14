import { getSessionInfo } from '@/lib/api/cliente';
import { useProfileStore, type DiagnosisProfile } from '@/state/profile.store';

type SessionInfo = Awaited<ReturnType<typeof getSessionInfo>>;

export async function syncDiagnosisSession(options?: {
  onSession?: (session: SessionInfo) => void;
}): Promise<{ profile: DiagnosisProfile | null; session: SessionInfo | null }> {
  const profile = await useProfileStore.getState().refreshProfile();
  let session: SessionInfo | null = null;

  try {
    session = await getSessionInfo();
    options?.onSession?.(session);
  } catch {
    session = null;
  }

  return { profile, session };
}

export function resolvePanelDiagnosisProfile(
  sessionProfile: unknown,
  storeProfile: DiagnosisProfile | null,
): DiagnosisProfile | null {
  const fromSession =
    sessionProfile &&
    typeof sessionProfile === 'object' &&
    typeof (sessionProfile as DiagnosisProfile).diagnosticNarrative === 'string' &&
    (sessionProfile as DiagnosisProfile).diagnosticNarrative!.trim().length > 0
      ? (sessionProfile as DiagnosisProfile)
      : null;

  if (fromSession) return fromSession;
  if (storeProfile?.diagnosticNarrative?.trim()) return storeProfile;
  return null;
}
