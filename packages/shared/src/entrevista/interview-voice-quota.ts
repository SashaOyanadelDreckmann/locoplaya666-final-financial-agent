import {
  INTERVIEW_MAX_CALLS_PER_USER,
  INTERVIEW_TOTAL_LIMIT_SEC,
} from './interview.constants';

export type InterviewVoiceQuotaSnapshot = {
  totalUsedSec?: number | null;
  total_used_sec?: number | null;
  callSeconds?: number | null;
  call_seconds?: number | null;
  remainingTotalSec?: number | null;
  remaining_total_sec?: number | null;
  callsStarted?: number | null;
  calls_started?: number | null;
};

function coerceNonNegativeInt(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.floor(value));
}

/** Resolves consumed seconds from one or more quota snapshots (max wins, capped at 3 min). */
export function resolveInterviewUsedSeconds(...sources: Array<unknown>): number {
  const values = sources
    .map((source) => {
      const direct = coerceNonNegativeInt(source);
      if (direct != null) return direct;
      if (!source || typeof source !== 'object') return 0;
      const record = source as InterviewVoiceQuotaSnapshot;
      const candidates = [
        record.totalUsedSec,
        record.total_used_sec,
        record.callSeconds,
        record.call_seconds,
      ];
      for (const candidate of candidates) {
        const parsed = coerceNonNegativeInt(candidate);
        if (parsed != null) return parsed;
      }
      const remaining = coerceNonNegativeInt(record.remaining_total_sec ?? record.remainingTotalSec);
      if (remaining != null) {
        return Math.max(0, INTERVIEW_TOTAL_LIMIT_SEC - remaining);
      }
      return 0;
    })
    .filter((value) => value >= 0);

  return Math.min(INTERVIEW_TOTAL_LIMIT_SEC, Math.max(0, ...values, 0));
}

export function resolveInterviewRemainingSeconds(totalUsedSec: number): number {
  const used = Math.min(
    INTERVIEW_TOTAL_LIMIT_SEC,
    Math.max(0, Math.floor(Number.isFinite(totalUsedSec) ? totalUsedSec : 0)),
  );
  return Math.max(0, INTERVIEW_TOTAL_LIMIT_SEC - used);
}

export function resolveInterviewCallsStarted(...sources: Array<unknown>): number {
  const values = sources
    .map((source) => {
      if (typeof source === 'number') return coerceNonNegativeInt(source) ?? 0;
      if (!source || typeof source !== 'object') return 0;
      const record = source as InterviewVoiceQuotaSnapshot;
      return (
        coerceNonNegativeInt(record.callsStarted) ??
        coerceNonNegativeInt(record.calls_started) ??
        0
      );
    })
    .filter((value) => value >= 0);

  return Math.min(INTERVIEW_MAX_CALLS_PER_USER, Math.max(0, ...values, 0));
}

/**
 * Monotonic merge for persisted interview voice quota.
 * Time and callsStarted never decrease — 3 minutes per user is the hard ceiling.
 */
export function mergeInterviewVoiceQuotaMonotonic(
  persisted: InterviewVoiceQuotaSnapshot,
  incoming: InterviewVoiceQuotaSnapshot,
): {
  totalUsedSec: number;
  callSeconds: number;
  remainingTotalSec: number;
  callsStarted: number;
  maxDurationSec: number;
} {
  const totalUsedSec = resolveInterviewUsedSeconds(persisted, incoming);
  const callsStarted = resolveInterviewCallsStarted(persisted, incoming);

  return {
    totalUsedSec,
    callSeconds: totalUsedSec,
    remainingTotalSec: resolveInterviewRemainingSeconds(totalUsedSec),
    callsStarted,
    maxDurationSec: INTERVIEW_TOTAL_LIMIT_SEC,
  };
}

export type InterviewVoiceTokenGateInput = {
  callsStarted: number;
  activeCallId: string | null;
  totalUsedSec: number;
  interviewCompleted: boolean;
};

export function evaluateInterviewVoiceTokenGate(input: InterviewVoiceTokenGateInput): {
  allowed: boolean;
  isResume: boolean;
  remainingSec: number;
  blockReason?: 'exhausted' | 'completed' | 'max_calls';
} {
  const totalUsedSec = Math.min(INTERVIEW_TOTAL_LIMIT_SEC, Math.max(0, Math.floor(input.totalUsedSec)));
  const remainingSec = resolveInterviewRemainingSeconds(totalUsedSec);
  const activeCallId =
    typeof input.activeCallId === 'string' && input.activeCallId.length > 0 ? input.activeCallId : null;
  const isResume = Boolean(activeCallId);

  if (input.interviewCompleted) {
    return { allowed: false, isResume, remainingSec, blockReason: 'completed' };
  }
  if (remainingSec <= 0) {
    return { allowed: false, isResume, remainingSec, blockReason: 'exhausted' };
  }
  if (!isResume && input.callsStarted >= INTERVIEW_MAX_CALLS_PER_USER) {
    return { allowed: false, isResume, remainingSec, blockReason: 'max_calls' };
  }

  return { allowed: true, isResume, remainingSec };
}
