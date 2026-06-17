// packages/shared/src/index.ts
export * from './entrevista/interview.constants';
export * from './entrevista/interview-voice-dossier';
export * from './entrevista/interview-voice-quota';
export * from './chat/chat-lifecycle.constants';
export * from './chat/chat-closure-summary';
export * from './chat/chat-closure-carousel';
export * from './flujo/action-plan-funnel';
export * from './flujo/action-plan-session';
export * from './flujo/social-consciousness-funnel';
export * from './presupuesto/budget-rows';
export * from './presupuesto/budget-chat-focus';
export * from './presupuesto/budget-chat-context';
export * from './presupuesto/budget-movement-feed';
export * from './presupuesto/budget-table-schema';
export * from './presupuesto/budget-table-mutate';
export * from './presupuesto/budget-chat-session';
export * from './transacciones/transactions-chat';
export * from './transacciones/transactions-chat-planner';
export * from './transacciones/evidence-fidelity';
export type {
    IntakeQuestionnaire,
    FinancialKnowledgeChecklist,
  } from './intake/intake-questionnaire.types';
export type { SessionIntakeEnvelope } from './intake/intake-access';
export {
  hasCompletedIntakeAccess,
  hasMeaningfulIntake,
  readSessionIntakeEnvelope,
} from './intake/intake-access';
export {
  EMPTY_FINANCIAL_KNOWLEDGE,
  normalizeFinancialKnowledge,
  normalizeIntakeQuestionnaire,
  normalizeIntakeQuestionnaireFromRecord,
  normalizeIntakeBodyForValidation,
} from './intake/intake-normalize';
export * from './welcome/welcome-intro.types';
export * from './welcome/welcome-guide.types';
export {
  buildChat1WelcomeGuideActions,
  buildChat2WelcomeGuideActions,
  buildChat3WelcomeGuideActions,
  buildProductSearchQueries,
  buildWelcomeGuideEnrichment,
  formatProductHintsBlurb,
  shouldIncludeWelcomeProductRecommendations,
} from './welcome/welcome-guide.helpers';
export {
  WELCOME_MARCO_DEFAULT_BODY,
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
export * from './agente/questionnaire-response-mode';
export * from './agente/agent-stream';
export * from './agente/agent-stream-sanitize';
export * from './agente/structured-agent-tags';
export * from './agente/agent-stream-ui';
export * from './agente/agent-timeouts';
export * from './agente/agent-transport';
export * from './chat/chat-history';
export * from './chat/chat-pipelines';
export * from './transacciones/evidence-policy';
export * from './transacciones/transaction-chart-blocks';
export * from './diagnostico/compact-diagnosis-list';
export * from './context';
