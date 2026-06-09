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
  const hasCompletedVoiceInterview = Boolean(input.latestDiagnosticProfileId) || Boolean(input.voiceReportExecutiveReport);
  const hasEverStartedVoiceCall =
    Boolean(input.callId) ||
    Number(input.callsStarted ?? 0) > 0 ||
    Number(input.callSeconds ?? 0) > 0 ||
    Number(input.minuteSummariesCount ?? 0) > 0 ||
    Boolean(input.hasFinalSummary) ||
    Boolean(input.hasVoiceReport);
  const hasRemainingInterviewTime =
    input.remainingTotalSec === null
      ? Number(input.callSeconds ?? 0) < Number(input.maxCallDurationSec ?? 0)
      : Number(input.remainingTotalSec ?? 0) > 0;
  const hasLiveVoiceCall = Boolean(input.callId) && !hasCompletedVoiceInterview && hasRemainingInterviewTime;
  const isClosingWindow =
    Boolean(input.voiceConnected) &&
    hasRemainingInterviewTime &&
    (input.remainingTotalSec ?? Math.max(0, Number(input.maxCallDurationSec ?? 0) - Number(input.callSeconds ?? 0))) <=
      input.closeoutBufferSec;
  const voiceCallExhausted =
    !hasCompletedVoiceInterview &&
    !hasRemainingInterviewTime &&
    Boolean(
      input.callId ||
        Number(input.callsStarted ?? 0) > 0 ||
        Number(input.callSeconds ?? 0) > 0 ||
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
