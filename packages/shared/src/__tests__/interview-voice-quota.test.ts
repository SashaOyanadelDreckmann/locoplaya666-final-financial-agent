import { describe, expect, it } from 'vitest';
import {
  INTERVIEW_MAX_CALLS_PER_USER,
  INTERVIEW_TOTAL_LIMIT_SEC,
} from '../entrevista/interview.constants';
import {
  evaluateInterviewVoiceTokenGate,
  mergeInterviewVoiceQuotaMonotonic,
  resolveInterviewUsedSeconds,
} from '../entrevista/interview-voice-quota';

describe('interview voice quota contract', () => {
  it('never decreases consumed seconds on merge', () => {
    const merged = mergeInterviewVoiceQuotaMonotonic(
      { totalUsedSec: 95, callsStarted: 1 },
      { totalUsedSec: 12, callSeconds: 8, callsStarted: 0 },
    );
    expect(merged.totalUsedSec).toBe(95);
    expect(merged.callsStarted).toBe(1);
    expect(merged.remainingTotalSec).toBe(INTERVIEW_TOTAL_LIMIT_SEC - 95);
  });

  it('caps consumed seconds at 3 minutes', () => {
    expect(resolveInterviewUsedSeconds({ totalUsedSec: 999 })).toBe(INTERVIEW_TOTAL_LIMIT_SEC);
    const merged = mergeInterviewVoiceQuotaMonotonic(
      { totalUsedSec: 170 },
      { callSeconds: 200 },
    );
    expect(merged.totalUsedSec).toBe(INTERVIEW_TOTAL_LIMIT_SEC);
    expect(merged.remainingTotalSec).toBe(0);
  });

  it('never decreases callsStarted on merge', () => {
    const merged = mergeInterviewVoiceQuotaMonotonic(
      { callsStarted: 1, totalUsedSec: 0 },
      { callsStarted: 0, totalUsedSec: 40 },
    );
    expect(merged.callsStarted).toBe(1);
    expect(merged.totalUsedSec).toBe(40);
  });

  it('blocks fresh token when quota exhausted or max calls reached', () => {
    expect(
      evaluateInterviewVoiceTokenGate({
        callsStarted: 1,
        activeCallId: null,
        totalUsedSec: INTERVIEW_TOTAL_LIMIT_SEC,
        interviewCompleted: false,
      }).blockReason,
    ).toBe('exhausted');

    expect(
      evaluateInterviewVoiceTokenGate({
        callsStarted: INTERVIEW_MAX_CALLS_PER_USER,
        activeCallId: null,
        totalUsedSec: 30,
        interviewCompleted: false,
      }).blockReason,
    ).toBe('max_calls');

    expect(
      evaluateInterviewVoiceTokenGate({
        callsStarted: 1,
        activeCallId: 'call_resume',
        totalUsedSec: 30,
        interviewCompleted: false,
      }),
    ).toMatchObject({ allowed: true, isResume: true });
  });
});
