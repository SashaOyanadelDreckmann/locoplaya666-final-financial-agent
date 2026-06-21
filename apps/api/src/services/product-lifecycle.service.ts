import type { ChatAgentInput, ChatAgentResponse } from '../agents/core.agent/chat.types';
import {
  buildChatClosureSummary,
  buildSocialConsciousnessReportSummary,
  closingTurnForChat,
  maxTurnsForChat,
  resolveActionPlanFunnelStage,
  resolveSocialConsciousnessFunnelStage,
} from '@financial-agent/shared';
import { buildActionPlanFunnelDirective } from '../agents/core.agent/helpers/action-plan-funnel.helpers';
import { buildSocialConsciousnessFunnelDirective } from '../agents/core.agent/helpers/social-consciousness-funnel.helpers';

export type ProductChatId = 'chat-1' | 'chat-2' | 'chat-3';

export type OnboardingPhase =
  | 'intake_review'
  | 'transactions_needed'
  | 'budget_needed'
  | 'statement_analysis'
  | 'interview_needed'
  | 'diagnosis_ready'
  | 'advisory_unlocked';

export type ProductLifecycleState = {
  phase: OnboardingPhase;
  unlockedChats: ProductChatId[];
  chatTurns: Record<ProductChatId, number>;
  closedChats: ProductChatId[];
  reports: Array<{
    id: string;
    chatId: ProductChatId;
    title: string;
    createdAt: string;
    summary: string;
  }>;
  updatedAt: string;
};

export type LifecycleDecision = {
  state: ProductLifecycleState;
  activeChatId: ProductChatId;
  blocked: boolean;
  reason?: string;
  systemDirective: string;
  closingMode: boolean;
};

export type OnboardingSignals = {
  hasBudget: boolean;
  hasTransactions: boolean;
  interviewCompleted: boolean;
};

const PRODUCT_CHAT_IDS: ProductChatId[] = ['chat-1', 'chat-2', 'chat-3'];

export function defaultProductLifecycleState(): ProductLifecycleState {
  return {
    phase: 'transactions_needed',
    unlockedChats: ['chat-1'],
    chatTurns: { 'chat-1': 0, 'chat-2': 0, 'chat-3': 0 },
    closedChats: [],
    reports: [],
    updatedAt: new Date().toISOString(),
  };
}

function hasMeaningfulDocument(doc: unknown): boolean {
  if (!doc || typeof doc !== 'object') return false;
  const candidate = doc as Record<string, unknown>;
  return (
    typeof candidate.text === 'string' && candidate.text.trim().length > 0 ||
    typeof candidate.name === 'string' && candidate.name.trim().length > 0 ||
    typeof candidate.documentId === 'string' && candidate.documentId.trim().length > 0
  );
}

function hasPersistedTransactionContext(productsContext: Record<string, unknown>): boolean {
  const products = Array.isArray(productsContext.products) ? productsContext.products : [];
  const uploadedFiles = Array.isArray(productsContext.uploadedFiles) ? productsContext.uploadedFiles : [];
  const activeProduct = productsContext.activeProduct;
  const transactionSummary =
    productsContext.transactionSummary && typeof productsContext.transactionSummary === 'object'
      ? (productsContext.transactionSummary as Record<string, unknown>)
      : {};

  const hasProductMovements = products.some((product) => {
    if (!product || typeof product !== 'object') return false;
    const dashboard = (product as Record<string, unknown>).keyMetrics;
    const movements = (product as Record<string, unknown>).movements;
    return (
      Number((dashboard as Record<string, unknown> | undefined)?.movement_count ?? 0) > 0 ||
      (Array.isArray(movements) && movements.length > 0)
    );
  });

  const activeProductHasMovements =
    activeProduct && typeof activeProduct === 'object'
      ? Number(
          ((activeProduct as Record<string, unknown>).keyMetrics as Record<string, unknown> | undefined)
            ?.movement_count ?? 0
        ) > 0 ||
        Array.isArray((activeProduct as Record<string, unknown>).parsedDocuments) ||
        Array.isArray((activeProduct as Record<string, unknown>).documentPreviews)
      : false;

  return (
    Number(transactionSummary.movementCount ?? 0) > 0 ||
    hasProductMovements ||
    activeProductHasMovements ||
    uploadedFiles.length > 0
  );
}

export function detectOnboardingSignals(input: ChatAgentInput): OnboardingSignals {
  const ui = input.ui_state ?? {};
  const unlocked = (ui.unlocked_modules ?? {}) as Record<string, unknown>;
  const budgetSummary = (ui.budget_summary ?? {}) as Record<string, unknown>;
  const context = input.context ?? {};
  const injectedBudget = (context.injected_budget ?? {}) as Record<string, unknown>;
  const injectedIntake =
    context.injected_intake && typeof context.injected_intake === 'object'
      ? (context.injected_intake as Record<string, unknown>)
      : {};
  const productsContext =
    injectedIntake.productsContext && typeof injectedIntake.productsContext === 'object'
      ? (injectedIntake.productsContext as Record<string, unknown>)
      : {};
  const budgetContext =
    injectedIntake.budgetContext && typeof injectedIntake.budgetContext === 'object'
      ? (injectedIntake.budgetContext as Record<string, unknown>)
      : {};
  const persistedBudgetContext =
    context.persisted_budget_context && typeof context.persisted_budget_context === 'object'
      ? (context.persisted_budget_context as Record<string, unknown>)
      : {};
  const uploadedDocuments = Array.isArray(context.uploaded_documents) ? context.uploaded_documents : [];
  const consolidatedTransactions =
    context.consolidated_context &&
    typeof context.consolidated_context === 'object' &&
    (context.consolidated_context as Record<string, unknown>).transactions &&
    typeof (context.consolidated_context as Record<string, unknown>).transactions === 'object'
      ? ((context.consolidated_context as Record<string, unknown>).transactions as Record<string, unknown>)
      : {};

  const hasBudgetRows =
    Number(budgetSummary.rows_count ?? 0) > 0 ||
    Number(budgetContext.rowsCount ?? 0) > 0 ||
    Number(persistedBudgetContext.rowsCount ?? 0) > 0 ||
    (Array.isArray(ui.budget_rows) ? ui.budget_rows : []).some(
      (row) => Number((row as Record<string, unknown>).amount ?? 0) > 0,
    ) ||
    (Array.isArray(budgetContext.rows) ? budgetContext.rows : []).some(
      (row) => Number((row as Record<string, unknown>).amount ?? 0) > 0,
    ) ||
    (Array.isArray(persistedBudgetContext.rows) ? persistedBudgetContext.rows : []).some(
      (row) => Number((row as Record<string, unknown>).amount ?? 0) > 0,
    );

  const hasBudget =
    Number(budgetSummary.income ?? budgetContext.income ?? persistedBudgetContext.income ?? 0) > 0 ||
    Number(budgetSummary.expenses ?? budgetContext.expenses ?? persistedBudgetContext.expenses ?? 0) > 0 ||
    Number(injectedBudget.income ?? 0) > 0 ||
    Number(injectedBudget.expenses ?? 0) > 0 ||
    hasBudgetRows ||
    unlocked.budget === true;
  const hasTransactions =
    unlocked.transactions === true ||
    uploadedDocuments.some(hasMeaningfulDocument) ||
    Number(consolidatedTransactions.productsCount ?? 0) > 0 &&
      (Number(consolidatedTransactions.activeProductMovementCount ?? 0) > 0 ||
        Array.isArray(consolidatedTransactions.uploadedFiles) &&
          consolidatedTransactions.uploadedFiles.length > 0) ||
    hasPersistedTransactionContext(productsContext);
  const interviewCompleted =
    unlocked.post_diagnosis_chats === true ||
    (context.product_lifecycle &&
      typeof context.product_lifecycle === 'object' &&
      (context.product_lifecycle as Record<string, unknown>).interviewCompleted === true);

  return { hasBudget, hasTransactions, interviewCompleted };
}

export function hasValidatedProductsContext(input: ChatAgentInput): boolean {
  const context = input.context ?? {};
  const injectedIntake =
    context.injected_intake && typeof context.injected_intake === 'object'
      ? (context.injected_intake as Record<string, unknown>)
      : {};
  const productsContext =
    injectedIntake.productsContext && typeof injectedIntake.productsContext === 'object'
      ? (injectedIntake.productsContext as Record<string, unknown>)
      : {};
  return hasPersistedTransactionContext(productsContext);
}

export function getLifecycleFromMemory(memoryBlob: unknown): ProductLifecycleState {
  if (!memoryBlob || typeof memoryBlob !== 'object') return defaultProductLifecycleState();
  const raw = (memoryBlob as Record<string, unknown>).productLifecycle;
  if (!raw || typeof raw !== 'object') return defaultProductLifecycleState();

  const candidate = raw as Partial<ProductLifecycleState>;
  const base = defaultProductLifecycleState();
  const unlockedChats = Array.isArray(candidate.unlockedChats)
    ? candidate.unlockedChats.filter((id): id is ProductChatId =>
        PRODUCT_CHAT_IDS.includes(id as ProductChatId)
      )
    : base.unlockedChats;
  const closedChats = Array.isArray(candidate.closedChats)
    ? candidate.closedChats.filter((id): id is ProductChatId =>
        PRODUCT_CHAT_IDS.includes(id as ProductChatId)
      )
    : base.closedChats;

  return {
    phase: isOnboardingPhase(candidate.phase) ? candidate.phase : base.phase,
    unlockedChats: unlockedChats.includes('chat-1') ? unlockedChats : ['chat-1', ...unlockedChats],
    chatTurns: {
      'chat-1': safeTurnCount(candidate.chatTurns?.['chat-1'], 'chat-1'),
      'chat-2': safeTurnCount(candidate.chatTurns?.['chat-2'], 'chat-2'),
      'chat-3': safeTurnCount(candidate.chatTurns?.['chat-3'], 'chat-3'),
    },
    closedChats,
    reports: Array.isArray(candidate.reports) ? candidate.reports.slice(-20) : [],
    updatedAt:
      typeof candidate.updatedAt === 'string' ? candidate.updatedAt : new Date().toISOString(),
  };
}

export function buildLifecycleDecision(params: {
  input: ChatAgentInput;
  memoryBlob: unknown;
  hasIntake: boolean;
}): LifecycleDecision {
  const state = getLifecycleFromMemory(params.memoryBlob);
  const activeChatId = normalizeChatId(
    (params.input.ui_state?.active_chat as Record<string, unknown> | undefined)?.id
  );
  const phase = derivePhase(params.input, state, params.hasIntake);
  const unlockedChats = deriveUnlockedChats(phase);
  const updatedState: ProductLifecycleState = {
    ...state,
    phase,
    unlockedChats,
    updatedAt: new Date().toISOString(),
  };

  const maxTurns = maxTurnsForChat(activeChatId);
  const blocked =
    !unlockedChats.includes(activeChatId) ||
    updatedState.closedChats.includes(activeChatId) ||
    updatedState.chatTurns[activeChatId] >= maxTurns;

  const closingMode = updatedState.chatTurns[activeChatId] >= closingTurnForChat(activeChatId);
  const userMessage = String(params.input.user_message ?? '');

  const onboardingSignals = detectOnboardingSignals(params.input);

  return {
    state: updatedState,
    activeChatId,
    blocked,
    reason: blocked ? buildBlockedReason(activeChatId, updatedState) : undefined,
    systemDirective: buildSystemDirective({
      phase,
      activeChatId,
      turnCount: updatedState.chatTurns[activeChatId],
      closingMode,
      hasIntake: params.hasIntake,
      userMessage,
      onboardingSignals,
    }),
    closingMode,
  };
}

export function applyLifecycleAfterResponse(params: {
  state: ProductLifecycleState;
  activeChatId: ProductChatId;
  input: ChatAgentInput;
  response: ChatAgentResponse;
}): ProductLifecycleState {
  const next: ProductLifecycleState = {
    ...params.state,
    chatTurns: {
      ...params.state.chatTurns,
      [params.activeChatId]: Math.min(
        maxTurnsForChat(params.activeChatId),
        (params.state.chatTurns[params.activeChatId] ?? 0) + 1
      ),
    },
    updatedAt: new Date().toISOString(),
  };

  if (
    next.chatTurns[params.activeChatId] >= maxTurnsForChat(params.activeChatId) &&
    !next.closedChats.includes(params.activeChatId)
  ) {
    next.closedChats = [...next.closedChats, params.activeChatId];
    next.reports = [
      {
        id: `report_${params.activeChatId}_${Date.now()}`,
        chatId: params.activeChatId,
        title: buildReportTitle(params.activeChatId),
        createdAt: new Date().toISOString(),
        summary:
          params.activeChatId === 'chat-3'
            ? buildSocialConsciousnessReportSummary(String(params.response.message ?? ''))
            : String(params.response.message ?? '').slice(0, 1200),
      },
      ...next.reports,
    ].slice(0, 20);
  }

  return next;
}

export function lifecycleMeta(
  state: ProductLifecycleState,
  activeChatId: ProductChatId,
  params?: {
    userMessage?: string;
    assistantMessage?: string;
    messages?: Array<{ role: 'user' | 'assistant'; content: string }>;
  },
) {
  const turns = state.chatTurns[activeChatId] ?? 0;
  const turnsRemaining = Math.max(0, maxTurnsForChat(activeChatId) - turns);
  const closingMode = turns >= closingTurnForChat(activeChatId);
  const actionPlanStage =
    activeChatId === 'chat-2'
      ? resolveActionPlanFunnelStage({
          activeChatId,
          turnCount: turns,
          closingMode,
          userMessage: params?.userMessage,
        }) ?? 'brainstorm'
      : undefined;
  const socialConsciousnessStage =
    activeChatId === 'chat-3'
      ? resolveSocialConsciousnessFunnelStage({
          activeChatId,
          turnCount: turns,
          closingMode,
          userMessage: params?.userMessage,
        }) ?? 'explore'
      : undefined;

  return {
    product_lifecycle: {
      phase: state.phase,
      active_chat_id: activeChatId,
      unlocked_chats: state.unlockedChats,
      closed_chats: state.closedChats,
      turn_count: turns,
      turns_remaining: turnsRemaining,
      closing_mode: closingMode,
      reports_count: state.reports.length,
      action_plan_funnel_stage: actionPlanStage,
      social_consciousness_funnel_stage: socialConsciousnessStage,
      closing_summary:
        turnsRemaining <= 0
          ? buildChatClosureSummary({
              chatId: activeChatId,
              messages: params?.messages,
              userMessage: params?.userMessage,
              assistantMessage: params?.assistantMessage,
              turnsRemaining,
            })
          : undefined,
    },
  };
}

function derivePhase(
  input: ChatAgentInput,
  state: ProductLifecycleState,
  hasIntake: boolean
): OnboardingPhase {
  const { hasBudget, hasTransactions, interviewCompleted } = detectOnboardingSignals(input);
  const diagnosisCompleted =
    interviewCompleted ||
    state.phase === 'diagnosis_ready' ||
    state.phase === 'advisory_unlocked';

  if (!hasIntake) return 'intake_review';

  // One interview + one diagnosis per user: never regress phase or re-lock chats
  // when panel data (budget rows, products) is cleared after completion.
  if (diagnosisCompleted) {
    if (state.phase === 'advisory_unlocked') return 'advisory_unlocked';
    return 'diagnosis_ready';
  }

  if (!hasTransactions) return 'transactions_needed';
  if (!hasBudget) return 'budget_needed';
  return 'interview_needed';
}

function deriveUnlockedChats(phase: OnboardingPhase): ProductChatId[] {
  if (phase === 'diagnosis_ready' || phase === 'advisory_unlocked') {
    return ['chat-1', 'chat-2', 'chat-3'];
  }
  return ['chat-1'];
}

function buildSystemDirective(params: {
  phase: OnboardingPhase;
  activeChatId: ProductChatId;
  turnCount: number;
  closingMode: boolean;
  hasIntake: boolean;
  userMessage?: string;
  onboardingSignals?: OnboardingSignals;
}) {
  const maxTurns = maxTurnsForChat(params.activeChatId);
  const base = [
    'ARQUITECTURA DE PRODUCTO FINANCIERA MENTE:',
    'Opera como una aplicacion premium chilena, sobria, legalmente prudente y de alto valor.',
    'No prometas rentabilidades, no ejecutes decisiones por el usuario y respeta normativa CMF/SII cuando corresponda.',
    `Chat activo: ${params.activeChatId}. Interaccion actual: ${params.turnCount + 1}/${maxTurns}.`,
  ];

  if (params.closingMode) {
    const closingTurn = closingTurnForChat(params.activeChatId);
    base.push(
      `MODO CIERRE: desde la interaccion ${closingTurn + 1}/${maxTurns} debes conducir la conversacion hacia una conclusion util, concreta y documentable.`
    );
  }

  if (params.activeChatId === 'chat-1') {
    const signals = params.onboardingSignals;
    const diagnosisPhase =
      params.phase === 'diagnosis_ready' || params.phase === 'advisory_unlocked';
    const postDiagnosis = diagnosisPhase || signals?.interviewCompleted === true;

    base.push(
      'CHAT 1 GENERAL: responde primero la pregunta del usuario con naturalidad y tono humano.',
      'No empujes entrevista, presupuesto ni cartolas en preguntas off-topic (politica, cultura general, saludos, meta-preguntas sobre el chat).',
    );

    if (postDiagnosis) {
      base.push(
        'CHAT 1 POST-DIAGNOSTICO: el usuario ya cerro entrevista y diagnostico integrado.',
        'Usa context.profile, context.budget_rows, context.financial_evidence y consolidated_context.transactions como evidencia primaria.',
        'NUNCA pidas re-subir presupuesto ni cartolas si financial_evidence indica que ya estan cargados.',
        'Personaliza con cifras reales del presupuesto y movimientos; no inventes vacios de datos ya presentes.',
        'Solo declara "dato faltante" para huecos reales (ej. meta de ahorro especifica si no esta en intake y la pregunta lo exige).',
      );
      if (signals?.hasBudget) {
        base.push('PRESUPUESTO VERIFICADO EN CONTEXTO: no listes gastos reales como faltantes.');
      }
      if (signals?.hasTransactions) {
        base.push('CARTOLAS/PRODUCTOS VERIFICADOS EN CONTEXTO: no pidas volver a subir movimientos del mes.');
      }
    } else {
      base.push(
        'Onboarding (intake -> cartolas -> presupuesto -> entrevista -> diagnostico) solo si la pregunta es financiera o el usuario pide orientacion sobre su plan.',
      );
      if (!signals?.hasTransactions) {
        base.push(
          'Si faltan cartolas o movimientos reales y el usuario pregunta por su situacion, recomienda subir transacciones del mes.',
        );
      }
      if (signals?.hasTransactions && !signals?.hasBudget) {
        base.push('Si ya existen cartolas pero falta presupuesto, invita a completar presupuesto antes de entrevista.');
      }
      if (signals?.hasBudget && signals?.hasTransactions && !signals?.interviewCompleted) {
        base.push('Cuando exista presupuesto y cartola, puedes ofrecer entrevista breve y consciente del tiempo.');
      }
    }
  }

  if (params.activeChatId === 'chat-2') {
    const funnelStage =
      resolveActionPlanFunnelStage({
        activeChatId: 'chat-2',
        turnCount: params.turnCount,
        closingMode: params.closingMode,
        userMessage: params.userMessage,
      }) ?? 'brainstorm';
    base.push(
      'CHAT 2 PLAN DE ACCION: embudo conversacional — lluvia de ideas → convergencia → plan final (ultimas 2 interacciones).',
      'CHAT 2 GENERAL: responde primero la pregunta; breve, preciso, justificado con evidencia verificable del usuario.',
      'Cada recomendacion: accion → porque [dato del presupuesto/cartola/diagnostico] → impacto; sin relleno ni repetir el hilo.',
      'En brainstorm/convergencia: max ~120-150 palabras, 1 pregunta de cierre.',
      'No ofrezcas correos, recordatorios externos ni automatizaciones fuera del chat.',
      buildActionPlanFunnelDirective(funnelStage),
    );
    if (params.closingMode && funnelStage === 'converge') {
      base.push(
        'CIERRE PROGRESIVO: sintetiza acuerdos del hilo y valida 1 decision pendiente; NO emitas aun el documento ejecutivo completo.',
      );
    }
  }

  if (params.activeChatId === 'chat-3') {
    const funnelStage =
      resolveSocialConsciousnessFunnelStage({
        activeChatId: 'chat-3',
        turnCount: params.turnCount,
        closingMode: params.closingMode,
        userMessage: params.userMessage,
      }) ?? 'explore';
    base.push(
      'CHAT 3 CONCIENCIA SOCIAL: modo filosofo socratico. Conecta finanzas con valores, sociedad y existencia.',
      'CHAT 3 GENERAL: responde primero lo que el usuario planteo (duda, tema o objecion); luego continua la etapa socratica.',
      'No des recomendaciones financieras directas salvo peticion explicita de aterrizar a numeros o marco regulatorio.',
      buildSocialConsciousnessFunnelDirective(funnelStage),
    );
  }

  base.push(`Fase actual del producto: ${params.phase}.`);
  return base.join('\n');
}

function buildBlockedReason(chatId: ProductChatId, state: ProductLifecycleState) {
  if (!state.unlockedChats.includes(chatId)) {
    return 'Este chat se desbloquea despues del diagnostico integrado con intake, presupuesto, cartolas y entrevista.';
  }
  if (state.closedChats.includes(chatId)) {
    return 'Este chat ya fue cerrado. Puedes exportar el contenido con Guardar PDF y revisarlo en biblioteca.';
  }
  return `Este chat alcanzo el limite de ${maxTurnsForChat(chatId)} interacciones.`;
}

function normalizeChatId(value: unknown): ProductChatId {
  return PRODUCT_CHAT_IDS.includes(value as ProductChatId) ? (value as ProductChatId) : 'chat-1';
}

function safeTurnCount(value: unknown, chatId: ProductChatId) {
  const n = Number(value);
  const max = maxTurnsForChat(chatId);
  return Number.isFinite(n) ? Math.max(0, Math.min(max, Math.floor(n))) : 0;
}

function isOnboardingPhase(value: unknown): value is OnboardingPhase {
  return (
    value === 'intake_review' ||
    value === 'budget_needed' ||
    value === 'transactions_needed' ||
    value === 'statement_analysis' ||
    value === 'interview_needed' ||
    value === 'diagnosis_ready' ||
    value === 'advisory_unlocked'
  );
}

function buildReportTitle(chatId: ProductChatId) {
  if (chatId === 'chat-2') return 'Informe de plan de accion e inversiones';
  if (chatId === 'chat-3') return 'Informe de conciencia social financiera';
  return 'Informe de diagnostico general';
}
