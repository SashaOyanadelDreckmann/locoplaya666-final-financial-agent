import {
  buildActionPlanSuggestedReplies,
  resolveActionPlanFunnelStage,
  type ActionPlanFunnelStage,
} from './action-plan-funnel';
import {
  buildSocialConsciousnessSuggestedReplies,
  resolveSocialConsciousnessFunnelStage,
  type SocialConsciousnessFunnelStage,
} from './social-consciousness-funnel';
import { extractQuestionnaireClosingChoices, hasActiveQuestionnaireBlock } from '../agente/questionnaire-response-mode';
import type { ProductChatId } from '../chat/chat-lifecycle.constants';

const MAX_SUGGESTIONS = 4;
const MAX_CONTEXTUAL = 3;
const MAX_FUNNEL = 1;
const MAX_WORDS_PER_CHIP = 7;

function normalizeSuggestionKey(text: string): string {
  return String(text ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function clipSuggestion(text: string): string {
  const trimmed = String(text ?? '').trim().replace(/\s+/g, ' ');
  if (!trimmed) return '';
  const words = trimmed.split(' ');
  if (words.length <= MAX_WORDS_PER_CHIP) return trimmed;
  return words.slice(0, MAX_WORDS_PER_CHIP).join(' ');
}

function normalizeTopic(text?: string): string {
  return normalizeSuggestionKey(String(text ?? ''));
}

function mergeUniqueSuggestions(candidates: string[], max: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const raw of candidates) {
    const clipped = clipSuggestion(raw);
    const key = normalizeSuggestionKey(clipped);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(clipped);
    if (out.length >= max) break;
  }

  return out;
}

function filterRecentSuggestions(candidates: string[], recent?: string[]): string[] {
  if (!recent?.length) return candidates;
  const recentKeys = new Set(recent.map((entry) => normalizeSuggestionKey(entry)));
  return candidates.filter((entry) => !recentKeys.has(normalizeSuggestionKey(entry)));
}

export function extractAssistantAlignedReplies(
  assistantMessage?: string,
  questionnaireClosingChoices?: string[],
): string[] {
  const fromQuestionnaire = mergeUniqueSuggestions(questionnaireClosingChoices ?? [], 3);
  if (fromQuestionnaire.length > 0) return fromQuestionnaire;

  const text = String(assistantMessage ?? '').trim();
  if (!text) return [];

  return mergeUniqueSuggestions([clipSuggestion('Prefiero escribir la respuesta')], 1);
}

export function buildTurnContextActionPlanReplies(userMessage?: string): string[] {
  const text = normalizeTopic(userMessage);
  const raw = String(userMessage ?? '');
  const out: string[] = [];

  const push = (suggestion: string) => {
    out.push(suggestion);
  };

  if (/\b(deuda|cuota|credito|tarjeta|prestamo|morosidad|interes)\b/.test(text)) {
    push('¿Cuánto pesa mi deuda?');
    push('Comparar pago deuda vs ahorro');
  }
  if (/\b(ahorro|emergencia|colchon|respaldo)\b/.test(text)) {
    push('Simular fondo de emergencia');
    push('¿Cuánto puedo ahorrar al mes?');
  }
  if (/\b(apv|inversion|invertir|fondo|etf|acciones?|rentabilidad)\b/.test(text)) {
    push('¿Tengo margen para invertir?');
    push('Comparar APV vs ahorro');
  }
  if (/\b(liquidez|caja|flujo|sueldo|ingreso|gasto)\b/.test(text)) {
    push('Revisar caja mensual');
    push('Priorizar liquidez');
  }
  if (/\b(hipoteca|vivienda|dividendo|pie|arriendo)\b/.test(text)) {
    push('Evaluar dividendo vs ahorro');
    push('¿Cuánto pie necesito?');
  }
  if (/\b(prioridad|priorizar|primero|antes|orden)\b/.test(text)) {
    push('Validar mi prioridad del mes');
  }
  if (/\b(plan final|plan ejecutivo|cerrar plan|entrega final)\b/.test(text)) {
    push('Ajustar secuencia del plan');
    push('Profundizar prioridades');
  }
  if (/\?/.test(raw) && out.length < 2) {
    push('Profundizar en este punto');
  }

  return mergeUniqueSuggestions(out, 3);
}

export function buildTurnContextSocialConsciousnessReplies(userMessage?: string): string[] {
  const text = normalizeTopic(userMessage);
  const out: string[] = [];

  const push = (suggestion: string) => {
    out.push(suggestion);
  };

  if (/\b(culpa|culpable|verguenza|pecado)\b/.test(text)) {
    push('¿Es culpa o miedo disfrazado?');
    push('¿Qué compras me definen?');
  }
  if (/\b(libertad|libre|atrapad|dependencia)\b/.test(text)) {
    push('¿Libertad real o aparente?');
    push('¿El dinero me libera?');
  }
  if (/\b(compr|consum|gast)\b/.test(text)) {
    push('¿Mi gasto refleja mis valores?');
    push('¿Gastar es un acto político?');
  }
  if (/\b(invert|complice|afp|fondo|rentabilidad|impacto)\b/.test(text)) {
    push('¿Soy cómplice al invertir?');
    push('¿Rentabilidad vs impacto social?');
  }
  if (/\b(trabaj|esfuerzo|merito|brecha)\b/.test(text)) {
    push('¿Trabajo por vivir o al revés?');
    push('¿El esfuerzo justifica la brecha?');
  }
  if (/\b(deuda|credito|prestamo|poder)\b/.test(text)) {
    push('¿Deuda como control social?');
    push('¿Crédito o libertad existencial?');
  }
  if (/\b(valor|identidad|quien soy|sentido)\b/.test(text)) {
    push('¿Quién soy según gasto?');
    push('¿Qué valores revelo con plata?');
  }

  return mergeUniqueSuggestions(out, 3);
}

export function buildChat1PhaseReplies(params: {
  phase?: string;
  hasBudget?: boolean;
  hasTransactions?: boolean;
  turnCount?: number;
}): string[] {
  const phase = String(params.phase ?? '');
  const variant = Math.max(0, Math.floor(Number(params.turnCount ?? 0) / 3)) % 2;

  if (params.hasBudget && params.hasTransactions) {
    const sets = [
      ['Abrir entrevista breve', 'Revisar presupuesto', 'Ver cartola'],
      ['Simular un escenario', 'Revisar presupuesto', 'Ver mis movimientos'],
    ];
    return sets[variant] ?? sets[0];
  }

  if (phase === 'transactions_needed' || !params.hasTransactions) {
    const sets = [
      ['Subir cartola del mes', 'Explorar deuda', 'Simular ahorro'],
      ['Ver mis movimientos', 'Comparar gastos del mes', 'Simular ahorro'],
    ];
    return sets[variant] ?? sets[0];
  }

  if (phase === 'budget_needed' || !params.hasBudget) {
    const sets = [
      ['Completar presupuesto', 'Ver balance mensual', 'Probar escenario'],
      ['Armar presupuesto', 'Ver ingresos vs gastos', 'Simular meta de ahorro'],
    ];
    return sets[variant] ?? sets[0];
  }

  const sets = [
    ['Revisemos mi presupuesto', 'Hazme una simulación simple', 'Resume mi situación'],
    ['Simular escenario base', 'Ver UF y TPM actuales', 'Resume mi situación'],
  ];
  return sets[variant] ?? sets[0];
}

export function buildTurnContextChat1Replies(userMessage?: string): string[] {
  const text = normalizeTopic(userMessage);
  const raw = String(userMessage ?? '');
  const out: string[] = [];

  const push = (suggestion: string) => {
    out.push(suggestion);
  };

  out.push(...buildTurnContextActionPlanReplies(userMessage));

  if (/\b(simul|escenario|monte carlo|proyecc)\b/.test(text)) {
    push('Escenario optimista vs pesimista');
    push('Monte Carlo de riesgo');
  }
  if (/\b(uf|tpm|dolar|usd|ipc|inflacion)\b/.test(text)) {
    push('Ver UF y TPM actuales');
  }
  if (/\b(cartola|movimiento|transaccion|producto banc)\b/.test(text)) {
    push('Ver mis movimientos');
    push('Top gastos del mes');
  }
  if (/\b(presupuesto|balance|ingreso vs gasto)\b/.test(text)) {
    push('Resumen de mi presupuesto');
  }
  if (/\b(diagnostico|situacion|perfil|como estoy)\b/.test(text)) {
    push('Resume mi situación financiera');
  }
  if (/\b(regulacion|cmf|normativa|ley)\b/.test(text)) {
    push('Consultar normativa CMF');
  }
  if (/\b(meta|objetivo|plazo)\b/.test(text)) {
    push('Calcular plazo de mi meta');
  }
  if (/\?/.test(raw) && out.length < 2) {
    push('Profundizar en este punto');
  }

  return mergeUniqueSuggestions(out, 3);
}

function resolveFunnelStageReplies(params: {
  activeChatId: ProductChatId;
  turnCount?: number;
  closingMode?: boolean;
  userMessage?: string;
  onboardingPhase?: string;
  hasBudget?: boolean;
  hasTransactions?: boolean;
}): string[] {
  if (params.activeChatId === 'chat-1') {
    return buildChat1PhaseReplies({
      phase: params.onboardingPhase,
      hasBudget: params.hasBudget,
      hasTransactions: params.hasTransactions,
      turnCount: params.turnCount,
    });
  }

  if (params.activeChatId === 'chat-2') {
    const stage =
      resolveActionPlanFunnelStage({
        activeChatId: 'chat-2',
        turnCount: params.turnCount,
        closingMode: params.closingMode,
        userMessage: params.userMessage,
      }) ?? ('brainstorm' satisfies ActionPlanFunnelStage);
    return buildActionPlanSuggestedReplies(stage, params.turnCount ?? 0);
  }

  const stage =
    resolveSocialConsciousnessFunnelStage({
      activeChatId: 'chat-3',
      turnCount: params.turnCount,
      closingMode: params.closingMode,
      userMessage: params.userMessage,
    }) ?? ('explore' satisfies SocialConsciousnessFunnelStage);
  return buildSocialConsciousnessSuggestedReplies(stage);
}

function mergeStrictQuestionnaireSuggestions(params: {
  assistantMessage?: string;
  modelSuggestedReplies?: string[];
  recentSuggestedReplies?: string[];
  questionnaireClosingChoices?: string[];
  questionnaireBlocks?: unknown;
}): string[] {
  const closingChoices =
    params.questionnaireClosingChoices?.length
      ? params.questionnaireClosingChoices
      : extractQuestionnaireClosingChoices(params.questionnaireBlocks);

  const aligned = mergeUniqueSuggestions(
    [
      ...(params.modelSuggestedReplies ?? []),
      ...extractAssistantAlignedReplies(params.assistantMessage, closingChoices),
    ],
    MAX_SUGGESTIONS,
  );

  const filtered = filterRecentSuggestions(aligned, params.recentSuggestedReplies);
  return filtered.length > 0 ? filtered : aligned;
}

export function mergeFunnelSuggestedReplies(params: {
  activeChatId: ProductChatId;
  turnCount?: number;
  closingMode?: boolean;
  userMessage?: string;
  assistantMessage?: string;
  modelSuggestedReplies?: string[];
  recentSuggestedReplies?: string[];
  questionnaireClosingChoices?: string[];
  questionnaireBlocks?: unknown;
  onboardingPhase?: string;
  hasBudget?: boolean;
  hasTransactions?: boolean;
}): string[] {
  if (hasActiveQuestionnaireBlock(params.questionnaireBlocks)) {
    return mergeStrictQuestionnaireSuggestions(params);
  }

  const funnelDefaults = resolveFunnelStageReplies(params);
  const assistantAligned = extractAssistantAlignedReplies(
    params.assistantMessage,
    params.questionnaireClosingChoices?.length
      ? params.questionnaireClosingChoices
      : extractQuestionnaireClosingChoices(params.questionnaireBlocks),
  );
  const turnContext =
    params.activeChatId === 'chat-1'
      ? buildTurnContextChat1Replies(params.userMessage)
      : params.activeChatId === 'chat-2'
        ? buildTurnContextActionPlanReplies(params.userMessage)
        : buildTurnContextSocialConsciousnessReplies(params.userMessage);

  const contextual = filterRecentSuggestions(
    mergeUniqueSuggestions(
      [
        ...(params.modelSuggestedReplies ?? []),
        ...assistantAligned,
        ...turnContext,
      ],
      MAX_CONTEXTUAL,
    ),
    params.recentSuggestedReplies,
  );

  const funnelCap = contextual.length >= 2 ? MAX_FUNNEL : 2;
  const funnel = filterRecentSuggestions(
    mergeUniqueSuggestions(funnelDefaults, funnelCap),
    params.recentSuggestedReplies,
  );

  const merged = mergeUniqueSuggestions([...contextual, ...funnel], MAX_SUGGESTIONS);

  if (merged.length >= 3) return merged;

  return mergeUniqueSuggestions(
    filterRecentSuggestions([...merged, ...funnelDefaults], params.recentSuggestedReplies),
    MAX_SUGGESTIONS,
  );
}
