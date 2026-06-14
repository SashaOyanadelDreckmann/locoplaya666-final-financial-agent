import {
  canEndInterviewCallEarly,
  measureActiveCallSeconds,
  resolveInterviewActiveQuota,
  resolveInterviewModalLoadingState,
  resolveInterviewVoiceStateFlags,
  resolveUsedSecondsFromSources,
} from '../modales/entrevista/interview-modal.helpers';
import { INTERVIEW_MIN_EARLY_END_SEC, INTERVIEW_TOTAL_LIMIT_SEC } from '@financial-agent/shared';

describe('interview modal helpers', () => {
  it('resolves used seconds from server and client sources', () => {
    expect(resolveUsedSecondsFromSources({ total_used_sec: 42 })).toBe(42);
    expect(resolveUsedSecondsFromSources({ callSeconds: 55 }, { totalUsedSec: 48 })).toBe(55);
    expect(resolveUsedSecondsFromSources({ remaining_total_sec: 120 })).toBe(60);
  });

  it('measures active call seconds with wall-clock segments', () => {
    const now = 1_700_000_000_000;
    expect(
      measureActiveCallSeconds({
        accumulatedSec: 40,
        segmentStartedAtMs: now - 7_500,
        segmentLive: true,
        nowMs: now,
      }),
    ).toBe(47);

    expect(
      measureActiveCallSeconds({
        accumulatedSec: 40,
        segmentStartedAtMs: now - 7_500,
        segmentLive: false,
        nowMs: now,
      }),
    ).toBe(40);
  });

  it('requires at least 30 active seconds before early call end', () => {
    expect(INTERVIEW_MIN_EARLY_END_SEC).toBe(30);
    expect(canEndInterviewCallEarly(29)).toBe(false);
    expect(canEndInterviewCallEarly(30)).toBe(true);
    expect(canEndInterviewCallEarly(90)).toBe(true);
  });

  it('derives remaining quota from active seconds only', () => {
    expect(resolveInterviewActiveQuota(0)).toEqual({
      activeSeconds: 0,
      remainingSeconds: INTERVIEW_TOTAL_LIMIT_SEC,
      isExhausted: false,
    });
    expect(resolveInterviewActiveQuota(179)).toEqual({
      activeSeconds: 179,
      remainingSeconds: 1,
      isExhausted: false,
    });
    expect(resolveInterviewActiveQuota(180)).toEqual({
      activeSeconds: 180,
      remainingSeconds: 0,
      isExhausted: true,
    });
    expect(resolveInterviewActiveQuota(999)).toEqual({
      activeSeconds: 180,
      remainingSeconds: 0,
      isExhausted: true,
    });
  });

  it('keeps the modal in loading until intake is ready or no longer required', () => {
    expect(
      resolveInterviewModalLoadingState({
        intakeReady: false,
        hasIntake: false,
        bootError: null,
        sessionAlreadyCompleted: false,
        hasDiagnosis: false,
      }),
    ).toBe(true);

    expect(
      resolveInterviewModalLoadingState({
        intakeReady: true,
        hasIntake: false,
        bootError: 'No se encontró información de perfil.',
        sessionAlreadyCompleted: false,
        hasDiagnosis: false,
      }),
    ).toBe(false);

    expect(
      resolveInterviewModalLoadingState({
        intakeReady: true,
        hasIntake: false,
        bootError: null,
        sessionAlreadyCompleted: true,
        hasDiagnosis: false,
      }),
    ).toBe(false);
  });

  it('marks an interview as locked only when it is actually completed or exhausted', () => {
    const active = resolveInterviewVoiceStateFlags({
      callId: 'call-1',
      callsStarted: 1,
      callSeconds: 44,
      minuteSummariesCount: 1,
      hasFinalSummary: true,
      hasVoiceReport: false,
      remainingTotalSec: 120,
      maxCallDurationSec: 180,
      closeoutBufferSec: 25,
      voiceConnected: true,
    } as unknown as Parameters<typeof resolveInterviewVoiceStateFlags>[0]);

    expect(active.hasCompletedVoiceInterview).toBe(false);
    expect(active.hasEverStartedVoiceCall).toBe(true);
    expect(active.hasRemainingInterviewTime).toBe(true);
    expect(active.hasLiveVoiceCall).toBe(true);
    expect(active.isClosingWindow).toBe(false);
    expect(active.voiceCallExhausted).toBe(false);
    expect(active.voiceInterviewLocked).toBe(false);

    const pausedNearCloseout = resolveInterviewVoiceStateFlags({
      callId: 'call-paused',
      callsStarted: 1,
      callSeconds: 160,
      minuteSummariesCount: 1,
      hasFinalSummary: false,
      hasVoiceReport: false,
      remainingTotalSec: 20,
      maxCallDurationSec: 180,
      closeoutBufferSec: 25,
      voiceConnected: true,
      voicePaused: true,
    } as unknown as Parameters<typeof resolveInterviewVoiceStateFlags>[0]);

    expect(pausedNearCloseout.isClosingWindow).toBe(false);

    const exhausted = resolveInterviewVoiceStateFlags({
      callId: 'call-2',
      callsStarted: 1,
      callSeconds: 180,
      minuteSummariesCount: 2,
      hasFinalSummary: true,
      hasVoiceReport: false,
      remainingTotalSec: 0,
      maxCallDurationSec: 180,
      closeoutBufferSec: 25,
      voiceConnected: false,
    });

    expect(exhausted.hasCompletedVoiceInterview).toBe(false);
    expect(exhausted.hasRemainingInterviewTime).toBe(false);
    expect(exhausted.voiceCallExhausted).toBe(true);
    expect(exhausted.voiceInterviewLocked).toBe(true);

    const completed = resolveInterviewVoiceStateFlags({
      latestDiagnosticProfileId: 'profile-1',
      voiceReportExecutiveReport: 'Informe listo',
      callId: 'call-3',
      callsStarted: 1,
      callSeconds: 120,
      minuteSummariesCount: 2,
      hasFinalSummary: true,
      hasVoiceReport: true,
      remainingTotalSec: 40,
      maxCallDurationSec: 180,
      closeoutBufferSec: 25,
      voiceConnected: false,
    });

    expect(completed.hasCompletedVoiceInterview).toBe(true);
    expect(completed.hasLiveVoiceCall).toBe(false);
    expect(completed.voiceInterviewLocked).toBe(true);
  });
});
