import type { ContextFabricSessionSnapshot } from '@financial-agent/shared';

/** Payload from `GET /api/session` (flat user session object). */
export type SessionApiPayload = {
  id?: string;
  injectedIntake?: {
    intake?: Record<string, unknown>;
    intakeContext?: string;
    productsContext?: unknown;
    budgetContext?: unknown;
    [key: string]: unknown;
  } | null;
  injectedProfile?: unknown;
  productLifecycle?: {
    phase?: string;
    unlockedChats?: string[];
    closedChats?: string[];
    chatTurns?: Record<string, number>;
    actionPlanFunnelStage?: 'brainstorm' | 'converge' | 'deliver' | null;
    socialConsciousnessFunnelStage?: 'explore' | 'tension' | 'synthesis' | null;
    closingMode?: boolean;
  } | null;
  socialConsciousnessReflections?: {
    answers: Array<{
      questionId: string;
      question: string;
      choiceId: string;
      choiceLabel: string;
      choiceSubtext?: string;
      thinker?: string;
    }>;
    completedAt: string;
    updatedAt?: string;
  } | null;
  knowledgeScore?: number;
  name?: string;
  userId?: string;
  email?: string;
  role?: string;
  latestDiagnosticCompletedAt?: string | null;
  latestDiagnosticProfileId?: string | null;
  interviewVoice?: Record<string, unknown> | null;
  fincoinUsage?: Record<string, unknown> | null;
  contextFabric?: ContextFabricSessionSnapshot | null;
};
