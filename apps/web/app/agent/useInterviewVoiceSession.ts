'use client';

import { useEffect, useRef } from 'react';

import {
  abortInterviewRealtimeToken,
  finalizeInterviewVoiceCall,
  getInterviewRealtimeToken,
} from '@/lib/api';
import { toUserFacingError } from '@/lib/userError';
import {
  clearInterviewVoiceState,
} from '@/lib/interviewVoiceState';
import { INTERVIEW_MAX_CALLS_PER_USER, INTERVIEW_TOTAL_LIMIT_SEC } from '@financial-agent/shared';
import {
  type InterviewVoiceReport,
  type InterviewVoiceSnapshot,
  type InterviewVoiceSummaryEntry,
  type VoiceSessionContext,
} from './interview-modal.context';

export type UseInterviewVoiceSessionParams = {
  isOpen: boolean;
  voiceSupported: boolean;
  voiceConnecting: boolean;
  voiceConnected: boolean;
  voicePaused: boolean;
  voiceSpeaking: boolean;
  summaryGenerating: boolean;
  isFinalizingCall: boolean;
  voiceCallExhausted: boolean;
  voiceInterviewLocked: boolean;
  hasLiveVoiceCall: boolean;
  hasEverStartedVoiceCall: boolean;
  hasRemainingInterviewTime: boolean;
  voiceSessionReady: boolean;
  voiceReport: InterviewVoiceReport | null;
  callId: string | null;
  callSeconds: number;
  callsStarted: number;
  maxCallDurationSec: number;
  remainingTotalSec: number | null;
  currentQuestion: string;
  currentBlockLabel: string;
  voiceAgentTranscript: string;
  minuteSummaries: InterviewVoiceSummaryEntry[];
  finalSummary: InterviewVoiceSnapshot['finalSummary'];
  voiceUserTranscript: string;
  voicePartialTranscript: string;
  intake: unknown;
  completedBlocks: Record<string, { summary?: string; signalsDetected?: string[] }>;
  transcriptEntries: Array<{ blockId?: string; answer?: string }>;
  onSetVoiceConnected: (value: boolean) => void;
  onSetVoiceConnecting: (value: boolean) => void;
  onSetVoiceListening: (value: boolean) => void;
  onSetVoiceSpeaking: (value: boolean) => void;
  onSetVoiceSessionReady: (value: boolean) => void;
  onSetVoiceError: (value: string | null) => void;
  onSetVoicePaused: (value: boolean) => void;
  onSetPauseUsed: (value: boolean) => void;
  onSetCallSeconds: (value: number) => void;
  onSetMaxCallDurationSec: (value: number) => void;
  onSetRemainingTotalSec: (value: number | null) => void;
  onSetCallId: (value: string | null) => void;
  onSetCallsStarted: (value: number | ((prev: number) => number)) => void;
  onSetVoiceReport: (value: InterviewVoiceReport | null) => void;
  onSetMinuteSummaries: (value: InterviewVoiceSummaryEntry[]) => void;
  onSetFinalSummary: (value: InterviewVoiceSnapshot['finalSummary']) => void;
  onSetVoiceAgentTranscript: (value: string) => void;
  onSetVoiceUserTranscript: (value: string | ((prev: string) => string)) => void;
  onSetVoicePartialTranscript: (value: string) => void;
  onSetIsFinalizingCall: (value: boolean) => void;
  onSetIsGeneratingDiagnosis: (value: boolean) => void;
  onSetSummaryGenerating: (value: boolean) => void;
  onSetSyncError: (value: string | null) => void;
  onSetBootError: (value: string | null) => void;
  onSetResponse: (value: unknown) => void;
  onSetProfile: (value: unknown) => void;
  onOnDiagnosisComplete?: () => void;
  onHandleUnauthorized: (error: unknown) => boolean;
  onToUserFacingError: typeof toUserFacingError;
  onEmitVoiceSessionContext: (options?: {
    latestUserSnippet?: string;
    callPhase?: 'exploration' | 'closeout';
    startingFocus?: string;
    triggerResponse?: boolean;
  }) => void;
  onSendVoiceEvent: (payload: Record<string, unknown>) => void;
  onVoiceSessionReadyRef: React.MutableRefObject<boolean>;
  onVoiceAutoFinalizeRef: React.MutableRefObject<boolean>;
  onVoiceFinalizeTriggeredRef: React.MutableRefObject<boolean>;
  onSummaryRequestRef: React.MutableRefObject<{ kind: 'minute' | 'final'; minute?: number } | null>;
  onSummaryDraftRef: React.MutableRefObject<string>;
  onSummaryMinuteAppliedRef: React.MutableRefObject<number>;
  onVoiceResumeModeRef: React.MutableRefObject<boolean>;
  onTokenIssuedRef: React.MutableRefObject<boolean>;
  onCallSecondsRef: React.MutableRefObject<number>;
  onPendingInitialResponseRef: React.MutableRefObject<{ question: string; resetTranscript?: boolean } | null>;
  onVoiceSessionContextRef: React.MutableRefObject<VoiceSessionContext>;
  onDataChannelRef: React.MutableRefObject<RTCDataChannel | null>;
  onPeerConnectionRef: React.MutableRefObject<RTCPeerConnection | null>;
  onLocalStreamRef: React.MutableRefObject<MediaStream | null>;
  onRemoteAudioRef: React.MutableRefObject<HTMLAudioElement | null>;
  onEventIdRef: React.MutableRefObject<number>;
  onCurrentBlockLabel: string;
  onResolveVoiceCapabilityIssue: () => string | null;
  onPrimeVoiceQuestion: (question: string, options?: { resetTranscript?: boolean }) => void;
  onCurrentQuestion: string;
  onCanResumeExistingVoiceSession: () => boolean;
  onResumeExistingVoiceSession: () => boolean;
  onToggleCallPause: () => void;
  onApplyVoiceTranscriptAsAnswer: () => Promise<void>;
  onFinalizeCallAndGenerateReport: (endedBy: 'timeout' | 'agent' | 'user', options?: { durationSecOverride?: number }) => Promise<void>;
  onStartOrResumeVoiceSession: () => Promise<void>;
  onCleanupVoiceSession: () => void;
  onWait: (ms: number) => Promise<void>;
  onCallTimeLabel: string;
  onMaxCallTimeLabel: string;
  onWorkspaceCoachNote: string;
  onStageLabel: string;
  onCurrentSummary: string | null;
  onBlockId: string | undefined;
  onAnswerInBlock: string[];
  onCompletedBlocks: Record<string, { summary?: string; signalsDetected?: string[] }>;
  onTranscriptEntries: Array<{ blockId?: string; answer?: string }>;
  onIntake: unknown;
  onSetResponseData: (value: unknown) => void;
  onSetBootState: (value: unknown) => void;
  onCallProgressPct: number;
};

export function useInterviewVoiceSession(params: UseInterviewVoiceSessionParams) {
  const tokenIssuedRef = params.onTokenIssuedRef;
  const voiceResumeModeRef = params.onVoiceResumeModeRef;
  const voiceAutoFinalizeRef = params.onVoiceAutoFinalizeRef;
  const voiceFinalizeTriggeredRef = params.onVoiceFinalizeTriggeredRef;
  const summaryRequestRef = params.onSummaryRequestRef;
  const summaryDraftRef = params.onSummaryDraftRef;
  const summaryMinuteAppliedRef = params.onSummaryMinuteAppliedRef;
  const callSecondsRef = params.onCallSecondsRef;
  const pendingInitialResponseRef = params.onPendingInitialResponseRef;
  const voiceSessionContextRef = params.onVoiceSessionContextRef;
  const dataChannelRef = params.onDataChannelRef;
  const peerConnectionRef = params.onPeerConnectionRef;
  const localStreamRef = params.onLocalStreamRef;
  const remoteAudioRef = params.onRemoteAudioRef;
  const eventIdRef = params.onEventIdRef;

  function sendVoiceEvent(payload: Record<string, unknown>) {
    const dc = dataChannelRef.current;
    if (!dc || dc.readyState !== 'open') return;
    eventIdRef.current += 1;
    dc.send(JSON.stringify({ event_id: `voice-event-${eventIdRef.current}`, ...payload }));
  }

  function cleanupVoiceSession() {
    params.onSetVoiceConnected(false);
    params.onSetVoiceConnecting(false);
    params.onSetVoiceListening(false);
    params.onSetVoiceSpeaking(false);
    params.onSetVoicePaused(false);
    params.onSetVoiceError(null);
    params.onSetSummaryGenerating(false);
    params.onSetVoiceSessionReady(false);
    voiceResumeModeRef.current = false;
    params.onSetVoiceError(null);
    summaryRequestRef.current = null;
    summaryDraftRef.current = '';
    if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
      try { dataChannelRef.current.close(); } catch {}
    }
    if (peerConnectionRef.current) {
      try { peerConnectionRef.current.close(); } catch {}
    }
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    peerConnectionRef.current = null;
    dataChannelRef.current = null;
    if (remoteAudioRef.current) {
      remoteAudioRef.current.pause();
      remoteAudioRef.current.srcObject = null;
    }
  }

  async function startVoiceSession() {
    if (!params.voiceSupported || params.voiceConnecting || params.voiceConnected) return;
    if (params.voiceCallExhausted && !params.hasLiveVoiceCall) {
      params.onSetVoiceError('El tiempo de la entrevista se agotó. Genera el informe con el botón inferior.');
      return;
    }
    if (params.voiceInterviewLocked && !params.hasLiveVoiceCall) {
      params.onSetVoiceError('Esta entrevista senior ya quedó cerrada y no admite otra llamada.');
      return;
    }
    if (!params.hasLiveVoiceCall && params.callsStarted >= INTERVIEW_MAX_CALLS_PER_USER) {
      params.onSetVoiceError('Solo se permite una llamada por usuario en esta entrevista.');
      return;
    }
    const capabilityIssue = params.onResolveVoiceCapabilityIssue();
    if (capabilityIssue) { params.onSetVoiceError(capabilityIssue); return; }

    params.onSetVoiceError(null);
    params.onSetVoiceConnecting(true);
    summaryRequestRef.current = null;
    params.onSetVoiceConnected(false);
    try {
      const token = await getInterviewRealtimeToken();
      const ephemeralKey = token?.value;
      if (!ephemeralKey) throw new Error('No se recibió un client_secret válido');
      const tokenCallId = typeof token?.call_id === 'string' ? token.call_id : null;
      const hasPersistedCall =
        !params.voiceReport &&
        (Boolean(params.callId) || params.callSeconds > 0 || params.minuteSummaries.length > 0 || Boolean(params.finalSummary));
      const nextCallId = tokenCallId ?? (hasPersistedCall ? params.callId : null) ?? null;
      voiceResumeModeRef.current = hasPersistedCall;
      tokenIssuedRef.current = true;
      params.onSetCallId(nextCallId);
      params.onSetCallsStarted(typeof token?.calls_used === 'number' ? Math.max(0, Math.floor(token.calls_used)) : 1);
      params.onSetMaxCallDurationSec(
        typeof token?.max_duration_sec === 'number' && token.max_duration_sec > 0
          ? Math.max(1, Math.floor(token.max_duration_sec))
          : INTERVIEW_TOTAL_LIMIT_SEC,
      );
      params.onSetRemainingTotalSec(
        typeof token?.remaining_total_sec === 'number' ? Math.max(0, Math.floor(token.remaining_total_sec)) : null,
      );
      if (!hasPersistedCall) {
        params.onSetCallSeconds(0);
        params.onSetPauseUsed(false);
        params.onSetVoiceReport(null);
        params.onSetMinuteSummaries([]);
        params.onSetFinalSummary(null);
        params.onSetVoiceAgentTranscript('');
        params.onSetVoiceUserTranscript('');
        params.onSetVoicePartialTranscript('');
      }
      const pc = new RTCPeerConnection();
      peerConnectionRef.current = pc;
      const audio = new Audio();
      audio.autoplay = true;
      remoteAudioRef.current = audio;
      pc.ontrack = (event) => { audio.srcObject = event.streams[0]; };
      const stream = localStreamRef.current ?? (await navigator.mediaDevices.getUserMedia({ audio: true }));
      localStreamRef.current = stream;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      const dc = pc.createDataChannel('oai-events');
      dataChannelRef.current = dc;
      dc.addEventListener('open', () => {
        tokenIssuedRef.current = false;
        params.onSetVoiceConnected(true);
        params.onSetVoiceConnecting(false);
        params.onPendingInitialResponseRef.current = { question: params.onCurrentQuestion, resetTranscript: !hasPersistedCall };
        params.onEmitVoiceSessionContext({ startingFocus: params.onCurrentQuestion, triggerResponse: false });
      });
      dc.addEventListener('close', cleanupVoiceSession);
      dc.addEventListener('message', (event) => {
        try {
          const payload = JSON.parse(event.data);
          const type = String(payload?.type ?? '');
          if (type === 'input_audio_buffer.speech_started') params.onSetVoiceListening(true);
          if (type === 'input_audio_buffer.speech_stopped') params.onSetVoiceListening(false);
          if (type === 'response.created') params.onSetVoiceSpeaking(true);
          if (type === 'session.updated') {
            params.onSetVoiceSessionReady(true);
            const pending = pendingInitialResponseRef.current;
            if (pending) {
              pendingInitialResponseRef.current = null;
              params.onPrimeVoiceQuestion(pending.question, { resetTranscript: pending.resetTranscript });
            }
          }
          if (type === 'response.output_text.delta' || type === 'response.text.delta') {
            const chunk = String(payload.delta ?? payload.text ?? '').trim();
            if (chunk) {
              summaryDraftRef.current = summaryDraftRef.current ? `${summaryDraftRef.current} ${chunk}`.trim() : chunk;
              params.onSetVoiceAgentTranscript(summaryDraftRef.current);
            }
          }
          if (type === 'response.output_text.done' || type === 'response.text.done') {
            const doneChunk = String(payload.text ?? payload.output_text ?? payload.output ?? '').trim();
            if (doneChunk && !summaryDraftRef.current) {
              summaryDraftRef.current = doneChunk;
              params.onSetVoiceAgentTranscript(doneChunk);
            }
          }
          if (type === 'response.done') {
            params.onSetVoiceSpeaking(false);
            const responseStatus = String(payload?.response?.status ?? '');
            const activeRequest = summaryRequestRef.current;
            if (activeRequest) {
              const parsed = (payload?.response?.text || summaryDraftRef.current) ? {
                summary: String(payload?.response?.text ?? summaryDraftRef.current),
                keyFindings: [],
                confidence: 'medium' as const,
                createdAt: new Date().toISOString(),
                minute: activeRequest.minute ?? Math.max(1, Math.ceil(callSecondsRef.current / 60)),
              } : null;
              if (responseStatus === 'completed' && parsed) {
                if (activeRequest.kind === 'final') {
                  params.onSetFinalSummary({
                    summary: parsed.summary,
                    keyFindings: parsed.keyFindings,
                    confidence: parsed.confidence,
                    createdAt: parsed.createdAt,
                  });
                } else {
                  params.onSetMinuteSummaries([
                    ...params.minuteSummaries.filter((item) => item.minute !== parsed.minute),
                    {
                      minute: parsed.minute,
                      summary: parsed.summary,
                      keyFindings: parsed.keyFindings,
                      confidence: parsed.confidence,
                      createdAt: parsed.createdAt,
                    },
                  ]);
                }
              }
              summaryRequestRef.current = null;
              summaryDraftRef.current = '';
              params.onSetSummaryGenerating(false);
            }
          }
        } catch {}
      });
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const sdpResponse = await fetch('https://api.openai.com/v1/realtime/calls', {
        method: 'POST',
        body: offer.sdp,
        headers: { Authorization: `Bearer ${ephemeralKey}`, 'Content-Type': 'application/sdp' },
      });
      if (!sdpResponse.ok) throw new Error(await sdpResponse.text());
      await pc.setRemoteDescription({ type: 'answer', sdp: await sdpResponse.text() });
    } catch (error) {
      if (params.onHandleUnauthorized(error)) return;
      cleanupVoiceSession();
      voiceResumeModeRef.current = false;
      params.onSetVoiceConnecting(false);
      if (tokenIssuedRef.current) {
        tokenIssuedRef.current = false;
        params.onSetCallsStarted((prev) => Math.max(0, prev - 1));
        void abortInterviewRealtimeToken().catch(() => {});
      }
      params.onSetVoiceError(error instanceof Error ? error.message : 'No se pudo iniciar la llamada');
    }
  }

  useEffect(() => () => cleanupVoiceSession(), []);

  return {
    cleanupVoiceSession,
    startVoiceSession,
    sendVoiceEvent,
  };
}
