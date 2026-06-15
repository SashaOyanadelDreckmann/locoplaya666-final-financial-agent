import { formatInterviewClock } from './interview-modal.voice-summary';
import { formatMoneyCompact } from './interview-modal.context';
import type { InterviewVoiceStateFlags } from './interview-modal.helpers';
import type { InterviewIntakeWithContext } from './interview-modal.hydration';

export type InterviewInsightCell = {
  key: string;
  label: string;
  value: string;
  detail?: string;
  tone?: 'live' | 'paused' | 'closing' | 'done' | 'muted';
};

type WorkspaceStatusInput = {
  voiceAwaitingMic: boolean;
  voiceConnecting: boolean;
  voiceConnected: boolean;
  voicePaused: boolean;
  voiceListening: boolean;
  voiceSpeaking: boolean;
  voiceFlags: {
    voiceCallExhausted: boolean;
    hasEverStartedVoiceCall: boolean;
    hasRemainingInterviewTime: boolean;
    isClosingWindow: boolean;
  };
  isFinalizingCall: boolean;
  isGeneratingDiagnosis: boolean;
  showVoiceReport: boolean;
  stageLabel: string;
};

export function resolveInterviewWorkspaceStatus(input: WorkspaceStatusInput): string {
  if (input.voiceAwaitingMic) return 'Permite el micrófono para continuar';
  if (input.voiceConnecting) return 'Conectando…';
  if (input.showVoiceReport) return 'Diagnóstico listo';
  if (input.isFinalizingCall || input.isGeneratingDiagnosis) return 'Generando diagnóstico…';
  if (input.voiceFlags.voiceCallExhausted && !input.showVoiceReport) return 'Tiempo agotado';
  if (input.voiceConnected && input.voicePaused) return 'En pausa';
  if (input.voiceConnected) {
    if (input.voiceListening) return 'Te escucho';
    if (input.voiceSpeaking) return 'Entrevistador habla';
    if (input.voiceFlags.isClosingWindow) return 'Cierre en curso';
    return 'En llamada';
  }
  if (input.voiceFlags.hasEverStartedVoiceCall && input.voiceFlags.hasRemainingInterviewTime) {
    return 'Lista para reanudar';
  }
  return input.stageLabel;
}

export function resolveInterviewTimeChip(
  callSeconds: number,
  remainingTotalSec: number | null,
): string {
  const elapsed = `${Math.floor(callSeconds / 60).toString().padStart(2, '0')}:${(callSeconds % 60)
    .toString()
    .padStart(2, '0')}`;
  return `${formatInterviewClock(remainingTotalSec)} · ${elapsed}`;
}

export function shouldShowInterviewTranscripts(input: {
  minuteSummariesCount: number;
  finalSummaryText?: string | null;
  voiceAgentTranscript?: string | null;
}): boolean {
  return (
    input.minuteSummariesCount > 0 ||
    Boolean(input.finalSummaryText?.trim()) ||
    Boolean(input.voiceAgentTranscript?.trim())
  );
}

type BackendSessionStatusInput = {
  showVoiceReport: boolean;
  isFinalizingCall: boolean;
  isGeneratingDiagnosis: boolean;
  voiceAwaitingMic: boolean;
  voiceConnecting: boolean;
  voiceConnected: boolean;
  voicePaused: boolean;
  voiceFlags: InterviewVoiceStateFlags;
  callId: string | null;
};

export function resolveInterviewBackendSessionStatus(
  input: BackendSessionStatusInput,
): Pick<InterviewInsightCell, 'value' | 'tone'> {
  if (input.showVoiceReport || input.voiceFlags.hasCompletedVoiceInterview) {
    return { value: 'Completada', tone: 'done' };
  }
  if (input.isFinalizingCall || input.isGeneratingDiagnosis) {
    return { value: 'Cerrando', tone: 'closing' };
  }
  if (input.voiceFlags.voiceCallExhausted) {
    return { value: 'Tiempo agotado', tone: 'done' };
  }
  if (input.voiceConnected && input.voicePaused) {
    return { value: 'Pausada', tone: 'paused' };
  }
  if (input.voiceConnected) {
    return { value: 'En curso', tone: 'live' };
  }
  if (input.voiceConnecting || input.voiceAwaitingMic) {
    return { value: 'Conectando', tone: 'muted' };
  }
  if (input.voiceFlags.hasEverStartedVoiceCall && input.callId) {
    return { value: 'Pausada', tone: 'paused' };
  }
  return { value: 'Preparada', tone: 'muted' };
}

function truncateInsight(value: string, max = 52): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function resolveConversationTurn(input: {
  voiceAwaitingMic: boolean;
  voiceConnecting: boolean;
  voiceConnected: boolean;
  voicePaused: boolean;
  voiceListening: boolean;
  voiceSpeaking: boolean;
  voiceFlags: InterviewVoiceStateFlags;
  isFinalizingCall: boolean;
  isGeneratingDiagnosis: boolean;
  summaryGenerating: boolean;
}): Pick<InterviewInsightCell, 'value' | 'tone'> {
  if (input.isFinalizingCall || input.isGeneratingDiagnosis) {
    return { value: 'Consolidando', tone: 'closing' };
  }
  if (input.summaryGenerating) {
    return { value: 'Síntesis en curso', tone: 'closing' };
  }
  if (input.voiceAwaitingMic) {
    return { value: 'Esperando micrófono', tone: 'muted' };
  }
  if (input.voiceConnecting) {
    return { value: 'Negociando llamada', tone: 'muted' };
  }
  if (input.voiceConnected && input.voicePaused) {
    return { value: 'Sin audio activo', tone: 'paused' };
  }
  if (input.voiceConnected && input.voiceFlags.isClosingWindow) {
    return { value: 'Cierre automático', tone: 'closing' };
  }
  if (input.voiceConnected && input.voiceListening) {
    return { value: 'Usuario habla', tone: 'live' };
  }
  if (input.voiceConnected && input.voiceSpeaking) {
    return { value: 'Entrevistador', tone: 'live' };
  }
  if (input.voiceConnected) {
    return { value: 'Canal abierto', tone: 'live' };
  }
  return { value: 'Inactiva', tone: 'muted' };
}

function resolveContextInjectionLine(input: {
  intakeReady: boolean;
  voiceConnected: boolean;
  voiceSessionReady: boolean;
  minuteSummariesCount: number;
  hasFinalSummary: boolean;
  syncError: string | null;
}): Pick<InterviewInsightCell, 'value' | 'tone'> {
  if (input.syncError) {
    return { value: 'Sync pendiente', tone: 'closing' };
  }
  if (!input.intakeReady) {
    return { value: 'Cargando intake', tone: 'muted' };
  }
  const layers = 1 + input.minuteSummariesCount + (input.hasFinalSummary ? 1 : 0);
  if (input.voiceConnected && input.voiceSessionReady) {
    return {
      value: `Activo · ${layers} capa${layers === 1 ? '' : 's'}`,
      tone: 'live',
    };
  }
  if (input.voiceConnected) {
    return { value: 'Sincronizando contexto', tone: 'muted' };
  }
  return { value: `Listo · ${layers} capa${layers === 1 ? '' : 's'}`, tone: 'muted' };
}

function resolveProfileBaseLine(intake: InterviewIntakeWithContext | null): string {
  if (!intake) return 'Sin intake';
  const parts = [
    intake.profession ? String(intake.profession) : null,
    intake.incomeBand ? String(intake.incomeBand).replace(/_/g, ' ') : null,
    typeof intake.moneyStressLevel === 'number' ? `estrés ${intake.moneyStressLevel}/10` : null,
  ].filter(Boolean);
  return parts.length > 0 ? truncateInsight(parts.join(' · '), 48) : 'Perfil base cargado';
}

function resolveProductsLine(intake: InterviewIntakeWithContext | null): string | null {
  const products = intake?.__productsContext;
  if (!products || typeof products !== 'object') return null;
  const count = Math.max(0, Number(products.productsCount ?? 0));
  if (count <= 0) return null;
  const active = products.activeProductLabel ? String(products.activeProductLabel) : null;
  return active ? `${count} · ${truncateInsight(active, 28)}` : `${count} producto${count === 1 ? '' : 's'}`;
}

function resolveBudgetLine(intake: InterviewIntakeWithContext | null): string | null {
  const budget = intake?.__budgetContext;
  if (!budget || typeof budget !== 'object') return null;
  const rowsCount = Math.max(0, Number(budget.rowsCount ?? 0));
  if (rowsCount <= 0) return null;
  const balance = Math.round(Number(budget.balance ?? 0));
  const balanceLabel = `${balance >= 0 ? '+' : ''}${formatMoneyCompact(balance)}`;
  return `${rowsCount} filas · ${balanceLabel}`;
}

function resolveFinancialBaseLine(intake: InterviewIntakeWithContext | null): { value: string; detail?: string } {
  const profile = resolveProfileBaseLine(intake);
  const products = resolveProductsLine(intake);
  const budget = resolveBudgetLine(intake);
  const detailParts = [products, budget].filter(Boolean) as string[];

  if (detailParts.length > 0) {
    return {
      value: profile,
      detail: truncateInsight(detailParts.join(' · '), 56),
    };
  }

  return { value: profile };
}

function resolveEvidenceCell(input: {
  minuteSummariesCount: number;
  latestSummary?: string | null;
  remainingTotalSec: number | null;
}): Pick<InterviewInsightCell, 'value' | 'detail' | 'tone'> {
  if (input.minuteSummariesCount <= 0) {
    return { value: 'Sin síntesis', detail: 'Aparece al cerrar cada minuto', tone: 'muted' };
  }

  const latest = input.latestSummary?.trim();
  const clock = formatInterviewClock(input.remainingTotalSec);
  return {
    value: `${input.minuteSummariesCount} acumulada${input.minuteSummariesCount === 1 ? '' : 's'}`,
    detail: latest ? truncateInsight(latest, 52) : `${clock} restante`,
    tone: 'live',
  };
}

function resolveInsightTone(
  sessionTone: InterviewInsightCell['tone'],
  turnTone: InterviewInsightCell['tone'],
): InterviewInsightCell['tone'] {
  if (turnTone === 'live' || turnTone === 'closing') return turnTone;
  if (sessionTone === 'live' || sessionTone === 'paused') return sessionTone;
  return turnTone ?? sessionTone;
}

export function buildInterviewInsightCells(input: {
  intake: InterviewIntakeWithContext | null;
  intakeReady: boolean;
  showVoiceReport: boolean;
  isFinalizingCall: boolean;
  isGeneratingDiagnosis: boolean;
  voiceAwaitingMic: boolean;
  voiceConnecting: boolean;
  voiceConnected: boolean;
  voicePaused: boolean;
  voiceListening: boolean;
  voiceSpeaking: boolean;
  voiceSessionReady: boolean;
  summaryGenerating: boolean;
  syncError: string | null;
  voiceFlags: InterviewVoiceStateFlags;
  callId: string | null;
  minuteSummariesCount: number;
  latestMinuteSummary?: string | null;
  hasFinalSummary: boolean;
  remainingTotalSec: number | null;
}): InterviewInsightCell[] {
  const session = resolveInterviewBackendSessionStatus(input);
  const turn = resolveConversationTurn(input);
  const injection = resolveContextInjectionLine(input);
  const financialBase = resolveFinancialBaseLine(input.intake);
  const evidence = resolveEvidenceCell({
    minuteSummariesCount: input.minuteSummariesCount,
    latestSummary: input.latestMinuteSummary,
    remainingTotalSec: input.remainingTotalSec,
  });

  const layers = 1 + input.minuteSummariesCount + (input.hasFinalSummary ? 1 : 0);

  return [
    {
      key: 'state',
      label: 'Estado',
      value: session.value,
      detail: turn.value,
      tone: resolveInsightTone(session.tone, turn.tone),
    },
    {
      key: 'context',
      label: 'Contexto IA',
      value: injection.value,
      detail: input.syncError
        ? 'Reintentando sync con backend'
        : input.voiceConnected && input.voiceSessionReady
          ? `${layers} capa${layers === 1 ? '' : 's'} en la llamada`
          : `${layers} capa${layers === 1 ? '' : 's'} preparada${layers === 1 ? '' : 's'}`,
      tone: injection.tone,
    },
    {
      key: 'base',
      label: 'Base',
      value: financialBase.value,
      detail: financialBase.detail ?? (input.intakeReady ? 'Intake sincronizado' : 'Cargando perfil'),
      tone: input.intakeReady ? undefined : 'muted',
    },
    {
      key: 'evidence',
      label: 'Evidencia',
      value: evidence.value,
      detail: evidence.detail,
      tone: evidence.tone,
    },
  ];
}
