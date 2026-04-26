import type { ChatAgentInput, ChatAgentResponse } from '../agents/core.agent/chat.types';

export type ProductChatId = 'chat-1' | 'chat-2' | 'chat-3';

export type OnboardingPhase =
  | 'intake_review'
  | 'budget_needed'
  | 'transactions_needed'
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
  actionReminders: Array<{
    id: string;
    title: string;
    proposedDate: string;
    sourceChatId: ProductChatId;
    status: 'proposed' | 'queued';
    createdAt: string;
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

const PRODUCT_CHAT_IDS: ProductChatId[] = ['chat-1', 'chat-2', 'chat-3'];
const MAX_CHAT_TURNS = 50;
const CLOSING_MODE_TURN = 30;

export function defaultProductLifecycleState(): ProductLifecycleState {
  return {
    phase: 'budget_needed',
    unlockedChats: ['chat-1'],
    chatTurns: { 'chat-1': 0, 'chat-2': 0, 'chat-3': 0 },
    closedChats: [],
    reports: [],
    actionReminders: [],
    updatedAt: new Date().toISOString(),
  };
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
      'chat-1': safeTurnCount(candidate.chatTurns?.['chat-1']),
      'chat-2': safeTurnCount(candidate.chatTurns?.['chat-2']),
      'chat-3': safeTurnCount(candidate.chatTurns?.['chat-3']),
    },
    closedChats,
    reports: Array.isArray(candidate.reports) ? candidate.reports.slice(-20) : [],
    actionReminders: Array.isArray(candidate.actionReminders)
      ? candidate.actionReminders.slice(-30)
      : [],
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

  const blocked =
    !unlockedChats.includes(activeChatId) ||
    updatedState.closedChats.includes(activeChatId) ||
    updatedState.chatTurns[activeChatId] >= MAX_CHAT_TURNS;

  const closingMode = updatedState.chatTurns[activeChatId] >= CLOSING_MODE_TURN;

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
        MAX_CHAT_TURNS,
        (params.state.chatTurns[params.activeChatId] ?? 0) + 1
      ),
    },
    updatedAt: new Date().toISOString(),
  };

  if (next.chatTurns[params.activeChatId] >= MAX_CHAT_TURNS && !next.closedChats.includes(params.activeChatId)) {
    next.closedChats = [...next.closedChats, params.activeChatId];
    next.reports = [
      {
        id: `report_${params.activeChatId}_${Date.now()}`,
        chatId: params.activeChatId,
        title: buildReportTitle(params.activeChatId),
        createdAt: new Date().toISOString(),
        summary: String(params.response.message ?? '').slice(0, 1200),
      },
      ...next.reports,
    ].slice(0, 20);
  }

  const actionProposal = inferActionReminder(params.input.user_message, params.response.message, params.activeChatId);
  if (actionProposal && params.activeChatId === 'chat-2') {
    next.actionReminders = [actionProposal, ...next.actionReminders].slice(0, 30);
  }

  return next;
}

export function lifecycleMeta(state: ProductLifecycleState, activeChatId: ProductChatId) {
  const turns = state.chatTurns[activeChatId] ?? 0;
  return {
    product_lifecycle: {
      phase: state.phase,
      active_chat_id: activeChatId,
      unlocked_chats: state.unlockedChats,
      closed_chats: state.closedChats,
      turn_count: turns,
      turns_remaining: Math.max(0, MAX_CHAT_TURNS - turns),
      closing_mode: turns >= CLOSING_MODE_TURN,
      reports_count: state.reports.length,
      latest_action_reminder: state.actionReminders[0] ?? null,
    },
  };
}

function derivePhase(
  input: ChatAgentInput,
  state: ProductLifecycleState,
  hasIntake: boolean
): OnboardingPhase {
  const ui = input.ui_state ?? {};
  const unlocked = (ui.unlocked_modules ?? {}) as Record<string, unknown>;
  const budgetSummary = (ui.budget_summary ?? {}) as Record<string, unknown>;
  const context = input.context ?? {};
  const hasBudget =
    Number(budgetSummary.income ?? 0) > 0 ||
    Number(budgetSummary.expenses ?? 0) > 0 ||
    unlocked.budget === true ||
    /\bpresupuesto|budget\b/i.test(input.user_message);
  const hasTransactions =
    unlocked.transactions === true ||
    Array.isArray(context.uploaded_documents) && context.uploaded_documents.length > 0 ||
    /\b(cartola|transacci[oó]n|movimiento|estado de cuenta)\b/i.test(input.user_message);
  const interviewSignal =
    /\b(entrevista|diagn[oó]stico final|diagnostico final|perfil financiero)\b/i.test(input.user_message) ||
    state.phase === 'diagnosis_ready' ||
    state.phase === 'advisory_unlocked';

  if (!hasIntake) return 'intake_review';
  if (!hasBudget) return 'budget_needed';
  if (!hasTransactions) return 'transactions_needed';
  if (!interviewSignal && state.phase !== 'diagnosis_ready' && state.phase !== 'advisory_unlocked') {
    return 'interview_needed';
  }
  if (state.phase === 'advisory_unlocked') return 'advisory_unlocked';
  return 'diagnosis_ready';
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
}) {
  const base = [
    'ARQUITECTURA DE PRODUCTO FINANCIERA MENTE:',
    'Opera como una aplicacion premium chilena, sobria, legalmente prudente y de alto valor.',
    'No prometas rentabilidades, no ejecutes decisiones por el usuario y respeta normativa CMF/SII cuando corresponda.',
    `Chat activo: ${params.activeChatId}. Interaccion actual: ${params.turnCount + 1}/50.`,
  ];

  if (params.closingMode) {
    base.push(
      'MODO CIERRE: desde la interaccion 30 debes conducir la conversacion hacia una conclusion util, concreta y documentable.'
    );
  }

  if (params.activeChatId === 'chat-1') {
    base.push(
      'CHAT 1 GENERAL: guia el onboarding. Primer objetivo: intake -> presupuesto -> cartolas/transacciones -> entrevista de 4 minutos -> diagnostico.',
      'Si falta presupuesto, recomienda subirlo o completarlo en el panel. Si falta cartola, recomienda subir transacciones del mes.',
      'Cuando ya exista presupuesto y cartola, recomienda una entrevista breve, profesional y consciente del tiempo.'
    );
  }

  if (params.activeChatId === 'chat-2') {
    base.push(
      'CHAT 2 PLAN DE ACCION E INVERSIONES: usa diagnostico, presupuesto, cartolas, RAG y regulacion para estructurar planes, simulaciones, graficos y fechas.',
      'Cuando propongas fechas concretas, emite un plan claro y prudente, indicando que el usuario debe confirmar recordatorios antes de enviar correos.'
    );
  }

  if (params.activeChatId === 'chat-3') {
    base.push(
      'CHAT 3 CONCIENCIA SOCIAL: discute filosofia, conciencia social y finanzas con criterio regulatorio. Mantente apegado a ley, CMF y prudencia profesional.'
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
    return 'Este chat ya fue cerrado y su informe quedo guardado en biblioteca.';
  }
  return 'Este chat alcanzo el limite de 50 interacciones.';
}

function normalizeChatId(value: unknown): ProductChatId {
  return PRODUCT_CHAT_IDS.includes(value as ProductChatId) ? (value as ProductChatId) : 'chat-1';
}

function safeTurnCount(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(MAX_CHAT_TURNS, Math.floor(n))) : 0;
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

function inferActionReminder(
  userMessage: string,
  agentMessage: string,
  sourceChatId: ProductChatId
): ProductLifecycleState['actionReminders'][number] | null {
  const text = `${userMessage}\n${agentMessage}`;
  const dateMatch = text.match(/\b(\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|\d{4}-\d{2}-\d{2})\b/);
  if (!dateMatch || !/\b(plan|accion|acción|invert|ahorr|pago|fecha|recordatorio)\b/i.test(text)) {
    return null;
  }
  return {
    id: `rem_${Date.now()}`,
    title: 'Recordatorio de plan de accion',
    proposedDate: dateMatch[1],
    sourceChatId,
    status: 'proposed',
    createdAt: new Date().toISOString(),
  };
}
