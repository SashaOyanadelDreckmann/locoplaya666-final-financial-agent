import { INTERVIEW_TOTAL_LIMIT_SEC } from '@financial-agent/shared';
import type { InterviewVoiceReport, InterviewVoiceSnapshot, InterviewVoiceSummaryEntry } from './interview-modal.context';
import { resolveInterviewActiveQuota, resolveUsedSecondsFromSources } from './interview-modal.helpers';

export const DEFAULT_MAX_CALL_DURATION_SEC = INTERVIEW_TOTAL_LIMIT_SEC;

export type HydratedInterviewVoiceState = {
  callsStarted: number;
  callSeconds: number;
  maxCallDurationSec: number;
  remainingTotalSec: number | null;
  callId: string | null;
  pauseUsed: boolean;
  minuteSummaries: InterviewVoiceSummaryEntry[];
  finalSummary: InterviewVoiceSnapshot['finalSummary'];
  voiceReport: InterviewVoiceReport | null;
  latestDiagnosticProfileId: string | null;
  sessionAlreadyCompleted: boolean;
  summaryMinuteApplied: number;
  voiceUserTranscript: string;
};

/**
 * Merge strategy (senior rule):
 *   - Server (sessionVoice) is the source of truth for quota/timer fields and stored summaries.
 *   - Local sessionStorage may have fresher summaries while sync is pending.
 *   - callSeconds: take the larger of both (most recent progress).
 */
export function mergeInterviewVoiceSnapshots(
  localSaved: InterviewVoiceSnapshot | null,
  sessionVoice: InterviewVoiceSnapshot | null,
): InterviewVoiceSnapshot | null {
  if (!localSaved && !sessionVoice) return null;

  return {
    ...(localSaved ?? {}),
    ...(sessionVoice
      ? {
          callsStarted: sessionVoice.callsStarted,
          remainingTotalSec: sessionVoice.remainingTotalSec,
          maxDurationSec: sessionVoice.maxDurationSec ?? localSaved?.maxDurationSec,
          status: sessionVoice.status ?? localSaved?.status,
          completedAt: sessionVoice.completedAt ?? localSaved?.completedAt,
          voiceReport: sessionVoice.voiceReport ?? localSaved?.voiceReport,
          minuteSummaries: sessionVoice.minuteSummaries ?? localSaved?.minuteSummaries,
          finalSummary: sessionVoice.finalSummary ?? localSaved?.finalSummary ?? null,
          callId: sessionVoice.activeCallId ?? sessionVoice.callId ?? localSaved?.callId,
          callSeconds: resolveUsedSecondsFromSources(sessionVoice, localSaved),
          totalUsedSec: resolveUsedSecondsFromSources(sessionVoice, localSaved),
          pauseUsed: sessionVoice.pauseUsed ?? localSaved?.pauseUsed,
        }
      : {}),
  } as InterviewVoiceSnapshot;
}

export function deriveHydratedVoiceState(input: {
  snapshot: InterviewVoiceSnapshot | null;
  sessionDiagnosticProfileId: string | null;
}): HydratedInterviewVoiceState {
  const { snapshot, sessionDiagnosticProfileId } = input;
  const empty: HydratedInterviewVoiceState = {
    callsStarted: 0,
    callSeconds: 0,
    maxCallDurationSec: DEFAULT_MAX_CALL_DURATION_SEC,
    remainingTotalSec: null,
    callId: null,
    pauseUsed: false,
    minuteSummaries: [],
    finalSummary: null,
    voiceReport: null,
    latestDiagnosticProfileId: sessionDiagnosticProfileId,
    sessionAlreadyCompleted: false,
    summaryMinuteApplied: 0,
    voiceUserTranscript: '',
  };

  if (!snapshot || typeof snapshot !== 'object') {
    if (sessionDiagnosticProfileId) {
      return { ...empty, sessionAlreadyCompleted: true };
    }
    return empty;
  }

  const minuteSummaries = Array.isArray(snapshot.minuteSummaries)
    ? (snapshot.minuteSummaries as InterviewVoiceSummaryEntry[])
    : [];
  const summaryMinuteApplied = minuteSummaries.length
    ? Math.max(...minuteSummaries.map((item) => Number(item.minute ?? 0)))
    : 0;
  const voiceUserTranscript = minuteSummaries.map((item) => `Minuto ${item.minute}: ${item.summary}`).join('\n\n');
  const voiceReport =
    snapshot.voiceReport && typeof snapshot.voiceReport === 'object'
      ? (snapshot.voiceReport as InterviewVoiceReport)
      : null;

  const sessionAlreadyCompleted = Boolean(
    sessionDiagnosticProfileId ||
      snapshot.status === 'completed' ||
      Boolean(snapshot.completedAt) ||
      Boolean(snapshot.voiceReport),
  );

  const activeCallSeconds = resolveUsedSecondsFromSources(snapshot);
  const activeQuota = resolveInterviewActiveQuota(activeCallSeconds);

  return {
    callsStarted:
      typeof snapshot.callsStarted === 'number' ? Math.max(0, Math.floor(snapshot.callsStarted)) : 0,
    callSeconds: activeQuota.activeSeconds,
    maxCallDurationSec: DEFAULT_MAX_CALL_DURATION_SEC,
    remainingTotalSec: activeQuota.remainingSeconds,
    callId:
      typeof snapshot.callId === 'string' && snapshot.callId.length > 0
        ? snapshot.callId
        : typeof snapshot.activeCallId === 'string' && snapshot.activeCallId.length > 0
          ? snapshot.activeCallId
          : null,
    pauseUsed: typeof snapshot.pauseUsed === 'boolean' ? snapshot.pauseUsed : false,
    minuteSummaries,
    finalSummary: snapshot.finalSummary ?? null,
    voiceReport,
    latestDiagnosticProfileId: sessionDiagnosticProfileId,
    sessionAlreadyCompleted,
    summaryMinuteApplied,
    voiceUserTranscript,
  };
}

export type InterviewIntakeWithContext = Record<string, unknown> & {
  __productsContext?: Record<string, unknown> | null;
  __budgetContext?: Record<string, unknown> | null;
};

export function mergeInterviewIntake(
  currentIntake: InterviewIntakeWithContext | null,
  sessionIntake: Record<string, unknown> | null | undefined,
  productsContext: Record<string, unknown> | null | undefined,
  budgetContext: Record<string, unknown> | null | undefined,
): InterviewIntakeWithContext | null {
  if (sessionIntake && typeof sessionIntake === 'object') {
    if (!currentIntake) {
      return {
        ...sessionIntake,
        __productsContext: productsContext ?? null,
        __budgetContext: budgetContext ?? null,
      };
    }
    return {
      ...currentIntake,
      __productsContext: currentIntake.__productsContext ?? productsContext ?? null,
      __budgetContext: currentIntake.__budgetContext ?? budgetContext ?? null,
    };
  }
  return currentIntake;
}
