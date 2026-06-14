'use client';

import { create } from 'zustand';
import { fetchLatestDiagnosis, getSessionInfo } from '@/lib/api/cliente';
import { ApiHttpError } from '@/lib/api/envelope';

export type FinancialProfileTraits = {
  financialClarity: 'low' | 'medium' | 'high';
  decisionStyle: 'reactive' | 'analytical' | 'avoidant' | 'delegated' | 'mixed';
  timeHorizon: 'short_term' | 'mixed' | 'long_term';
  financialPressure: 'low' | 'moderate' | 'high';
  emotionalPattern: 'neutral' | 'anxious' | 'avoidant' | 'controlling' | 'conflicted';
};

export type DiagnosisProfile = {
  diagnosticNarrative?: string;
  profile?: FinancialProfileTraits | Record<string, unknown>;
  tensions?: string[];
  hypotheses?: string[];
  openQuestions?: string[];
  editorial?: {
    headline?: string;
    dek?: string;
    keySignals?: string[];
    scorecard?: Array<{
      id: string;
      label: string;
      value: number;
      tone: 'critical' | 'watch' | 'strong';
      caption: string;
    }>;
    cashflowBuckets?: Array<{ label: string; value: number }>;
    pressurePoints?: Array<{ label: string; value: number }>;
  };
};

type ProfileState = {
  profile: DiagnosisProfile | null;
  loading: boolean;
  error: string | null;
  hasDiagnosis: boolean;
  setProfile: (profile: DiagnosisProfile | null) => void;
  loadProfileIfNeeded: () => Promise<void>;
  refreshProfile: () => Promise<DiagnosisProfile | null>;
};

function isDiagnosisProfile(value: unknown): value is DiagnosisProfile {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as DiagnosisProfile).diagnosticNarrative === 'string' &&
      (value as DiagnosisProfile).diagnosticNarrative!.trim().length > 0,
  );
}

function diagnosisLoadErrorMessage(error: unknown): string {
  if (error instanceof ApiHttpError) {
    if (error.status === 404) {
      return 'Aún no encontramos un diagnóstico guardado para esta cuenta.';
    }
    return error.message || 'No se pudo cargar el diagnóstico.';
  }
  return error instanceof Error ? error.message : 'No se pudo cargar el diagnóstico.';
}

async function resolveDiagnosisProfile(options?: { forceRemote?: boolean }): Promise<DiagnosisProfile | null> {
  const session = await getSessionInfo();
  const injected = session?.injectedProfile;
  const profileId =
    typeof session?.latestDiagnosticProfileId === 'string' && session.latestDiagnosticProfileId.length > 0
      ? session.latestDiagnosticProfileId
      : null;
  const completedAt =
    typeof session?.latestDiagnosticCompletedAt === 'string' && session.latestDiagnosticCompletedAt.length > 0
      ? session.latestDiagnosticCompletedAt
      : null;

  if (!options?.forceRemote && isDiagnosisProfile(injected)) {
    return injected;
  }

  if (profileId || completedAt) {
    try {
      const remote = await fetchLatestDiagnosis();
      if (isDiagnosisProfile(remote)) return remote;
    } catch (error) {
      if (isDiagnosisProfile(injected)) return injected;
      throw error;
    }
  }

  if (isDiagnosisProfile(injected)) {
    return injected;
  }

  return null;
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profile: null,
  loading: false,
  error: null,
  hasDiagnosis: false,

  setProfile: (profile) =>
    set({
      profile,
      error: null,
      hasDiagnosis: isDiagnosisProfile(profile),
    }),

  loadProfileIfNeeded: async () => {
    if (get().hasDiagnosis && get().profile) return;

    set({ loading: true, error: null });
    try {
      const profile = await resolveDiagnosisProfile();
      set({
        profile,
        loading: false,
        error: profile ? null : null,
        hasDiagnosis: Boolean(profile),
      });
    } catch (err) {
      set({
        loading: false,
        error: diagnosisLoadErrorMessage(err),
        hasDiagnosis: false,
      });
    }
  },

  refreshProfile: async () => {
    set({ loading: true, error: null });
    try {
      const profile = await resolveDiagnosisProfile({ forceRemote: true });
      set({
        profile,
        loading: false,
        error: null,
        hasDiagnosis: Boolean(profile),
      });
      return profile;
    } catch (err) {
      set({
        loading: false,
        error: diagnosisLoadErrorMessage(err),
        hasDiagnosis: false,
      });
      return null;
    }
  },
}));
