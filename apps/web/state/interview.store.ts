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
  questionIndex?: number;
  summary?: string;
  requiresValidation?: boolean;
  revisionRequested?: boolean;
  userComment?: string;
  completedBlocks?: CompletedBlocksMap;
  profile?: Record<string, unknown>;
};

type InterviewState = {
  intake: IntakeQuestionnaire | null;
  answersByBlock: Record<string, string[]>;
  transcriptEntries: Array<{
    blockId: string;
    answer: string;
  }>;
  completedBlocks: CompletedBlocksMap;
  lastResponse: InterviewResponse | null;
  setIntake: (intake: IntakeQuestionnaire) => void;
  addAnswer: (blockId: string, answer: string) => void;
  resetBlock: (blockId: string) => void;
  setResponse: (response: InterviewResponse | null) => void;
  resetInterviewState: () => void;
};

export const useInterviewStore = create<InterviewState>()(
  persist(
    (set) => ({
      intake: null,
      answersByBlock: {},
      transcriptEntries: [],
      completedBlocks: {},
      lastResponse: null,
      setIntake: (intake) => set({ intake }),
      addAnswer: (blockId, answer) =>
        set((state) => ({
          answersByBlock: {
            ...state.answersByBlock,
            [blockId]: [...(state.answersByBlock[blockId] ?? []), answer],
          },
          transcriptEntries: [
            ...state.transcriptEntries,
            {
              blockId,
              answer,
            },
          ],
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
      resetInterviewState: () =>
        set({
          intake: null,
          answersByBlock: {},
          transcriptEntries: [],
          completedBlocks: {},
          lastResponse: null,
        }),
    }),
    {
      name: 'financial-agent-interview-store',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        intake: state.intake,
        completedBlocks: state.completedBlocks,
      }),
    }
  )
);
