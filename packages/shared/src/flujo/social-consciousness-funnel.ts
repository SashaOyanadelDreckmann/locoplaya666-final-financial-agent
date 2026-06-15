import { getClosingModeTurn, getMaxChatTurns } from '../chat/chat-lifecycle.constants';

export type SocialConsciousnessFunnelStage = 'explore' | 'tension' | 'synthesis';

export const SOCIAL_SYNTHESIS_SECTIONS = [
  '## Lectura central',
  '## Valores en tensión',
  '## Marco filosófico aplicado',
  '## Dilema personal',
  '## Pregunta abierta para seguir',
] as const;

export function resolveSocialConsciousnessFunnelStage(params: {
  activeChatId?: unknown;
  turnCount?: number;
  closingMode?: boolean;
  userMessage?: string;
}): SocialConsciousnessFunnelStage | null {
  if (String(params.activeChatId ?? '') !== 'chat-3') return null;

  const userMessage = String(params.userMessage ?? '').toLowerCase();
  if (
    /\b(s[ií]ntesis|cerrar reflexi[oó]n|mapa filos[oó]fico|consolidar lectura|lectura final|cerrar conciencia)\b/i.test(
      userMessage,
    )
  ) {
    return 'synthesis';
  }

  const turn = Math.max(0, Math.floor(Number(params.turnCount ?? 0)));
  const maxTurns = getMaxChatTurns('chat-3');
  const closingTurn = getClosingModeTurn('chat-3');
  const synthesisFrom = Math.max(closingTurn + 1, maxTurns - 3);

  if (Boolean(params.closingMode) || turn >= synthesisFrom) return 'synthesis';
  if (turn <= 3) return 'explore';
  return 'tension';
}

export function chat3RequestsNumericGrounding(userMessage?: string): boolean {
  return /\b(n[uú]mero|tasa|cmf|sii|simular|calcular|cu[aá]nto|rentabilidad|inversi[oó]n|marco regulatorio|normativa|presupuesto|cartola|apv|deuda)\b/i.test(
    String(userMessage ?? ''),
  );
}

export function isChat3BlockedTool(toolName: string, userMessage?: string): boolean {
  if (chat3RequestsNumericGrounding(userMessage)) return false;
  const name = String(toolName ?? '').toLowerCase();
  if (name.startsWith('finance.') || name.startsWith('math.') || name === 'agent.compose_pipeline') {
    return true;
  }
  if (name.includes('simulate') || name.includes('montecarlo') || name.includes('scenario')) {
    return true;
  }
  return false;
}

export function buildSocialConsciousnessReportSummary(message: string): string {
  return enforceSocialSynthesisStructure(String(message ?? '').trim().slice(0, 2400));
}

export function socialFunnelStageLabel(stage: SocialConsciousnessFunnelStage): string {
  if (stage === 'explore') return 'Exploración';
  if (stage === 'tension') return 'Tensión';
  return 'Síntesis reflexiva';
}

export function socialFunnelStageStepIndex(stage: SocialConsciousnessFunnelStage): number {
  if (stage === 'explore') return 1;
  if (stage === 'tension') return 2;
  return 3;
}

export function buildSocialConsciousnessSuggestedReplies(
  stage: SocialConsciousnessFunnelStage,
): string[] {
  if (stage === 'explore') {
    return [
      '¿El dinero compra libertad real?',
      '¿Mi gasto refleja mis valores?',
      '¿Qué mundo construyo con mi plata?',
    ];
  }
  if (stage === 'tension') {
    return [
      '¿Soy cómplice de algo al invertir?',
      '¿Ahorro o miedo disfrazado?',
      '¿Gastar es un acto político?',
    ];
  }
  return ['Profundizar una tensión', 'Reformular mi lectura', 'Guardar en biblioteca'];
}

function sectionHeadingPresent(normalized: string, section: string): boolean {
  const heading = section.replace('## ', '').toLowerCase();
  return normalized.includes(heading);
}

export function enforceSocialSynthesisStructure(message: string): string {
  const trimmed = String(message ?? '').trim();
  if (!trimmed) return trimmed;

  const normalized = trimmed.toLowerCase();
  const missing = SOCIAL_SYNTHESIS_SECTIONS.filter(
    (section) => !sectionHeadingPresent(normalized, section),
  );
  if (missing.length === 0) return trimmed;

  const appendix = [
    '',
    '---',
    '',
    ...missing.map(
      (section) =>
        `${section}\n_Bloque pendiente: pide profundizar esta dimensión y la desarrollo con tu reflexión y contexto personal._`,
    ),
  ].join('\n');

  return `${trimmed}${appendix}`;
}

export function buildSocialConsciousnessFallbackMessage(): string {
  return [
    'Hubo una intermitencia breve. Retomemos la reflexión sobre valores, dinero y sociedad.',
    'Si te parece, profundizamos en qué decisiones financieras revelan quién eres y qué mundo quieres sostener.',
  ].join('\n\n');
}
