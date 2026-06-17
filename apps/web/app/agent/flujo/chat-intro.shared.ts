import { extractIntakeEnvelope, type WelcomeGuideAction, type WelcomeProductHint } from '@financial-agent/shared';
import type { ChatItem } from '@/lib/agente/agent.response.types';
import type { ExecutiveCarouselTone } from '@/components/ui/executive-blob-carousel';
import type { DiagnosisProfile, FinancialProfileTraits } from '@/state/profile.store';
import {
  isRecoverableChatErrorMessage,
  isWelcomeShellMessageContent,
} from './welcome-intro.shared';

export type ChatIntroId = 'chat-1' | 'chat-2' | 'chat-3';

export type ChatIntroContent = {
  chatId: ChatIntroId;
  kicker: string;
  title: string;
  message: string;
  signals: string[];
  epigraph?: { quote: string; attribution: string };
  tone: ExecutiveCarouselTone;
  guideActions?: WelcomeGuideAction[];
  productHints?: WelcomeProductHint[];
  productBlurb?: string;
};

export const CHAT3_WILDE_EPIGRAPH = {
  quote: 'El precio de todo y el valor de nada.',
  attribution: 'Oscar Wilde',
} as const;

type DiagnosisContext = {
  hasDiagnosis: boolean;
  narrativeLead: string | null;
  headline: string | null;
  dek: string | null;
  topTension: string | null;
  topHypothesis: string | null;
  keySignals: string[];
  traitHints: string[];
  intakeSummary: string | null;
};

function readFirstName(session: { name?: string | null } | null | undefined): string {
  return String(session?.name ?? '').split(' ')[0]?.trim() || 'Hola';
}

function truncateLead(text: string, max = 140): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) return normalized;
  const slice = normalized.slice(0, max);
  const lastSpace = slice.lastIndexOf(' ');
  return `${(lastSpace > 80 ? slice.slice(0, lastSpace) : slice).trim()}…`;
}

function firstSentence(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const match = normalized.match(/^(.+?[.!?])(?:\s|$)/);
  return match?.[1]?.trim() ?? truncateLead(normalized, 120);
}

function traitLabel(key: keyof FinancialProfileTraits, value: string): string | null {
  const labels: Record<string, Record<string, string>> = {
    financialPressure: {
      low: 'Presión financiera contenida',
      moderate: 'Presión financiera moderada',
      high: 'Presión financiera alta',
    },
    decisionStyle: {
      reactive: 'Decisiones reactivas',
      analytical: 'Estilo analítico',
      avoidant: 'Evitación decisional',
      delegated: 'Decisiones delegadas',
      mixed: 'Estilo mixto',
    },
    timeHorizon: {
      short_term: 'Horizonte corto',
      mixed: 'Horizonte mixto',
      long_term: 'Horizonte largo',
    },
    emotionalPattern: {
      neutral: 'Patrón emocional estable',
      anxious: 'Ansiedad financiera',
      avoidant: 'Evitación emocional',
      controlling: 'Control elevado del gasto',
      conflicted: 'Conflicto emocional con el dinero',
    },
    financialClarity: {
      low: 'Claridad financiera baja',
      medium: 'Claridad financiera media',
      high: 'Claridad financiera alta',
    },
  };

  return labels[key]?.[value] ?? null;
}

function readTraitHints(profile?: DiagnosisProfile | null): string[] {
  const traits = profile?.profile;
  if (!traits || typeof traits !== 'object') return [];

  const hints: string[] = [];
  for (const key of [
    'financialPressure',
    'decisionStyle',
    'timeHorizon',
    'emotionalPattern',
    'financialClarity',
  ] as const) {
    const value = (traits as FinancialProfileTraits)[key];
    if (typeof value !== 'string') continue;
    const label = traitLabel(key, value);
    if (label) hints.push(label);
  }
  return hints.slice(0, 2);
}

export function resolveDiagnosisContext(
  diagnosisProfile?: DiagnosisProfile | null,
  session?: { injectedIntake?: unknown } | null,
): DiagnosisContext {
  const narrative = diagnosisProfile?.diagnosticNarrative?.trim() ?? '';
  const editorial = diagnosisProfile?.editorial;
  const { llmSummary } = extractIntakeEnvelope(session?.injectedIntake);
  const intakeSummary =
    typeof llmSummary?.summary === 'string' && llmSummary.summary.trim()
      ? truncateLead(llmSummary.summary.trim(), 120)
      : null;

  return {
    hasDiagnosis:
      narrative.length > 0 || Boolean(editorial?.headline?.trim()) || Boolean(editorial?.keySignals?.length),
    narrativeLead: narrative ? firstSentence(narrative) : null,
    headline: editorial?.headline?.trim() || null,
    dek: editorial?.dek?.trim() || null,
    topTension: diagnosisProfile?.tensions?.find((item) => item.trim())?.trim() ?? null,
    topHypothesis: diagnosisProfile?.hypotheses?.find((item) => item.trim())?.trim() ?? null,
    keySignals: Array.isArray(editorial?.keySignals)
      ? editorial!.keySignals!.filter((item) => typeof item === 'string' && item.trim()).slice(0, 3)
      : [],
    traitHints: readTraitHints(diagnosisProfile),
    intakeSummary,
  };
}

function readIntakeSignals(session?: { injectedIntake?: unknown } | null): string[] {
  const { intake } = extractIntakeEnvelope(session?.injectedIntake);
  const signals: string[] = [];
  const incomeBand = typeof intake.incomeBand === 'string' ? intake.incomeBand : '';
  const city = typeof intake.city === 'string' ? intake.city.trim() : '';
  const stress = typeof intake.moneyStressLevel === 'number' ? intake.moneyStressLevel : null;

  if (incomeBand) signals.push(`Tramo ${incomeBand}`);
  if (city) signals.push(city);
  if (stress !== null && stress >= 7) signals.push('Estrés elevado');
  if (typeof intake.hasDebt === 'boolean' && intake.hasDebt) signals.push('Deuda activa');
  if (typeof intake.hasSavingsOrInvestments === 'boolean' && intake.hasSavingsOrInvestments) {
    signals.push('Con ahorro o inversión');
  }
  return signals.slice(0, 3);
}

function buildIntroSignals(
  diagnosis: DiagnosisContext,
  session?: { injectedIntake?: unknown } | null,
): string[] {
  if (diagnosis.keySignals.length > 0) {
    return diagnosis.keySignals.map(normalizePhrase).slice(0, 3);
  }
  if (diagnosis.traitHints.length > 0) return diagnosis.traitHints.slice(0, 3);
  return readIntakeSignals(session);
}

function diagnosisLeadLine(
  diagnosis: DiagnosisContext,
  formatter: (headline: string) => string,
): string | null {
  if (diagnosis.headline) return formatter(diagnosis.headline);
  if (diagnosis.narrativeLead) return truncateLead(diagnosis.narrativeLead, 160);
  return null;
}

function normalizePhrase(text: string): string {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (!trimmed) return trimmed;
  if (trimmed === trimmed.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(trimmed)) {
    const lower = trimmed.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function formatClp(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return Math.round(value).toLocaleString('es-CL');
}

function readBudgetSnapshot(session?: { injectedIntake?: unknown } | null): string | null {
  if (!session?.injectedIntake || typeof session.injectedIntake !== 'object') return null;

  const root = session.injectedIntake as Record<string, unknown>;
  const raw = root.__budgetContext ?? root.budgetContext;
  if (!raw || typeof raw !== 'object') return null;

  const budget = raw as Record<string, unknown>;
  const kpis =
    budget.kpis && typeof budget.kpis === 'object'
      ? (budget.kpis as Record<string, unknown>)
      : budget;
  const income = Number(kpis.income ?? budget.income);
  const expenses = Number(kpis.expenses ?? budget.expenses);
  const health = Number(kpis.healthScore ?? budget.healthScore);

  if (!Number.isFinite(income) && !Number.isFinite(expenses)) return null;

  const parts = [
    Number.isFinite(income) ? `ingreso $${formatClp(income)}` : null,
    Number.isFinite(expenses) ? `gasto $${formatClp(expenses)}` : null,
    Number.isFinite(health) && health > 0 ? `salud ${Math.round(health)}/100` : null,
  ].filter(Boolean);

  return parts.length > 0 ? `En presupuesto: ${parts.join(', ')}.` : null;
}

function joinSentences(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => part?.trim())
    .filter(Boolean)
    .map((part) => {
      if (/[.!?]$/.test(part!)) return part;
      if (part!.includes('¿')) return `${part}?`;
      return `${part}.`;
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function chatObjective(chatId: ChatIntroId, diagnosisUnlocked?: boolean): string {
  if (chatId === 'chat-2') {
    return 'convertimos tu diagnóstico en un plan de acción ejecutivo';
  }
  if (chatId === 'chat-3') {
    return 'conectamos tus decisiones financieras con propósito e impacto social';
  }
  if (diagnosisUnlocked) {
    return 'sintetizamos tu caso y definimos el siguiente movimiento';
  }
  return 'ordenamos tu situación con cartolas, presupuesto y entrevista';
}

function buildChat3Message(params: {
  firstName: string;
  city: string;
  diagnosis: DiagnosisContext;
  diagnosisProfile?: DiagnosisProfile | null;
  session?: { injectedIntake?: unknown } | null;
  hasDiagnosis: boolean;
}): string {
  const { firstName, city, diagnosis, diagnosisProfile, session, hasDiagnosis } = params;
  const placeHint = city ? ` desde ${city}` : '';
  const budgetLine = readBudgetSnapshot(session);

  return joinSentences([
    `${firstName}${placeHint}, ${chatObjective('chat-3')}.`,
    'Aquí el dinero es espejo: lo que gastas, ahorras o evitas dice quién eres.',
    hasDiagnosis
      ? joinSentences([
          diagnosisLeadLine(diagnosis, (headline) => `Diagnóstico: «${headline}»`),
          diagnosis.topTension
            ? `Tensión a explorar: ${normalizePhrase(diagnosis.topTension)}`
            : null,
          budgetLine,
        ])
      : joinSentences(['Partimos de tu diagnóstico para leer propósito e impacto', budgetLine]),
    diagnosisProfile?.openQuestions?.[0]
      ? normalizePhrase(diagnosisProfile.openQuestions[0])
      : '¿Tu plata construye el mundo que quieres vivir?',
  ]);
}

function buildDiagnosisBackedMessage(params: {
  chatId: ChatIntroId;
  firstName: string;
  diagnosis: DiagnosisContext;
  diagnosisProfile?: DiagnosisProfile | null;
  session?: { injectedIntake?: unknown } | null;
  diagnosisUnlocked?: boolean;
  city?: string;
}): string {
  const {
    chatId,
    firstName,
    diagnosis,
    diagnosisProfile,
    session,
    diagnosisUnlocked,
    city = '',
  } = params;

  const budgetLine = readBudgetSnapshot(session);

  if (chatId === 'chat-2') {
    return joinSentences([
      `${firstName}, ${chatObjective('chat-2')}.`,
      diagnosisLeadLine(diagnosis, (headline) => `Base: «${headline}»`),
      diagnosis.topTension
        ? `Foco tentativo: ${normalizePhrase(diagnosis.topTension)}`
        : diagnosis.topHypothesis
          ? `Hipótesis: ${normalizePhrase(diagnosis.topHypothesis)}`
          : null,
      budgetLine,
    ]);
  }

  if (chatId === 'chat-3') {
    return buildChat3Message({
      firstName,
      city,
      diagnosis,
      diagnosisProfile,
      session,
      hasDiagnosis: diagnosis.hasDiagnosis,
    });
  }

  if (diagnosisUnlocked) {
    return joinSentences([
      `${firstName}, ${chatObjective('chat-1', true)}.`,
      diagnosisLeadLine(diagnosis, (headline) => `Diagnóstico: «${headline}»`),
      diagnosis.topTension ? `Pesa ${normalizePhrase(diagnosis.topTension)}` : null,
      budgetLine,
    ]);
  }

  const lead = diagnosis.intakeSummary ?? diagnosis.narrativeLead;
  return joinSentences([
    `${firstName}, ${chatObjective('chat-1', false)}.`,
    lead ? `Lectura inicial: ${normalizePhrase(lead)}` : null,
    budgetLine,
  ]);
}

function buildFallbackMessage(params: {
  chatId: ChatIntroId;
  firstName: string;
  diagnosisUnlocked?: boolean;
  city?: string;
}): string {
  const { chatId, firstName, diagnosisUnlocked, city = '' } = params;

  if (chatId === 'chat-2') {
    return joinSentences([
      `${firstName}, ${chatObjective('chat-2')}.`,
      'Cruzaremos presupuesto, cartolas y mercado para priorizar acciones concretas.',
    ]);
  }

  if (chatId === 'chat-3') {
    return buildChat3Message({
      firstName,
      city,
      diagnosis: resolveDiagnosisContext(null, null),
      hasDiagnosis: false,
    });
  }

  return joinSentences([
    `${firstName}, ${chatObjective('chat-1', diagnosisUnlocked)}`,
    diagnosisUnlocked
      ? 'Completa el diagnóstico en el panel para personalizar esta lectura con tu evidencia real'
      : 'Integra productos, presupuesto y entrevista para cerrar un diagnóstico verificable',
    '¿Cuál es tu prioridad principal ahora',
  ]);
}

export function buildChatIntroContent(params: {
  chatId: ChatIntroId;
  session?: { name?: string | null; injectedIntake?: unknown } | null;
  diagnosisProfile?: DiagnosisProfile | null;
  diagnosisUnlocked?: boolean;
  productHints?: WelcomeProductHint[];
  guideActions?: WelcomeGuideAction[];
  productBlurb?: string;
}): ChatIntroContent {
  const firstName = readFirstName(params.session);
  const diagnosis = resolveDiagnosisContext(params.diagnosisProfile, params.session);
  const { intake } = extractIntakeEnvelope(params.session?.injectedIntake);
  const city = typeof intake.city === 'string' ? intake.city.trim() : '';
  const hasDiagnosisProfile = Boolean(
    params.diagnosisProfile?.diagnosticNarrative?.trim() ||
      params.diagnosisProfile?.editorial?.headline?.trim(),
  );

  const messageBase =
    hasDiagnosisProfile || diagnosis.hasDiagnosis
      ? buildDiagnosisBackedMessage({
          chatId: params.chatId,
          firstName,
          diagnosis,
          diagnosisProfile: params.diagnosisProfile,
          session: params.session,
          diagnosisUnlocked: params.diagnosisUnlocked,
          city,
        })
      : buildFallbackMessage({
          chatId: params.chatId,
          firstName,
          diagnosisUnlocked: params.diagnosisUnlocked,
          city,
        });

  const message = params.productBlurb
    ? joinSentences([messageBase, `Mercado verificable: ${params.productBlurb}`])
    : messageBase;

  const titles: Record<ChatIntroId, { kicker: string; fallback: string; tone: ExecutiveCarouselTone }> = {
    'chat-1': {
      kicker: params.diagnosisUnlocked
        ? 'Financieramente · Chat general'
        : 'Financieramente · Lectura base',
      fallback: params.diagnosisUnlocked ? 'Síntesis de tu caso' : 'Diagnóstico financiero inicial',
      tone: 'gold',
    },
    'chat-2': {
      kicker: 'Financieramente · Estrategia',
      fallback: 'Plan de acción personalizado',
      tone: 'slate',
    },
    'chat-3': {
      kicker: 'Financieramente · Conciencia social',
      fallback: 'Criterio financiero con propósito',
      tone: 'gold',
    },
  };

  const meta = titles[params.chatId];
  const signals = buildIntroSignals(diagnosis, params.session);

  return {
    chatId: params.chatId,
    kicker: meta.kicker,
    title: diagnosis.headline ?? meta.fallback,
    message,
    signals,
    epigraph: params.chatId === 'chat-3' ? CHAT3_WILDE_EPIGRAPH : undefined,
    tone: meta.tone,
    guideActions: params.guideActions,
    productHints: params.productHints,
    productBlurb: params.productBlurb,
  };
}

export function buildDiagnosisDeepenIntroContent(params: {
  session?: { name?: string | null; injectedIntake?: unknown } | null;
  diagnosisProfile?: DiagnosisProfile | null;
  voiceFindings?: string[];
}): ChatIntroContent {
  const firstName = readFirstName(params.session);
  const diagnosis = resolveDiagnosisContext(params.diagnosisProfile, params.session);
  const openQuestion = params.diagnosisProfile?.openQuestions?.find((item) => item.trim())?.trim() ?? null;
  const loadedBlocks = [
    'narrativa diagnóstica',
    'perfil financiero',
    params.diagnosisProfile?.tensions?.some((item) => item.trim()) ? 'tensiones' : null,
    params.diagnosisProfile?.hypotheses?.some((item) => item.trim()) ? 'hipótesis' : null,
    openQuestion ? 'preguntas abiertas' : null,
    params.voiceFindings?.length ? 'síntesis de la entrevista' : null,
  ].filter(Boolean);

  const message = joinSentences([
    `${firstName}, ya integré tu diagnóstico completo en este chat`,
    loadedBlocks.length
      ? `Confirmo que tengo cargados ${loadedBlocks.join(', ')} y el contexto de tu entrevista`
      : 'Confirmo que tengo cargado el contexto completo de tu entrevista y diagnóstico',
    diagnosisLeadLine(diagnosis, (headline) => `La lectura central cierra en «${headline}»`),
    diagnosis.topTension ? `La tensión principal es ${normalizePhrase(diagnosis.topTension)}` : null,
    diagnosis.topHypothesis ? `Una hipótesis a revisar: ${normalizePhrase(diagnosis.topHypothesis)}` : null,
    openQuestion ? `Dejamos abierta esta pregunta: ${normalizePhrase(openQuestion)}` : null,
    'Dime por dónde quieres profundizar y avanzamos con pasos concretos',
  ]);

  return {
    chatId: 'chat-1',
    kicker: 'Financieramente · Chat general',
    title: diagnosis.headline ?? 'Diagnóstico integrado',
    message,
    signals: buildIntroSignals(diagnosis, params.session),
    tone: 'gold',
  };
}

/** Plain-text openings seeded before the gradient intro shells. */
export function isLegacyChatIntroItem(item: ChatItem, chatId: string): boolean {
  if (item.type !== 'message' || item.role !== 'assistant') return false;
  if (isWelcomeShellMessageContent(item.content)) return false;

  const text = String(item.content ?? '').trim();
  if (!text) return false;

  if (chatId === 'chat-2') {
    return /lluvia de ideas senior|plan de acci[oó]n ejecutivo|convergemos hasta|priorizamos primero caja/i.test(
      text,
    );
  }

  if (chatId === 'chat-3') {
    return /precio de todo|oscar wilde|decisi[oó]n moral|conciencia social|n[uú]meros revelan/i.test(
      text,
    );
  }

  return false;
}

function coerceChatIntroShellItem(
  item: Extract<ChatItem, { type: 'message'; role: 'assistant' }>,
): Extract<ChatItem, { type: 'message'; role: 'assistant' }> {
  return {
    ...item,
    content: '',
    agent_blocks: [],
    suggested_replies: [],
  };
}

function migrateLegacyChatIntroShell(items: ChatItem[], chatId: ChatIntroId): ChatItem[] {
  const firstAssistantIdx = items.findIndex(
    (item) => item.type === 'message' && item.role === 'assistant',
  );
  if (firstAssistantIdx < 0) return items;

  const firstAssistant = items[firstAssistantIdx];
  if (firstAssistant.type !== 'message' || firstAssistant.role !== 'assistant') return items;
  if (!isLegacyChatIntroItem(firstAssistant, chatId)) return items;

  return items.map((item, idx) =>
    idx === firstAssistantIdx && item.type === 'message' && item.role === 'assistant'
      ? coerceChatIntroShellItem(item)
      : item,
  );
}

export function buildChatIntroShellItem(
  chatId: ChatIntroId,
): Extract<ChatItem, { type: 'message'; role: 'assistant' }> {
  void chatId;
  return {
    type: 'message',
    role: 'assistant',
    content: '',
    mode: 'information',
    agent_blocks: [],
    suggested_replies: [],
  };
}

export function shouldSeedChatIntroMessage(threadId: string, items: ChatItem[]): boolean {
  if (threadId !== 'chat-2' && threadId !== 'chat-3') return false;

  const assistants = items.filter(
    (item): item is Extract<ChatItem, { type: 'message'; role: 'assistant' }> =>
      item.type === 'message' && item.role === 'assistant',
  );

  if (assistants.length === 0) return true;

  const hasShell = assistants.some((item) => isWelcomeShellMessageContent(item.content));
  if (hasShell) return false;

  const hasLegacy = assistants.some((item) => isLegacyChatIntroItem(item, threadId));
  if (hasLegacy) return false;

  if (assistants.every((item) => isRecoverableChatErrorMessage(String(item.content ?? '')))) {
    return true;
  }

  return (
    assistants.length === 1 &&
    isRecoverableChatErrorMessage(String(assistants[0]?.content ?? ''))
  );
}

export function repairChatIntroItems(chatId: string, items: ChatItem[]): ChatItem[] {
  if (chatId !== 'chat-2' && chatId !== 'chat-3') return items;

  const withoutRecoverableErrors = items.filter((item) => {
    if (item.type !== 'message' || item.role !== 'assistant') return true;
    return !isRecoverableChatErrorMessage(String(item.content ?? ''));
  });

  const migrated = migrateLegacyChatIntroShell(withoutRecoverableErrors, chatId);

  const hasShell = migrated.some(
    (item) =>
      item.type === 'message' &&
      item.role === 'assistant' &&
      isWelcomeShellMessageContent(item.content),
  );
  if (hasShell) return migrated;

  if (!shouldSeedChatIntroMessage(chatId, items)) return migrated;

  return [buildChatIntroShellItem(chatId as ChatIntroId), ...migrated];
}

export function isChatIntroShellItem(params: {
  item: ChatItem;
  index: number;
  items: ChatItem[];
  activeThreadId?: string;
  chat1GeneralDeepened?: boolean;
  isLegacyWelcomeAssistantItem: (item: ChatItem) => boolean;
}): boolean {
  const { item, index, items, activeThreadId, chat1GeneralDeepened, isLegacyWelcomeAssistantItem } =
    params;

  if (!activeThreadId || !['chat-1', 'chat-2', 'chat-3'].includes(activeThreadId)) return false;
  if (item.type !== 'message' || item.role !== 'assistant') return false;
  if (item.stream != null) return false;

  const isFirstAssistant = !items
    .slice(0, index)
    .some((prior) => prior.type === 'message' && prior.role === 'assistant');
  if (!isFirstAssistant) return false;

  if (activeThreadId === 'chat-1' && !chat1GeneralDeepened) {
    if (isWelcomeShellMessageContent(item.content)) return true;
    if (isLegacyWelcomeAssistantItem(item)) return true;
    return isRecoverableChatErrorMessage(String(item.content ?? ''));
  }

  if (isWelcomeShellMessageContent(item.content)) return true;
  if (isLegacyChatIntroItem(item, activeThreadId)) return true;
  return isRecoverableChatErrorMessage(String(item.content ?? ''));
}

export function usesExecutiveWelcomeCarousel(params: {
  activeThreadId?: string;
  chat1GeneralDeepened?: boolean;
}): boolean {
  return params.activeThreadId === 'chat-1' && !params.chat1GeneralDeepened;
}

export function isCompactChatIntroShell(params: {
  activeThreadId?: string;
  chat1GeneralDeepened?: boolean;
}): boolean {
  if (usesExecutiveWelcomeCarousel(params)) return false;
  return params.activeThreadId === 'chat-1' || params.activeThreadId === 'chat-2' || params.activeThreadId === 'chat-3';
}
