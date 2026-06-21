import { getClosingModeTurn, getMaxChatTurns, type ProductChatId } from '../chat/chat-lifecycle.constants';

export type ActionPlanFunnelStage = 'brainstorm' | 'converge' | 'deliver';

export const ACTION_PLAN_DELIVER_SECTIONS = [
  '## Resumen ejecutivo',
  '## Lectura de tu situacion',
  '## Contexto de mercado hoy',
  '## Prioridades 0-90 dias',
  '## Secuencia de ejecucion',
  '## Trade-offs y alertas',
  '## Metricas de seguimiento',
  '## Proxima decision que debes validar tu',
] as const;

export function resolveActionPlanFunnelStage(params: {
  activeChatId?: unknown;
  turnCount?: number;
  closingMode?: boolean;
  userMessage?: string;
}): ActionPlanFunnelStage | null {
  if (String(params.activeChatId ?? '') !== 'chat-2') return null;

  const userMessage = String(params.userMessage ?? '').toLowerCase();
  if (
    /\b(plan final|cerrar plan|entrega final|plan completo|plan estructurado|plan ejecutivo|dame el plan|cierra el plan|entregar plan|cerrar estrategia|documento ejecutivo)\b/i.test(
      userMessage,
    )
  ) {
    return 'deliver';
  }

  const turn = Math.max(0, Math.floor(Number(params.turnCount ?? 0)));
  const fullDeliverFrom = getActionPlanFullDeliverFrom();

  if (turn >= fullDeliverFrom) return 'deliver';
  if (turn <= 3) return 'brainstorm';
  return 'converge';
}

export function getActionPlanFullDeliverFrom(): number {
  return Math.max(0, getMaxChatTurns('chat-2') - 2);
}

export function funnelStageLabel(stage: ActionPlanFunnelStage): string {
  if (stage === 'brainstorm') return 'Lluvia de ideas';
  if (stage === 'converge') return 'Convergencia';
  return 'Plan ejecutivo';
}

export function funnelStageStepIndex(stage: ActionPlanFunnelStage): number {
  if (stage === 'brainstorm') return 1;
  if (stage === 'converge') return 2;
  return 3;
}

function sectionHeadingPresent(normalized: string, section: string): boolean {
  const heading = section.replace('## ', '').toLowerCase();
  return normalized.includes(heading);
}

export function enforceDeliverPlanStructure(message: string): string {
  const trimmed = String(message ?? '').trim();
  if (!trimmed) return trimmed;

  const normalized = trimmed.toLowerCase();
  const missing = ACTION_PLAN_DELIVER_SECTIONS.filter(
    (section) => !sectionHeadingPresent(normalized, section),
  );
  if (missing.length === 0) return trimmed;

  const appendix = [
    '',
    '---',
    '',
    ...missing.map(
      (section) =>
        `${section}\n_Seccion pendiente: pide profundizar este bloque y lo desarrollo con tu evidencia verificada (presupuesto, cartolas, diagnostico)._`,
    ),
  ].join('\n');

  return `${trimmed}${appendix}`;
}

export function buildClosingModeDirective(chatId: ProductChatId): string {
  const closingTurn = getClosingModeTurn(chatId);
  const maxTurns = getMaxChatTurns(chatId);
  if (chatId === 'chat-2') {
    const fullDeliverFrom = getActionPlanFullDeliverFrom();
    return [
      `MODO CIERRE: desde la interaccion ${closingTurn + 1}/${maxTurns} conduce hacia conclusion util.`,
      `Plan ejecutivo completo (secciones ##) solo en interacciones ${fullDeliverFrom + 1}-${maxTurns} o si el usuario lo pide.`,
      'Hasta entonces: convergencia breve con acuerdos, trade-offs y 1 pregunta; no repitas el plan completo.',
    ].join(' ');
  }
  return `MODO CIERRE: desde la interaccion ${closingTurn + 1}/${maxTurns} debes conducir la conversacion hacia una conclusion util, concreta y documentable.`;
}

export function buildActionPlanSuggestedReplies(
  stage: ActionPlanFunnelStage,
  turnCount = 0,
): string[] {
  const variant = Math.max(0, Math.floor(turnCount / 2)) % 3;

  if (stage === 'brainstorm') {
    const sets = [
      ['Priorizar liquidez', 'Explorar deuda', 'Simular ahorro'],
      ['Ordenar vencimientos', 'Medir margen mensual', 'Armar colchon'],
      ['Revisar caja vs deuda', 'Definir horizonte', 'Comparar rutas'],
    ];
    return sets[variant] ?? sets[0];
  }
  if (stage === 'converge') {
    const sets = [
      ['Validar ruta tentativa', 'Comparar trade-offs', 'Cerrar plan ejecutivo'],
      ['Ajustar prioridad del mes', 'Ver impacto en caja', 'Pedir plan final'],
      ['Profundizar trade-off clave', 'Elegir secuencia', 'Confirmar siguiente paso'],
    ];
    return sets[variant] ?? sets[0];
  }
  return ['Profundizar prioridades', 'Ajustar secuencia', 'Guardar en biblioteca'];
}

export function maxTurnsForChat(chatId: ProductChatId): number {
  return getMaxChatTurns(chatId);
}

export function closingTurnForChat(chatId: ProductChatId): number {
  return getClosingModeTurn(chatId);
}
