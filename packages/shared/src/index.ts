// packages/shared/src/index.ts
export * from './interview.constants';
export * from './chat-lifecycle.constants';
export * from './action-plan-funnel';
export * from './budget-rows';
export * from './budget-chat-focus';
export * from './budget-chat-context';
export * from './budget-table-schema';
export * from './budget-chat-session';
export * from './transactions-chat';
export * from './evidence-fidelity';
export type {
    IntakeQuestionnaire,
    FinancialKnowledgeChecklist,
  } from './intake/intake-questionnaire.types';
export * from './welcome/welcome-intro.types';
export {
  WELCOME_FINTECH_DEFAULT_BENEFIT,
  WELCOME_FINTECH_DEFAULT_BODY,
  WELCOME_FINTECH_DEFAULT_TITLE,
  WELCOME_FINTECH_SIMULATION_BADGE,
  WELCOME_FINTECH_SIMULATION_CONTEXT,
  WELCOME_FINTECH_SIMULATION_DISCLAIMER,
  WELCOME_FINTECH_SIMULATION_LEAD,
  WELCOME_FINTECH_SLIDE_LABEL,
  WELCOME_RUTA_NEXT_HEADING,
  WELCOME_RUTA_UNLOCK_CHATS,
  WELCOME_RUTA_UNLOCK_INTRO,
} from './welcome/welcome-intro.copy';
export {
  buildWelcomeIntroFingerprint,
  canGenerateWelcomeIntroWithLlm,
  extractIntakeEnvelope,
  isValidWelcomeIntroCache,
  normalizeWelcomeIntroPayload,
  readCachedWelcomeIntro,
  readWelcomeIntroCache,
  readWelcomeIntroGenerationCount,
  stableStringify,
  withWelcomeIntroFirstName,
} from './welcome/welcome-intro.cache';
export * from './ui-events';
