import {
  compactCoreAgentHistory,
  resolveCoreAgentHistoryLimits,
  type AgentHistoryMessage,
} from '../chat/chat-history';
import { funnelStageLabel, type ActionPlanFunnelStage } from './action-plan-funnel';

function readProfileField(profile: Record<string, unknown> | null | undefined, path: string[]): string {
  let cursor: unknown = profile;
  for (const key of path) {
    if (!cursor || typeof cursor !== 'object') return '';
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return typeof cursor === 'string' ? cursor.trim() : '';
}

function readFirstNonEmpty(values: Array<string | null | undefined>, max = 220): string {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text.slice(0, max);
  }
  return '';
}

export function buildRecentThreadContextBlock(
  history: AgentHistoryMessage[] | undefined,
  activeChatId?: unknown,
): string {
  const limits = resolveCoreAgentHistoryLimits(activeChatId);
  const compact = compactCoreAgentHistory(history, {
    maxMessages: limits.maxMessages,
    maxCharsPerMessage: limits.maxCharsPerMessage,
  });
  if (compact.length === 0) return '';

  const lines = compact.map((entry, index) => {
    const label = entry.role === 'user' ? 'Usuario' : 'Asistente';
    return `${index + 1}. [${label}] ${entry.content}`;
  });

  return [
    'HILO ACTUAL — continuidad conversacional (respeta prioridades, acuerdos y tono ya establecidos):',
    ...lines,
  ].join('\n');
}

export function buildActionPlanSessionBrief(params: {
  profile?: Record<string, unknown> | null;
  intake?: Record<string, unknown> | null;
  budget?: { income?: number; expenses?: number; balance?: number } | null;
  funnelStage?: ActionPlanFunnelStage | null;
  turnCount?: number;
  turnsRemaining?: number | null;
  history?: AgentHistoryMessage[];
}): string {
  const profile = params.profile ?? {};
  const intakeEnvelope =
    params.intake && typeof params.intake === 'object'
      ? (params.intake as Record<string, unknown>)
      : {};
  const intake =
    intakeEnvelope.intake && typeof intakeEnvelope.intake === 'object'
      ? (intakeEnvelope.intake as Record<string, unknown>)
      : intakeEnvelope;

  const headline = readFirstNonEmpty([
    readProfileField(profile, ['editorial', 'headline']),
    readProfileField(profile, ['diagnosticNarrative']),
  ]);
  const topTension = readFirstNonEmpty([
    Array.isArray(profile.tensions) ? String(profile.tensions[0] ?? '') : '',
    readProfileField(profile, ['topTension']),
  ]);
  const topHypothesis = readFirstNonEmpty([
    Array.isArray(profile.hypotheses) ? String(profile.hypotheses[0] ?? '') : '',
    readProfileField(profile, ['topHypothesis']),
  ]);
  const openQuestion = readFirstNonEmpty([
    Array.isArray(profile.openQuestions) ? String(profile.openQuestions[0] ?? '') : '',
  ]);

  const income = Number(params.budget?.income ?? intake.exactMonthlyIncome ?? 0);
  const expenses = Number(params.budget?.expenses ?? 0);
  const balance = Number(params.budget?.balance ?? income - expenses);

  const userPriorities = (params.history ?? [])
    .filter((entry) => entry.role === 'user')
    .map((entry) => String(entry.content ?? '').trim())
    .filter(Boolean)
    .slice(-4);

  const parts = [
    'BRIEF DE SESION — CHAT 2 PLAN DE ACCION:',
    headline ? `Diagnostico central: ${headline}` : null,
    topTension ? `Tension prioritaria: ${topTension}` : null,
    topHypothesis ? `Hipotesis activa: ${topHypothesis}` : null,
    openQuestion ? `Pregunta abierta del diagnostico: ${openQuestion}` : null,
    income > 0 || expenses > 0
      ? `Presupuesto verificado: ingreso ${Math.round(income).toLocaleString('es-CL')} · gasto ${Math.round(expenses).toLocaleString('es-CL')} · balance ${Math.round(balance).toLocaleString('es-CL')} CLP`
      : null,
    typeof intake.hasDebt === 'boolean' ? `Deuda declarada: ${intake.hasDebt ? 'si' : 'no'}` : null,
    params.funnelStage
      ? `Etapa embudo actual: ${funnelStageLabel(params.funnelStage)}`
      : null,
    typeof params.turnCount === 'number'
      ? `Interaccion ${params.turnCount + 1}${typeof params.turnsRemaining === 'number' ? ` · restantes ${params.turnsRemaining}` : ''}`
      : null,
    userPriorities.length > 0
      ? `Prioridades/expresadas por el usuario en este hilo:\n- ${userPriorities.join('\n- ')}`
      : null,
    'Mantén coherencia con este brief y el hilo; no reinicies el plan, no repitas preguntas ni hipotesis ya cubiertas.',
    'Justifica cada recomendacion con evidencia del brief o del hilo; si falta un dato, dilo antes de recomendar.',
  ].filter(Boolean);

  return parts.join('\n');
}
