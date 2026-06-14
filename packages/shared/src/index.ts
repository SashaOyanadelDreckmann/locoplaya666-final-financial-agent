// packages/shared/src/index.ts
export * from './entrevista/interview.constants';
export * from './entrevista/interview-voice-dossier';
export * from './chat/chat-lifecycle.constants';
export * from './chat/chat-closure-summary';
export * from './chat/chat-closure-carousel';
export * from './flujo/action-plan-funnel';
export * from './presupuesto/budget-rows';
export * from './presupuesto/budget-chat-focus';
export * from './presupuesto/budget-chat-context';
export * from './presupuesto/budget-table-schema';
export * from './presupuesto/budget-chat-session';
export * from './transacciones/transactions-chat';
export * from './transacciones/transactions-chat-planner';
export * from './transacciones/evidence-fidelity';
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
export * from './interfaz/ui-events';
export * from './fincoins/fincoin.constants';
export * from './agente/agent-stream';
export * from './agente/agent-stream-ui';
export * from './agente/agent-timeouts';
export * from './chat/chat-history';
export * from './chat/chat-pipelines';
export * from './transacciones/evidence-policy';
