'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { IntakeQuestionnaire } from '@financial-agent/shared/src/intake/intake-questionnaire.types';

type InterviewState = {
  intake: (Partial<IntakeQuestionnaire> & Record<string, unknown>) | null;
  setIntake: (intake: Partial<IntakeQuestionnaire> & Record<string, unknown>) => void;
  resetInterviewState: () => void;
};

export const useInterviewStore = create<InterviewState>()(
  persist(
    (set) => ({
      intake: null,
      setIntake: (intake) => set({ intake }),
      resetInterviewState: () => set({ intake: null }),
    }),
    {
      name: 'financial-agent-interview-store',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        intake: state.intake,
      }),
    },
  ),
);
