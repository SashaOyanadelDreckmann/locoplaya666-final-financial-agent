import {
  getClosingModeTurn,
  getMaxChatTurns,
  type ProductChatId,
} from '@financial-agent/shared';

export type ActionPlanFunnelStage = 'brainstorm' | 'converge' | 'deliver';

export function resolveActionPlanFunnelStage(params: {
  activeChatId?: unknown;
  turnCount?: number;
  closingMode?: boolean;
  userMessage?: string;
}): ActionPlanFunnelStage | null {
  if (String(params.activeChatId ?? '') !== 'chat-2') return null;

  const userMessage = String(params.userMessage ?? '').toLowerCase();
  if (
    /\b(plan final|cerrar plan|entrega final|plan completo|plan estructurado|dame el plan|cierra el plan)\b/i.test(
      userMessage,
    )
  ) {
    return 'deliver';
  }

  const turn = Math.max(0, Math.floor(Number(params.turnCount ?? 0)));
  const maxTurns = getMaxChatTurns('chat-2');
  const closingTurn = getClosingModeTurn('chat-2');
  const closing = Boolean(params.closingMode) || turn >= closingTurn;
  const deliverFrom = Math.max(closingTurn, maxTurns - 3);

  if (closing || turn >= deliverFrom) return 'deliver';
  if (turn <= 3) return 'brainstorm';
  return 'converge';
}

export function buildActionPlanFunnelDirective(stage: ActionPlanFunnelStage): string {
  if (stage === 'brainstorm') {
    return [
      'ETAPA EMBUDO — LLUVIA DE IDEAS (inicio):',
      '- Parte del diagnostico, presupuesto, cartolas, intake y mercado vivo del dia.',
      '- Abre con hipotesis, angulos y oportunidades (bullets cortos), sin cerrar el plan todavia.',
      '- Haz 1-2 preguntas afiladoras para entender prioridad, horizonte y tolerancia al riesgo.',
      '- No entregues aun el plan final estructurado.',
    ].join('\n');
  }
  if (stage === 'converge') {
    return [
      'ETAPA EMBUDO — CONVERGENCIA (medio):',
      '- Reduce opciones segun lo que el usuario eligio o descarto.',
      '- Contrasta trade-offs (caja vs deuda vs ahorro vs inversion) con criterio senior.',
      '- Propone secuencia tentativa de 3-5 movimientos, pidiendo validacion puntual.',
      '- Aun no cierres con el informe final completo salvo que el usuario pida cerrar ya.',
    ].join('\n');
  }
  return [
    'ETAPA EMBUDO — ENTREGA FINAL (cierre):',
    '- Este mensaje DEBE ser el plan de accion profesional completo y personalizado.',
    '- Estructura obligatoria en markdown:',
    '  ## Resumen ejecutivo',
    '  ## Lectura de tu situacion (datos del usuario)',
    '  ## Contexto de mercado hoy',
    '  ## Prioridades 0-90 dias (ordenadas)',
    '  ## Secuencia de ejecucion (paso a paso con plazos)',
    '  ## Trade-offs y alertas',
    '  ## Metricas de seguimiento',
    '  ## Proxima decision que debes validar tu',
    '- Tono analista senior, concreto, sin prometer rentabilidades.',
    '- La decision final y ejecutable depende 100% del usuario.',
  ].join('\n');
}

export function buildActionPlanFormatInstructions(stage: ActionPlanFunnelStage): string {
  if (stage === 'brainstorm') {
    return [
      'Chat 2 — Plan de accion: etapa LLUVIA DE IDEAS.',
      'Responde con ideas divergentes ancladas al perfil y al mercado vivo; bullets claros; 1-2 preguntas.',
      'No entregues el plan final estructurado todavia.',
    ].join(' ');
  }
  if (stage === 'converge') {
    return [
      'Chat 2 — Plan de accion: etapa CONVERGENCIA.',
      'Afina prioridades con lo que el usuario dijo; propone secuencia tentativa y pide confirmacion en 1 punto clave.',
    ].join(' ');
  }
  return [
    'Chat 2 — Plan de accion: etapa ENTREGA FINAL.',
    'Entrega el plan completo con las secciones: Resumen ejecutivo, Lectura de tu situacion, Contexto de mercado hoy,',
    'Prioridades 0-90 dias, Secuencia de ejecucion, Trade-offs y alertas, Metricas de seguimiento, Proxima decision.',
    'Personalizado al usuario; tono senior; sin correos ni recordatorios externos.',
  ].join(' ');
}

export function maxTurnsForChat(chatId: ProductChatId): number {
  return getMaxChatTurns(chatId);
}

export function closingTurnForChat(chatId: ProductChatId): number {
  return getClosingModeTurn(chatId);
}
