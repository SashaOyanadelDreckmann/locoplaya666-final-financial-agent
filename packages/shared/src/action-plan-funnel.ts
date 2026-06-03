import { getClosingModeTurn, getMaxChatTurns, type ProductChatId } from './chat-lifecycle.constants';

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
    /\b(plan final|cerrar plan|entrega final|plan completo|plan estructurado|dame el plan|cierra el plan)\b/i.test(
      userMessage,
    )
  ) {
    return 'deliver';
  }

  const turn = Math.max(0, Math.floor(Number(params.turnCount ?? 0)));
  const closingTurn = getClosingModeTurn('chat-2');
  const closing = Boolean(params.closingMode) || turn >= closingTurn;
  const deliverFrom = Math.max(closingTurn, getMaxChatTurns('chat-2') - 3);

  if (closing || turn >= deliverFrom) return 'deliver';
  if (turn <= 3) return 'brainstorm';
  return 'converge';
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

export function enforceDeliverPlanStructure(message: string): string {
  const trimmed = String(message ?? '').trim();
  if (!trimmed) return trimmed;

  const normalized = trimmed.toLowerCase();
  const missing = ACTION_PLAN_DELIVER_SECTIONS.filter(
    (section) => !normalized.includes(section.replace('## ', '').toLowerCase()),
  );
  if (missing.length === 0) return trimmed;

  const appendix = [
    '',
    '---',
    '',
    ...missing.map((section) => `${section}\n_Pendiente de detalle en esta respuesta; solicita profundizar si lo necesitas._`),
  ].join('\n');

  return `${trimmed}${appendix}`;
}

export function maxTurnsForChat(chatId: ProductChatId): number {
  return getMaxChatTurns(chatId);
}

export function closingTurnForChat(chatId: ProductChatId): number {
  return getClosingModeTurn(chatId);
}
