'use client';

import { create } from 'zustand';
import { getSessionInfo } from '@/lib/api';

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
};

type ProfileState = {
  profile: DiagnosisProfile | null;
  loading: boolean;
  error: string | null;
  setProfile: (profile: any) => void;
  loadProfileIfNeeded: () => Promise<void>;
};

export const useProfileStore = create<ProfileState>((set, get) => ({
  profile: null,
  loading: false,
  error: null,

  setProfile: (profile) => set({ profile, error: null }),

  loadProfileIfNeeded: async () => {
    if (get().profile) return;

    set({ loading: true, error: null });
    try {
      const session = await getSessionInfo();
      const injected = session?.injectedProfile;

      if (injected) {
        set({ profile: injected, loading: false, error: null });
        return;
      }

      set({
        profile: {
          diagnosticNarrative: 'Aún no hay diagnóstico guardado para esta sesión.',
          profile: {
            financialClarity: 'medium',
            decisionStyle: 'mixed',
            timeHorizon: 'mixed',
            financialPressure: 'moderate',
            emotionalPattern: 'neutral',
          },
          tensions: [],
          hypotheses: [],
          openQuestions: [],
        },
        loading: false,
        error: null,
      });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'No se pudo cargar el perfil',
      });
    }
  },
}));
