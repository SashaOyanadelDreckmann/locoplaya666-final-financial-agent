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

const MAX_SUGGESTIONS = 4;
const MAX_CONTEXTUAL = 2;
const MAX_FUNNEL = 2;
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

function resolveFunnelStageReplies(params: {
  activeChatId: 'chat-2' | 'chat-3';
  turnCount?: number;
  closingMode?: boolean;
  userMessage?: string;
}): string[] {
  if (params.activeChatId === 'chat-2') {
    const stage =
      resolveActionPlanFunnelStage({
        activeChatId: 'chat-2',
        turnCount: params.turnCount,
        closingMode: params.closingMode,
        userMessage: params.userMessage,
      }) ?? ('brainstorm' satisfies ActionPlanFunnelStage);
    return buildActionPlanSuggestedReplies(stage);
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

export function mergeFunnelSuggestedReplies(params: {
  activeChatId: 'chat-2' | 'chat-3';
  turnCount?: number;
  closingMode?: boolean;
  userMessage?: string;
  assistantMessage?: string;
  modelSuggestedReplies?: string[];
}): string[] {
  void params.assistantMessage;

  const funnelDefaults = resolveFunnelStageReplies(params);
  const turnContext =
    params.activeChatId === 'chat-2'
      ? buildTurnContextActionPlanReplies(params.userMessage)
      : buildTurnContextSocialConsciousnessReplies(params.userMessage);

  const contextual = mergeUniqueSuggestions(
    [...(params.modelSuggestedReplies ?? []), ...turnContext],
    MAX_CONTEXTUAL,
  );
  const funnel = mergeUniqueSuggestions(funnelDefaults, MAX_FUNNEL);

  const merged = mergeUniqueSuggestions([...contextual, ...funnel], MAX_SUGGESTIONS);

  if (merged.length >= 3) return merged;

  return mergeUniqueSuggestions([...merged, ...funnelDefaults], MAX_SUGGESTIONS);
}
