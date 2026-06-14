import { INTERVIEW_MIN_EARLY_END_SEC, INTERVIEW_TOTAL_LIMIT_SEC } from '@financial-agent/shared';

export type InterviewActiveQuota = {
  activeSeconds: number;
  remainingSeconds: number;
  isExhausted: boolean;
};

export function resolveUsedSecondsFromSources(...sources: Array<unknown>): number {
  const values = sources
    .map((source) => {
      if (typeof source === 'number' && Number.isFinite(source)) return Math.floor(source);
      if (source && typeof source === 'object') {
        const record = source as Record<string, unknown>;
        const candidates = [record.totalUsedSec, record.total_used_sec, record.callSeconds, record.call_seconds];
        for (const candidate of candidates) {
          if (typeof candidate === 'number' && Number.isFinite(candidate)) {
            return Math.floor(candidate);
          }
        }
        if (typeof record.remaining_total_sec === 'number' && Number.isFinite(record.remaining_total_sec)) {
          return Math.max(0, INTERVIEW_TOTAL_LIMIT_SEC - Math.floor(record.remaining_total_sec));
        }
        if (typeof record.remainingTotalSec === 'number' && Number.isFinite(record.remainingTotalSec)) {
          return Math.max(0, INTERVIEW_TOTAL_LIMIT_SEC - Math.floor(record.remainingTotalSec));
        }
      }
      return 0;
    })
    .filter((value) => value >= 0);

  return Math.min(
    INTERVIEW_TOTAL_LIMIT_SEC,
    Math.max(0, ...values, 0),
  );
}

export function measureActiveCallSeconds(input: {
  accumulatedSec: number;
  segmentStartedAtMs: number | null;
  segmentLive: boolean;
  nowMs?: number;
}): number {
  const accumulated = Math.max(0, Math.floor(Number.isFinite(input.accumulatedSec) ? input.accumulatedSec : 0));
  if (!input.segmentLive || input.segmentStartedAtMs == null) {
    return Math.min(INTERVIEW_TOTAL_LIMIT_SEC, accumulated);
  }
  const now = input.nowMs ?? Date.now();
  const segmentElapsed = Math.max(0, Math.floor((now - input.segmentStartedAtMs) / 1000));
  return Math.min(INTERVIEW_TOTAL_LIMIT_SEC, accumulated + segmentElapsed);
}

export function canEndInterviewCallEarly(activeSeconds: number): boolean {
  return Math.max(0, Math.floor(Number.isFinite(activeSeconds) ? activeSeconds : 0)) >= INTERVIEW_MIN_EARLY_END_SEC;
}

export function resolveInterviewActiveQuota(activeSeconds: number): InterviewActiveQuota {
  const used = Math.min(
    INTERVIEW_TOTAL_LIMIT_SEC,
    Math.max(0, Math.floor(Number.isFinite(activeSeconds) ? activeSeconds : 0)),
  );
  return {
    activeSeconds: used,
    remainingSeconds: Math.max(0, INTERVIEW_TOTAL_LIMIT_SEC - used),
    isExhausted: used >= INTERVIEW_TOTAL_LIMIT_SEC,
  };
}

export type InterviewVoiceStateInput = {
  latestDiagnosticProfileId?: string | null;
  voiceReportExecutiveReport?: string | null;
  callId?: string | null;
  callsStarted?: number;
  callSeconds?: number;
  minuteSummariesCount?: number;
  hasFinalSummary?: boolean;
  hasVoiceReport?: boolean;
  remainingTotalSec?: number | null;
  maxCallDurationSec?: number;
  closeoutBufferSec: number;
  voiceConnected?: boolean;
  voicePaused?: boolean;
};

export type InterviewVoiceStateFlags = {
  hasCompletedVoiceInterview: boolean;
  hasEverStartedVoiceCall: boolean;
  hasRemainingInterviewTime: boolean;
  hasLiveVoiceCall: boolean;
  isClosingWindow: boolean;
  voiceCallExhausted: boolean;
  voiceInterviewLocked: boolean;
};

export type InterviewModalLoadingInput = {
  intakeReady: boolean;
  hasIntake: boolean;
  bootError: string | null;
  sessionAlreadyCompleted: boolean;
  hasDiagnosis: boolean;
};

export function resolveInterviewModalLoadingState(input: InterviewModalLoadingInput): boolean {
  if (!input.intakeReady) return true;
  if (input.bootError) return false;
  if (input.hasIntake) return false;
  if (input.sessionAlreadyCompleted || input.hasDiagnosis) return false;
  return true;
}

export function resolveInterviewVoiceStateFlags(input: InterviewVoiceStateInput): InterviewVoiceStateFlags {
  const quota = resolveInterviewActiveQuota(Number(input.callSeconds ?? 0));
  const hasCompletedVoiceInterview = Boolean(input.latestDiagnosticProfileId) || Boolean(input.voiceReportExecutiveReport);
  const hasEverStartedVoiceCall =
    Boolean(input.callId) ||
    Number(input.callsStarted ?? 0) > 0 ||
    quota.activeSeconds > 0 ||
    Number(input.minuteSummariesCount ?? 0) > 0 ||
    Boolean(input.hasFinalSummary) ||
    Boolean(input.hasVoiceReport);
  const hasRemainingInterviewTime = !quota.isExhausted;
  const hasLiveVoiceCall = Boolean(input.callId) && !hasCompletedVoiceInterview && hasRemainingInterviewTime;
  const isCallActivelyRunning = Boolean(input.voiceConnected) && input.voicePaused !== true;
  const isClosingWindow =
    isCallActivelyRunning &&
    hasRemainingInterviewTime &&
    quota.remainingSeconds <= input.closeoutBufferSec;
  const voiceCallExhausted =
    !hasCompletedVoiceInterview &&
    quota.isExhausted &&
    Boolean(
      input.callId ||
        Number(input.callsStarted ?? 0) > 0 ||
        quota.activeSeconds > 0 ||
        Number(input.minuteSummariesCount ?? 0) > 0 ||
        input.hasFinalSummary ||
        input.hasVoiceReport,
    );
  const voiceInterviewLocked = hasCompletedVoiceInterview || voiceCallExhausted;

  return {
    hasCompletedVoiceInterview,
    hasEverStartedVoiceCall,
    hasRemainingInterviewTime,
    hasLiveVoiceCall,
    isClosingWindow,
    voiceCallExhausted,
    voiceInterviewLocked,
  };
}
