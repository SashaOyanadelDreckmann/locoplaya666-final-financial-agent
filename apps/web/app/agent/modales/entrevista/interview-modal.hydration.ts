import { INTERVIEW_TOTAL_LIMIT_SEC, resolveInterviewCallsStarted, resolveInterviewUsedSeconds } from '@financial-agent/shared';
import type { InterviewVoiceReport, InterviewVoiceSnapshot, InterviewVoiceSummaryEntry } from './interview-modal.context';
import { resolveInterviewActiveQuota, resolveUsedSecondsFromSources } from './interview-modal.helpers';

export const DEFAULT_MAX_CALL_DURATION_SEC = INTERVIEW_TOTAL_LIMIT_SEC;

const COVERAGE_TIERS = new Set<InterviewVoiceReport['coverage_tier']>([
  'minimal',
  'partial',
  'substantial',
  'complete',
]);

function normalizeVoiceReportKeyFindings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? '').trim()).filter(Boolean);
}

function normalizeVoiceReportConfidence(value: unknown): InterviewVoiceReport['confidence'] | undefined {
  return value === 'high' || value === 'medium' || value === 'low' ? value : undefined;
}

function normalizeVoiceReportCoverageTier(value: unknown): InterviewVoiceReport['coverage_tier'] | undefined {
  return typeof value === 'string' && COVERAGE_TIERS.has(value as InterviewVoiceReport['coverage_tier'])
    ? (value as InterviewVoiceReport['coverage_tier'])
    : undefined;
}

/** Server finalize persists `lastReport`; client snapshots use `voiceReport`. */
export function resolvePersistedVoiceReport(
  snapshot: InterviewVoiceSnapshot | Record<string, unknown> | null | undefined,
): InterviewVoiceReport | null {
  if (!snapshot || typeof snapshot !== 'object') return null;

  const source = snapshot as Record<string, unknown>;
  const coverageTier = normalizeVoiceReportCoverageTier(source.coverageTier);

  const direct = source.voiceReport;
  if (direct && typeof direct === 'object') {
    const report = direct as Record<string, unknown>;
    const executiveReport = String(report.executive_report ?? '').trim();
    if (executiveReport) {
      return {
        executive_report: executiveReport,
        key_findings: normalizeVoiceReportKeyFindings(report.key_findings),
        stop_reason: typeof report.stop_reason === 'string' ? report.stop_reason : undefined,
        has_enough_information:
          typeof report.has_enough_information === 'boolean' ? report.has_enough_information : undefined,
        confidence: normalizeVoiceReportConfidence(report.confidence),
        coverage_tier: normalizeVoiceReportCoverageTier(report.coverage_tier) ?? coverageTier,
      };
    }
  }

  const lastReport = source.lastReport;
  if (lastReport && typeof lastReport === 'object') {
    const report = lastReport as Record<string, unknown>;
    const executiveReport = String(report.executive_report ?? '').trim();
    if (executiveReport) {
      return {
        executive_report: executiveReport,
        key_findings: normalizeVoiceReportKeyFindings(report.key_findings),
        stop_reason:
          typeof report.ended_by === 'string'
            ? report.ended_by
            : typeof report.stop_reason === 'string'
              ? report.stop_reason
              : undefined,
        has_enough_information:
          typeof report.has_enough_information === 'boolean' ? report.has_enough_information : undefined,
        confidence: normalizeVoiceReportConfidence(report.confidence),
        coverage_tier: normalizeVoiceReportCoverageTier(report.coverage_tier) ?? coverageTier,
      };
    }
  }

  return null;
}

export type HydratedInterviewVoiceState = {
  callsStarted: number;
  callSeconds: number;
  maxCallDurationSec: number;
  remainingTotalSec: number | null;
  callId: string | null;
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

  const merged = {
    ...(localSaved ?? {}),
    ...(sessionVoice
      ? {
          callsStarted: resolveInterviewCallsStarted(localSaved, sessionVoice),
          remainingTotalSec: sessionVoice.remainingTotalSec,
          maxDurationSec: sessionVoice.maxDurationSec ?? localSaved?.maxDurationSec,
          status: sessionVoice.status ?? localSaved?.status,
          completedAt: sessionVoice.completedAt ?? localSaved?.completedAt,
          minuteSummaries: sessionVoice.minuteSummaries ?? localSaved?.minuteSummaries,
          finalSummary: sessionVoice.finalSummary ?? localSaved?.finalSummary ?? null,
          callId: sessionVoice.activeCallId ?? sessionVoice.callId ?? localSaved?.callId,
          callSeconds: resolveInterviewUsedSeconds(sessionVoice, localSaved),
          totalUsedSec: resolveInterviewUsedSeconds(sessionVoice, localSaved),
          coverageTier: sessionVoice.coverageTier ?? localSaved?.coverageTier,
          lastReport: sessionVoice.lastReport ?? localSaved?.lastReport,
        }
      : {}),
  } as InterviewVoiceSnapshot;

  const voiceReport =
    resolvePersistedVoiceReport(merged) ??
    resolvePersistedVoiceReport(sessionVoice) ??
    resolvePersistedVoiceReport(localSaved);

  return voiceReport ? { ...merged, voiceReport } : merged;
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
  const voiceReport = resolvePersistedVoiceReport(snapshot);

  const sessionAlreadyCompleted = Boolean(
    sessionDiagnosticProfileId ||
      snapshot.status === 'completed' ||
      Boolean(snapshot.completedAt) ||
      voiceReport,
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
      __productsContext: productsContext ?? currentIntake.__productsContext ?? null,
      __budgetContext: budgetContext ?? currentIntake.__budgetContext ?? null,
    };
  }
  return currentIntake;
}

export function interviewIntakeContextsEqual(
  left: InterviewIntakeWithContext | null | undefined,
  right: InterviewIntakeWithContext | null | undefined,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    JSON.stringify(left.__productsContext ?? null) === JSON.stringify(right.__productsContext ?? null) &&
    JSON.stringify(left.__budgetContext ?? null) === JSON.stringify(right.__budgetContext ?? null)
  );
}
