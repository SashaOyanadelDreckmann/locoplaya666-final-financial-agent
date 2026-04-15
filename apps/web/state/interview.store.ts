'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { IntakeQuestionnaire } from '@financial-agent/shared/src/intake/intake-questionnaire.types';

type CompletedBlocksMap = Record<
  string,
  {
    blockId: string;
    summary: string;
    signalsDetected: string[];
    confidence: 'low' | 'medium' | 'high';
    userValidated: boolean;
  }
>;

type InterviewResponse = {
  type: 'question' | 'block_summary' | 'block_completed' | 'interview_complete';
  blockId?: string;
  question?: string;
  summary?: string;
  completedBlocks?: CompletedBlocksMap;
  profile?: any;
};

type InterviewState = {
  intake: IntakeQuestionnaire | null;
  answersByBlock: Record<string, string[]>;
  completedBlocks: CompletedBlocksMap;
  lastResponse: InterviewResponse | null;
  setIntake: (intake: IntakeQuestionnaire) => void;
  addAnswer: (blockId: string, answer: string) => void;
  resetBlock: (blockId: string) => void;
  setResponse: (response: InterviewResponse | null) => void;
};

export const useInterviewStore = create<InterviewState>()(
  persist(
    (set) => ({
      intake: null,
      answersByBlock: {},
      completedBlocks: {},
      lastResponse: null,
      setIntake: (intake) => set({ intake }),
      addAnswer: (blockId, answer) =>
        set((state) => ({
          answersByBlock: {
            ...state.answersByBlock,
            [blockId]: [...(state.answersByBlock[blockId] ?? []), answer],
          },
        })),
      resetBlock: (blockId) =>
        set((state) => ({
          answersByBlock: {
            ...state.answersByBlock,
            [blockId]: [],
          },
        })),
      setResponse: (response) =>
        set((state) => ({
          lastResponse: response,
          completedBlocks:
            response?.completedBlocks && typeof response.completedBlocks === 'object'
              ? response.completedBlocks
              : state.completedBlocks,
        })),
    }),
    {
      name: 'financial-agent-interview-store',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        intake: state.intake,
        answersByBlock: state.answersByBlock,
        completedBlocks: state.completedBlocks,
        lastResponse: state.lastResponse,
      }),
    }
  )
);
