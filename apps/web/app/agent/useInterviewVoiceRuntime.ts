'use client';

import { useEffect, useRef, useState } from 'react';

import {
  abortInterviewRealtimeToken,
  finalizeInterviewVoiceCall,
  getInterviewRealtimeToken,
  nextConversationStep,
  saveInterviewVoiceState,
} from '@/lib/api';
import { toUserFacingError } from '@/lib/userError';
import type { DiagnosisProfile } from '@/state/profile.store';
import type { InterviewResponse } from '@/state/interview.store';
import {
  clearInterviewVoiceState,
  flushInterviewVoiceStateOnPageHide,
  writeInterviewVoiceState,
} from '@/lib/interviewVoiceState';
import {
  INTERVIEW_CLOSEOUT_BUFFER_SEC,
  INTERVIEW_MAX_CALLS_PER_USER,
  INTERVIEW_TOTAL_LIMIT_SEC,
} from '@financial-agent/shared';
import type { InterviewIntakeWithContext } from './interview-modal.hydration';
import {
  resolveInterviewVoiceStateFlags,
  type InterviewVoiceReport,
  type InterviewVoiceSnapshot,
  type InterviewVoiceSummaryEntry,
  type VoiceSessionContext,
} from './interview-modal.context';
import { emitVoiceSessionContext, resolveVoiceCapabilityIssue } from './interview-modal.voice-session';
import { resolveInterviewActiveQuota } from './interview-modal.helpers';
import {
  buildSummaryInstructions,
  normalizeSummaryText,
  parseSummaryPayload,
  waitMs,
} from './interview-modal.voice-summary';

const DEFAULT_MAX_CALL_DURATION_SEC = INTERVIEW_TOTAL_LIMIT_SEC;

type PendingFinalizePayload = {
  endedBy: 'timeout' | 'agent';
  durationSec: number;
  minuteSummaryPayload: Array<{
    minute: number;
    summary: string;
    keyFindings: string[];
    confidence: 'high' | 'medium' | 'low';
    createdAt: string;
  }>;
  fallbackFinalSummary: {
    summary: string;
    keyFindings: string[];
    confidence?: 'high' | 'medium' | 'low';
    createdAt: string;
  } | null;
};

export type InterviewVoiceRuntimeParams = {
  isOpen: boolean;
  intake: InterviewIntakeWithContext | null;
  transcriptEntries: Array<{ blockId?: string; answer?: string }>;
  completedBlocks: Record<string, { summary?: string; signalsDetected?: string[] }>;
  interviewTranscriptSnapshot: string;
  currentQuestion: string;
  currentBlockLabel: string;
  currentSummary: string;
  awaitingSummaryValidation: boolean;
  blockId: string | undefined;
  answersInBlock: string[];
  handleUnauthorized: (error: unknown) => boolean;
  onDiagnosisComplete?: () => void;
  addAnswer: (blockId: string, answer: string) => void;
  resetBlock: (blockId: string) => void;
  setResponse: (response: InterviewResponse | null) => void;
  setProfile: (profile: DiagnosisProfile | null) => void;
  onBootError: (message: string | null) => void;
};

export function useInterviewVoiceRuntime(params: InterviewVoiceRuntimeParams) {
  const {
    isOpen,
    intake,
    transcriptEntries,
    completedBlocks,
    interviewTranscriptSnapshot,
    currentQuestion,
    currentBlockLabel,
    currentSummary,
    awaitingSummaryValidation,
    blockId,
    answersInBlock,
    handleUnauthorized,
    onDiagnosisComplete,
    addAnswer,
    resetBlock,
    setResponse,
    setProfile,
    onBootError,
  } = params;

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const eventIdRef = useRef(0);
  const voiceSyncTimerRef = useRef<number | null>(null);
  const tokenIssuedRef = useRef(false);
  const voiceStateHydratedRef = useRef(false);
  const voiceSessionContextRef = useRef<VoiceSessionContext>({
    intake: null,
    transcriptEntries: [],
    minuteSummaries: [],
    finalSummary: null,
    completedBlocks: {},
    currentQuestion: '',
  });
  const sendVoiceEventRef = useRef<((payload: Record<string, unknown>) => void) | null>(null);
  const voiceResumeModeRef = useRef(false);
  const voiceAutoFinalizeRef = useRef(false);
  const voiceFinalizeTriggeredRef = useRef(false);
  const closeoutPromptSentRef = useRef(false);
  const pendingInitialResponseRef = useRef<{ question: string; resetTranscript: boolean } | null>(null);
  const summaryRequestRef = useRef<{ kind: 'minute' | 'final'; minute?: number } | null>(null);
  const summaryDraftRef = useRef('');
  const summaryMinuteAppliedRef = useRef(0);
  const callSecondsRef = useRef(0);
  const pendingFinalizeRef = useRef<PendingFinalizePayload | null>(null);
  const latestVoiceSnapshotRef = useRef<InterviewVoiceSnapshot | null>(null);

  const [voiceSupported, setVoiceSupported] = useState(false);
  const [voiceConnecting, setVoiceConnecting] = useState(false);
  const [voiceConnected, setVoiceConnected] = useState(false);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceSpeaking, setVoiceSpeaking] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceAgentTranscript, setVoiceAgentTranscript] = useState('');
  const [voiceUserTranscript, setVoiceUserTranscript] = useState('');
  const [voicePartialTranscript, setVoicePartialTranscript] = useState('');
  const [minuteSummaries, setMinuteSummaries] = useState<InterviewVoiceSummaryEntry[]>([]);
  const [finalSummary, setFinalSummary] = useState<InterviewVoiceSnapshot['finalSummary']>(null);
  const [voicePaused, setVoicePaused] = useState(false);
  const [pauseUsed, setPauseUsed] = useState(false);
  const [callSeconds, setCallSeconds] = useState(0);
  const [maxCallDurationSec, setMaxCallDurationSec] = useState(DEFAULT_MAX_CALL_DURATION_SEC);
  const [remainingTotalSec, setRemainingTotalSec] = useState<number | null>(null);
  const [callId, setCallId] = useState<string | null>(null);
  const [callsStarted, setCallsStarted] = useState(0);
  const [latestDiagnosticProfileId, setLatestDiagnosticProfileId] = useState<string | null>(null);
  const [isFinalizingCall, setIsFinalizingCall] = useState(false);
  const [voiceReport, setVoiceReport] = useState<InterviewVoiceReport | null>(null);
  const [summaryGenerating, setSummaryGenerating] = useState(false);
  const [voiceSessionReady, setVoiceSessionReady] = useState(false);
  const [isGeneratingDiagnosis, setIsGeneratingDiagnosis] = useState(false);
  const [canRetryDiagnosis, setCanRetryDiagnosis] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    voiceSessionContextRef.current = {
      intake,
      transcriptEntries,
      minuteSummaries,
      finalSummary,
      completedBlocks,
      currentQuestion,
    };
  }, [intake, transcriptEntries, minuteSummaries, finalSummary, completedBlocks, currentQuestion]);

  const voiceFlags = resolveInterviewVoiceStateFlags({
    latestDiagnosticProfileId,
    voiceReportExecutiveReport: voiceReport?.executive_report ?? null,
    callId,
    callsStarted,
    callSeconds,
    minuteSummariesCount: minuteSummaries.length,
    hasFinalSummary: Boolean(finalSummary),
    hasVoiceReport: Boolean(voiceReport),
    remainingTotalSec,
    maxCallDurationSec,
    closeoutBufferSec: INTERVIEW_CLOSEOUT_BUFFER_SEC,
    voiceConnected,
  });

  function syncActiveQuota(activeSeconds: number) {
    const quota = resolveInterviewActiveQuota(activeSeconds);
    callSecondsRef.current = quota.activeSeconds;
    setCallSeconds(quota.activeSeconds);
    setRemainingTotalSec(quota.remainingSeconds);
    setMaxCallDurationSec(INTERVIEW_TOTAL_LIMIT_SEC);
    return quota;
  }

  function buildPersistSnapshot(status: InterviewVoiceSnapshot['status']): InterviewVoiceSnapshot {
    const quota = resolveInterviewActiveQuota(callSecondsRef.current || callSeconds);
    return {
      callsStarted,
      callId: callId ?? undefined,
      activeCallId: callId ?? undefined,
      status,
      callSeconds: quota.activeSeconds,
      maxDurationSec: INTERVIEW_TOTAL_LIMIT_SEC,
      remainingTotalSec: quota.remainingSeconds,
      pauseUsed,
      minuteSummaries,
      finalSummary,
      completedAt: voiceReport ? new Date().toISOString() : undefined,
      voiceReport,
    };
  }

  function persistVoiceSnapshot(status: InterviewVoiceSnapshot['status']) {
    const snapshot = buildPersistSnapshot(status);
    writeInterviewVoiceState(snapshot);
    return snapshot;
  }

  function resetVoiceRuntimeState(options?: { preserveDiagnosisSignals?: boolean }) {
    const preserveDiagnosisSignals = options?.preserveDiagnosisSignals === true;
    setVoiceConnecting(false);
    setVoiceConnected(false);
    setVoiceListening(false);
    setVoiceSpeaking(false);
    setVoiceError(null);
    setVoicePaused(false);
    if (!preserveDiagnosisSignals) {
      setPauseUsed(false);
      setCallSeconds(0);
      setMaxCallDurationSec(DEFAULT_MAX_CALL_DURATION_SEC);
      setRemainingTotalSec(null);
      setCallId(null);
      setCallsStarted(0);
      setLatestDiagnosticProfileId(null);
      setVoiceReport(null);
      setMinuteSummaries([]);
      setFinalSummary(null);
    }
    setIsFinalizingCall(false);
    setIsGeneratingDiagnosis(false);
    setCanRetryDiagnosis(false);
    setSyncError(null);
    pendingFinalizeRef.current = null;
    setVoiceAgentTranscript('');
    setVoiceUserTranscript('');
    setVoicePartialTranscript('');
    setSummaryGenerating(false);
    setVoiceSessionReady(false);
    voiceStateHydratedRef.current = false;
    voiceAutoFinalizeRef.current = false;
    voiceFinalizeTriggeredRef.current = false;
    closeoutPromptSentRef.current = false;
    pendingInitialResponseRef.current = null;
    summaryRequestRef.current = null;
    summaryDraftRef.current = '';
    summaryMinuteAppliedRef.current = 0;
  }

  function applyHydratedVoiceState(state: {
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
    summaryMinuteApplied: number;
    voiceUserTranscript: string;
  }) {
    setCallsStarted(state.callsStarted);
    setCallSeconds(state.callSeconds);
    setMaxCallDurationSec(state.maxCallDurationSec);
    setRemainingTotalSec(state.remainingTotalSec);
    setCallId(state.callId);
    setPauseUsed(state.pauseUsed);
    setMinuteSummaries(state.minuteSummaries);
    setFinalSummary(state.finalSummary);
    if (state.voiceReport) setVoiceReport(state.voiceReport);
    if (state.latestDiagnosticProfileId) setLatestDiagnosticProfileId(state.latestDiagnosticProfileId);
    summaryMinuteAppliedRef.current = state.summaryMinuteApplied;
    if (state.voiceUserTranscript) setVoiceUserTranscript(state.voiceUserTranscript);
    syncActiveQuota(state.callSeconds);
    voiceStateHydratedRef.current = true;
  }

  function cleanupVoiceSession() {
    setVoiceConnected(false);
    setVoiceConnecting(false);
    setVoiceListening(false);
    setVoiceSpeaking(false);
    setVoicePaused(false);
    setVoiceError(null);
    setSummaryGenerating(false);
    setVoiceSessionReady(false);
    voiceResumeModeRef.current = false;
    closeoutPromptSentRef.current = false;
    summaryRequestRef.current = null;
    summaryDraftRef.current = '';
    if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
      try {
        dataChannelRef.current.close();
      } catch {}
    }
    if (peerConnectionRef.current) {
      try {
        peerConnectionRef.current.close();
      } catch {}
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

  function nextVoiceEventId() {
    eventIdRef.current += 1;
    return `voice-event-${eventIdRef.current}`;
  }

  function sendVoiceEvent(payload: Record<string, unknown>) {
    const dc = dataChannelRef.current;
    if (!dc || dc.readyState !== 'open') return;
    dc.send(JSON.stringify({ event_id: nextVoiceEventId(), ...payload }));
  }

  sendVoiceEventRef.current = sendVoiceEvent;

  function pushVoiceSessionContext(options?: {
    latestUserSnippet?: string;
    callPhase?: 'exploration' | 'closeout';
    startingFocus?: string;
    triggerResponse?: boolean;
  }) {
    emitVoiceSessionContext(sendVoiceEventRef.current, voiceSessionContextRef.current, options);
  }

  function primeVoiceQuestion(question: string, options?: { resetTranscript?: boolean }) {
    const startingFocus =
      question || `Profundiza el bloque ${currentBlockLabel.toLowerCase()} cruzando intake, presupuesto y productos.`;
    if (options?.resetTranscript !== false) {
      setVoiceAgentTranscript('');
      setVoicePartialTranscript('');
    }
    pushVoiceSessionContext({ startingFocus, triggerResponse: true });
  }

  function commitVoiceSummary(entry: InterviewVoiceSummaryEntry, kind: 'minute' | 'final') {
    if (!entry.summary.trim()) return;
    if (kind === 'final') {
      setFinalSummary({
        summary: entry.summary,
        keyFindings: entry.keyFindings,
        confidence: entry.confidence,
        createdAt: entry.createdAt,
      });
      setVoiceUserTranscript(entry.summary);
      setVoicePartialTranscript('');
      return;
    }

    setMinuteSummaries((prev) => {
      const merged = [...prev.filter((item) => item.minute !== entry.minute), entry].sort((a, b) => a.minute - b.minute);
      const latestMinute = merged[merged.length - 1]?.minute ?? 0;
      summaryMinuteAppliedRef.current = Math.max(summaryMinuteAppliedRef.current, latestMinute);
      return merged;
    });
    setVoiceUserTranscript((prev) => {
      const nextLine = `Minuto ${entry.minute}: ${entry.summary}`;
      return prev.trim() ? `${prev.trim()}\n\n${nextLine}` : nextLine;
    });
  }

  async function requestVoiceSummary(kind: 'minute' | 'final', minute?: number) {
    if (!voiceConnected || voiceConnecting || isFinalizingCall || summaryGenerating) return false;
    if (!voiceSessionReady) return false;
    if (summaryRequestRef.current) return false;

    summaryRequestRef.current = { kind, minute };
    summaryDraftRef.current = '';
    setSummaryGenerating(true);
    sendVoiceEvent({
      type: 'response.create',
      response: {
        output_modalities: ['text'],
        instructions: buildSummaryInstructions(kind, {
          callSeconds: callSecondsRef.current,
          currentBlockLabel,
          currentQuestion,
          minute,
        }),
      },
    });
    return true;
  }

  async function applyLatestVoiceSummaryAsAnswer() {
    const currentSummaryEntry = minuteSummaries[minuteSummaries.length - 1] ?? null;
    const clean = normalizeSummaryText(currentSummaryEntry?.summary ?? finalSummary?.summary ?? '');
    if (!clean || !blockId || awaitingSummaryValidation) return;

    addAnswer(blockId, clean);

    try {
      const nextInterviewTranscript = [
        interviewTranscriptSnapshot,
        `SINTESIS [${blockId}]: ${clean}`,
      ]
        .filter(Boolean)
        .join('\n')
        .trim();

      const res = await nextConversationStep({
        intake,
        blockId,
        answersInCurrentBlock: [...answersInBlock, clean],
        completedBlocks,
        interviewTranscript: nextInterviewTranscript,
      });

      setResponse(res);
      if (res?.blockId) resetBlock(res.blockId);
    } catch (error) {
      if (handleUnauthorized(error)) return;
      onBootError(toUserFacingError(error, 'interview.voice'));
    }
  }

  function canResumeExistingVoiceSession() {
    const pc = peerConnectionRef.current;
    const stream = localStreamRef.current;
    return Boolean(
      callId &&
        pc &&
        stream &&
        pc.connectionState !== 'closed' &&
        pc.signalingState !== 'closed' &&
        (voicePaused || !voiceConnected),
    );
  }

  function resumeExistingVoiceSession() {
    const pc = peerConnectionRef.current;
    const stream = localStreamRef.current;
    if (!pc || !stream || pc.connectionState === 'closed' || pc.signalingState === 'closed') {
      return false;
    }

    setVoiceError(null);
    stream.getAudioTracks().forEach((track) => {
      track.enabled = true;
    });
    setVoicePaused(false);
    setVoiceConnected(true);
    setVoiceConnecting(false);
    primeVoiceQuestion(currentQuestion, { resetTranscript: false });
    return true;
  }

  async function startVoiceSession() {
    if (!voiceSupported || voiceConnecting || voiceConnected) return;
    const activeQuota = resolveInterviewActiveQuota(callSecondsRef.current || callSeconds);
    if (activeQuota.isExhausted) {
      void finalizeCallAndGenerateReport('timeout', { durationSecOverride: activeQuota.activeSeconds });
      return;
    }
    if (voiceFlags.voiceCallExhausted && !voiceFlags.hasLiveVoiceCall) {
      setVoiceError('El tiempo de la entrevista se agotó. Estamos consolidando tu diagnóstico automáticamente.');
      return;
    }
    if (voiceFlags.voiceInterviewLocked && !voiceFlags.hasLiveVoiceCall) {
      setVoiceError('Esta entrevista senior ya quedó cerrada y no admite otra llamada.');
      return;
    }
    if (!voiceFlags.hasLiveVoiceCall && callsStarted >= INTERVIEW_MAX_CALLS_PER_USER) {
      setVoiceError('Solo se permite una llamada por usuario en esta entrevista.');
      return;
    }

    const capabilityIssue = resolveVoiceCapabilityIssue();
    if (capabilityIssue) {
      setVoiceError(capabilityIssue);
      return;
    }

    setVoiceError(null);
    setVoiceConnecting(true);
    closeoutPromptSentRef.current = false;

    try {
      const token = await getInterviewRealtimeToken();
      const ephemeralKey = token?.value;
      if (!ephemeralKey) throw new Error('No se recibió un client_secret válido');
      const tokenCallId = typeof token?.call_id === 'string' ? token.call_id : null;
      const hasPersistedCall =
        !voiceReport &&
        (Boolean(callId) || callSeconds > 0 || minuteSummaries.length > 0 || Boolean(finalSummary));
      const nextCallId = tokenCallId ?? (hasPersistedCall ? callId : null) ?? null;
      voiceResumeModeRef.current = hasPersistedCall;
      tokenIssuedRef.current = true;
      setCallId(nextCallId);
      if (typeof token?.calls_used === 'number') {
        setCallsStarted(Math.max(0, Math.floor(token.calls_used)));
      } else if (typeof token?.interview_voice?.callsStarted === 'number') {
        setCallsStarted(Math.max(0, Math.floor(Number(token.interview_voice.callsStarted))));
      } else {
        setCallsStarted(1);
      }
      if (!hasPersistedCall) {
        syncActiveQuota(0);
        setPauseUsed(false);
        setVoiceReport(null);
        setMinuteSummaries([]);
        setFinalSummary(null);
        setVoiceAgentTranscript('');
        setVoiceUserTranscript('');
        setVoicePartialTranscript('');
      } else {
        const fromToken =
          typeof token?.remaining_total_sec === 'number'
            ? INTERVIEW_TOTAL_LIMIT_SEC - Math.max(0, Math.floor(token.remaining_total_sec))
            : 0;
        syncActiveQuota(Math.max(callSecondsRef.current || callSeconds, fromToken));
        setMinuteSummaries(
          (token?.interview_voice?.minuteSummaries as InterviewVoiceSummaryEntry[] | undefined) ?? minuteSummaries,
        );
        setFinalSummary(
          (token?.interview_voice?.finalSummary as InterviewVoiceSnapshot['finalSummary']) ?? finalSummary ?? null,
        );
        setVoiceReport((token?.interview_voice?.voiceReport as InterviewVoiceReport | undefined) ?? voiceReport ?? null);
      }
      if (resolveInterviewActiveQuota(callSecondsRef.current).isExhausted) {
        cleanupVoiceSession();
        setVoiceConnecting(false);
        void finalizeCallAndGenerateReport('timeout', { durationSecOverride: callSecondsRef.current });
        return;
      }

      const pc = new RTCPeerConnection();
      peerConnectionRef.current = pc;

      const audio = new Audio();
      audio.autoplay = true;
      remoteAudioRef.current = audio;

      pc.ontrack = (event) => {
        audio.srcObject = event.streams[0];
      };

      const stream = localStreamRef.current ?? (await navigator.mediaDevices.getUserMedia({ audio: true }));
      localStreamRef.current = stream;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      const dc = pc.createDataChannel('oai-events');
      dataChannelRef.current = dc;

      dc.addEventListener('open', () => {
        tokenIssuedRef.current = false;
        setVoiceConnected(true);
        setVoiceConnecting(false);
        pendingInitialResponseRef.current = {
          question: currentQuestion,
          resetTranscript: !hasPersistedCall,
        };
        emitVoiceSessionContext(sendVoiceEventRef.current, voiceSessionContextRef.current, {
          startingFocus:
            currentQuestion ||
            `Profundiza el bloque ${currentBlockLabel.toLowerCase()} cruzando intake, presupuesto y productos.`,
          triggerResponse: false,
        });
      });

      dc.addEventListener('close', () => {
        cleanupVoiceSession();
      });

      dc.addEventListener('message', (event) => {
        try {
          const payload = JSON.parse(event.data);
          const type = String(payload?.type ?? '');

          if (type === 'input_audio_buffer.speech_started') setVoiceListening(true);
          if (type === 'input_audio_buffer.speech_stopped') setVoiceListening(false);
          if (type === 'response.created') setVoiceSpeaking(true);
          if (type === 'session.updated') {
            setVoiceSessionReady(true);
            const pending = pendingInitialResponseRef.current;
            if (pending) {
              pendingInitialResponseRef.current = null;
              primeVoiceQuestion(pending.question, { resetTranscript: pending.resetTranscript });
            }
          }
          if (type === 'response.output_text.delta' || type === 'response.text.delta') {
            const chunk = normalizeSummaryText(payload.delta ?? payload.text ?? '');
            if (chunk) {
              summaryDraftRef.current = summaryDraftRef.current
                ? `${summaryDraftRef.current} ${chunk}`.trim()
                : chunk;
              setVoiceAgentTranscript(summaryDraftRef.current);
            }
          }
          if (type === 'response.output_text.done' || type === 'response.text.done') {
            const doneChunk = normalizeSummaryText(payload.text ?? payload.output_text ?? payload.output ?? '');
            if (doneChunk && !summaryDraftRef.current) {
              summaryDraftRef.current = doneChunk;
              setVoiceAgentTranscript(doneChunk);
            }
          }
          if (type === 'response.done') {
            setVoiceSpeaking(false);
            const responseStatus = String(payload?.response?.status ?? '');
            const activeRequest = summaryRequestRef.current;
            if (activeRequest) {
              const parsed = parseSummaryPayload(
                { ...(payload?.response ?? {}), text: summaryDraftRef.current },
                activeRequest.minute ?? Math.max(1, Math.ceil(callSecondsRef.current / 60)),
              );
              if (responseStatus === 'completed' && parsed) {
                commitVoiceSummary(parsed, activeRequest.kind);
              } else if (responseStatus && responseStatus !== 'completed') {
                setVoiceError(
                  `No se pudo consolidar la síntesis (${responseStatus}). La llamada sigue activa y se reintentará en el siguiente ciclo.`,
                );
              }
              summaryRequestRef.current = null;
              summaryDraftRef.current = '';
              setSummaryGenerating(false);
            }
            if (typeof payload?.response?.status === 'string' && payload.response.status !== 'completed') {
              console.warn('[InterviewModal] Realtime response ended with status:', payload.response.status);
            }
          }
        } catch (parseErr) {
          console.error('[InterviewModal] DataChannel message parse error:', parseErr);
        }
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpResponse = await fetch('https://api.openai.com/v1/realtime/calls', {
        method: 'POST',
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${ephemeralKey}`,
          'Content-Type': 'application/sdp',
        },
      });

      if (!sdpResponse.ok) throw new Error(await sdpResponse.text());

      await pc.setRemoteDescription({ type: 'answer' as RTCSdpType, sdp: await sdpResponse.text() });
    } catch (error) {
      if (handleUnauthorized(error)) return;
      cleanupVoiceSession();
      voiceResumeModeRef.current = false;
      setVoiceConnecting(false);

      if (tokenIssuedRef.current) {
        tokenIssuedRef.current = false;
        setCallsStarted((prev) => Math.max(0, prev - 1));
        void abortInterviewRealtimeToken().catch(() => {});
      }

      const message = error instanceof Error ? error.message : 'No se pudo iniciar la llamada';
      if (
        /microphone is not allowed in this document/i.test(message) ||
        /Permission denied/i.test(message) ||
        /Permission dismissed/i.test(message)
      ) {
        setVoiceError('El navegador bloqueó el micrófono. Concede permiso e intenta de nuevo.');
        return;
      }
      setVoiceError(toUserFacingError(error, 'interview.voice'));
    }
  }

  async function startOrResumeVoiceSession() {
    if (canResumeExistingVoiceSession() && resumeExistingVoiceSession()) {
      return;
    }
    await startVoiceSession();
  }

  function toggleCallPause() {
    if (!voiceConnected) return;
    if (voicePaused) {
      if (resolveInterviewActiveQuota(callSecondsRef.current).isExhausted) {
        void finalizeCallAndGenerateReport('timeout', { durationSecOverride: callSecondsRef.current });
        return;
      }
      localStreamRef.current?.getAudioTracks().forEach((track) => {
        track.enabled = true;
      });
      setVoicePaused(false);
      const snapshot = persistVoiceSnapshot('in_progress');
      void saveInterviewVoiceState(snapshot).catch(() => {});
      return;
    }
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = false;
    });
    setVoicePaused(true);
    const snapshot = persistVoiceSnapshot('paused');
    writeInterviewVoiceState(snapshot);
    void saveInterviewVoiceState(snapshot).catch(() => {});
  }

  function buildFinalizePayload(
    endedBy: 'timeout' | 'agent',
    options?: { durationSecOverride?: number },
  ): PendingFinalizePayload {
    const minuteSummaryPayload = minuteSummaries
      .map((item, index) => ({
        minute: typeof item.minute === 'number' ? item.minute : index + 1,
        summary: normalizeSummaryText(item.summary),
        keyFindings: Array.isArray(item.keyFindings)
          ? item.keyFindings.map((finding) => normalizeSummaryText(finding)).filter(Boolean)
          : [],
        confidence: (item.confidence ?? 'medium') as 'high' | 'medium' | 'low',
        createdAt: item.createdAt ?? new Date().toISOString(),
      }))
      .filter((item) => item.summary.length > 0);
    const fallbackFinalSummary =
      finalSummary?.summary?.trim()
        ? {
            summary: normalizeSummaryText(finalSummary.summary),
            keyFindings: Array.isArray(finalSummary.keyFindings)
              ? finalSummary.keyFindings.map((item) => normalizeSummaryText(item)).filter(Boolean)
              : [],
            confidence: finalSummary.confidence,
            createdAt: finalSummary.createdAt ?? new Date().toISOString(),
          }
        : minuteSummaryPayload.length > 0
          ? {
              summary: minuteSummaryPayload[minuteSummaryPayload.length - 1].summary,
              keyFindings: minuteSummaryPayload[minuteSummaryPayload.length - 1].keyFindings,
              confidence: minuteSummaryPayload[minuteSummaryPayload.length - 1].confidence,
              createdAt: new Date().toISOString(),
            }
          : null;

    return {
      endedBy,
      durationSec: Math.min(
        INTERVIEW_TOTAL_LIMIT_SEC,
        Math.max(1, Math.floor(options?.durationSecOverride ?? callSecondsRef.current ?? callSeconds)),
      ),
      minuteSummaryPayload,
      fallbackFinalSummary,
    };
  }

  async function requestFinalizeInterview(payload: PendingFinalizePayload) {
    let result: Awaited<ReturnType<typeof finalizeInterviewVoiceCall>> | null = null;
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        result = await finalizeInterviewVoiceCall({
          intake,
          minuteSummaries: payload.minuteSummaryPayload,
          finalSummary: payload.fallbackFinalSummary ?? undefined,
          endedBy: payload.endedBy,
          durationSec: payload.durationSec,
          callId: callId ?? undefined,
        });
        break;
      } catch (error) {
        lastError = error;
        if (handleUnauthorized(error)) return null;
        if (attempt < 2) await waitMs(400 * (attempt + 1));
      }
    }
    if (!result) throw lastError ?? new Error('No se pudo finalizar la llamada');
    return result;
  }

  function applyFinalizeSuccess(
    result: Awaited<ReturnType<typeof finalizeInterviewVoiceCall>>,
    endedBy: 'timeout' | 'agent',
  ) {
    if (result?.profile) setProfile(result.profile);
    if (result?.type === 'interview_complete') setResponse(result);

    const interviewVoice = result?.interview_voice;
    const voiceSummary = result?.voice_summary;
    if (typeof interviewVoice?.call_id === 'string' && interviewVoice.call_id.length > 0) {
      setCallId(interviewVoice.call_id);
    }
    if (typeof interviewVoice?.remaining_total_sec === 'number') {
      setRemainingTotalSec(Math.max(0, Math.floor(interviewVoice.remaining_total_sec)));
    }
    if (Array.isArray(interviewVoice?.minute_summaries)) {
      const nextMinuteSummaries = interviewVoice.minute_summaries.map((item: any, index: number) => ({
        minute: typeof item?.minute === 'number' ? item.minute : index + 1,
        summary: String(item?.summary ?? '').trim(),
        keyFindings: Array.isArray(item?.key_findings)
          ? item.key_findings.map((finding: unknown) => String(finding))
          : [],
        confidence:
          item?.confidence === 'high' || item?.confidence === 'medium' || item?.confidence === 'low'
            ? item.confidence
            : undefined,
        createdAt: new Date().toISOString(),
      }));
      setMinuteSummaries(nextMinuteSummaries);
    }
    if (typeof interviewVoice?.final_summary === 'string' && interviewVoice.final_summary.trim().length > 0) {
      const createdAt = new Date().toISOString();
      setFinalSummary({
        summary: interviewVoice.final_summary.trim(),
        keyFindings: voiceSummary?.key_findings ?? [],
        confidence:
          voiceSummary?.confidence === 'high' ||
          voiceSummary?.confidence === 'medium' ||
          voiceSummary?.confidence === 'low'
            ? voiceSummary.confidence
            : undefined,
        createdAt,
      });
    }
    setCallsStarted((prev) => Math.max(prev, 1));

    const report = voiceSummary;
    const executiveReport =
      typeof report?.executive_report === 'string' && report.executive_report.trim().length > 0
        ? report.executive_report.trim()
        : typeof result?.profile?.executiveSummary === 'string' && result.profile.executiveSummary.trim().length > 0
          ? result.profile.executiveSummary.trim()
          : typeof result?.profile?.diagnosticNarrative === 'string' &&
              result.profile.diagnosticNarrative.trim().length > 0
            ? result.profile.diagnosticNarrative.trim()
            : 'Entrevista finalizada. Tu diagnóstico quedó consolidado y ya puedes revisarlo en detalle.';
    setVoiceReport({
      executive_report: executiveReport,
      key_findings: Array.isArray(report?.key_findings)
        ? report.key_findings.map((item: unknown) => String(item))
        : [],
      stop_reason: typeof report?.stop_reason === 'string' ? report.stop_reason : endedBy,
      has_enough_information:
        typeof report?.has_enough_information === 'boolean' ? report.has_enough_information : undefined,
      confidence:
        report?.confidence === 'high' || report?.confidence === 'medium' || report?.confidence === 'low'
          ? report.confidence
          : undefined,
    });
    clearInterviewVoiceState();
    pendingFinalizeRef.current = null;
    setCanRetryDiagnosis(false);
    setVoiceError(null);
    setIsGeneratingDiagnosis(false);
    onDiagnosisComplete?.();
  }

  async function runDiagnosisFinalize(
    payload: PendingFinalizePayload,
    options?: { resetFinalizeGuardOnError?: boolean },
  ) {
    try {
      const result = await requestFinalizeInterview(payload);
      if (!result) {
        setIsGeneratingDiagnosis(false);
        return;
      }
      applyFinalizeSuccess(result, payload.endedBy);
    } catch (error) {
      if (options?.resetFinalizeGuardOnError) {
        voiceFinalizeTriggeredRef.current = false;
      }
      if (handleUnauthorized(error)) {
        setIsGeneratingDiagnosis(false);
        return;
      }
      setIsGeneratingDiagnosis(false);
      setCanRetryDiagnosis(true);
      setVoiceError(
        `${toUserFacingError(error, 'interview.voice')} Puedes reintentar sin volver a llamar.`,
      );
    } finally {
      setIsFinalizingCall(false);
    }
  }

  async function finalizeCallAndGenerateReport(
    endedBy: 'timeout' | 'agent',
    options?: { durationSecOverride?: number },
  ) {
    if (isFinalizingCall || voiceFinalizeTriggeredRef.current) return;
    const payload = buildFinalizePayload(endedBy, options);
    pendingFinalizeRef.current = payload;
    voiceFinalizeTriggeredRef.current = true;
    setCanRetryDiagnosis(false);
    setVoiceError(null);
    setIsFinalizingCall(true);
    setIsGeneratingDiagnosis(true);
    cleanupVoiceSession();
    await runDiagnosisFinalize(payload, { resetFinalizeGuardOnError: true });
  }

  async function retryDiagnosisGeneration() {
    const payload = pendingFinalizeRef.current;
    if (!payload || isFinalizingCall || isGeneratingDiagnosis) return;
    voiceFinalizeTriggeredRef.current = true;
    setCanRetryDiagnosis(false);
    setVoiceError(null);
    setIsFinalizingCall(true);
    setIsGeneratingDiagnosis(true);
    await runDiagnosisFinalize(payload);
  }

  useEffect(() => {
    setVoiceSupported(
      typeof window !== 'undefined' &&
        typeof window.RTCPeerConnection !== 'undefined' &&
        typeof navigator !== 'undefined' &&
        !!navigator.mediaDevices?.getUserMedia,
    );
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    writeInterviewVoiceState(buildPersistSnapshot(voiceConnected ? (voicePaused ? 'paused' : 'in_progress') : 'idle'));
  }, [
    isOpen,
    callsStarted,
    callSeconds,
    maxCallDurationSec,
    remainingTotalSec,
    callId,
    pauseUsed,
    minuteSummaries,
    finalSummary,
    voiceReport,
    voiceConnected,
    voicePaused,
  ]);

  useEffect(() => {
    callSecondsRef.current = callSeconds;
  }, [callSeconds]);

  useEffect(() => {
    const hasContent =
      Boolean(callId) || minuteSummaries.length > 0 || Boolean(finalSummary) || Boolean(voiceReport);
    if (!hasContent || voiceReport) {
      latestVoiceSnapshotRef.current = null;
      return;
    }

    latestVoiceSnapshotRef.current = buildPersistSnapshot(
      voiceConnected
        ? voicePaused
          ? 'paused'
          : 'in_progress'
        : callId
          ? 'paused'
          : 'idle',
    );
  }, [
    callId,
    callSeconds,
    callsStarted,
    finalSummary,
    minuteSummaries,
    pauseUsed,
    voiceConnected,
    voicePaused,
    voiceReport,
  ]);

  useEffect(() => {
    function handlePageHide() {
      const base = latestVoiceSnapshotRef.current;
      if (!base) return;

      const quota = resolveInterviewActiveQuota(callSecondsRef.current);
      flushInterviewVoiceStateOnPageHide({
        ...base,
        callSeconds: quota.activeSeconds,
        remainingTotalSec: quota.remainingSeconds,
        maxDurationSec: INTERVIEW_TOTAL_LIMIT_SEC,
        status: base.callId || base.activeCallId ? 'paused' : base.status ?? 'idle',
      });
    }

    window.addEventListener('pagehide', handlePageHide);
    return () => window.removeEventListener('pagehide', handlePageHide);
  }, []);

  useEffect(() => {
    if (!isOpen || !voiceStateHydratedRef.current) return;
    if (voiceSyncTimerRef.current) window.clearTimeout(voiceSyncTimerRef.current);

    const hasContent =
      Boolean(callId) || minuteSummaries.length > 0 || Boolean(finalSummary) || Boolean(voiceReport);
    if (!hasContent) return;

    const status: InterviewVoiceSnapshot['status'] = voiceReport
      ? 'completed'
      : voiceConnected
        ? voicePaused
          ? 'paused'
          : 'in_progress'
        : callId
          ? 'paused'
          : 'idle';

    voiceSyncTimerRef.current = window.setTimeout(() => {
      const snapshot = persistVoiceSnapshot(status);
      void saveInterviewVoiceState(snapshot).catch(() => {
        setSyncError('No se pudo sincronizar el progreso. La entrevista continúa; se reintentará en el próximo ciclo.');
        window.setTimeout(() => setSyncError(null), 6000);
      });
    }, 600);

    return () => {
      if (voiceSyncTimerRef.current) window.clearTimeout(voiceSyncTimerRef.current);
    };
  }, [
    isOpen,
    callsStarted,
    callId,
    callSeconds,
    maxCallDurationSec,
    remainingTotalSec,
    pauseUsed,
    minuteSummaries,
    finalSummary,
    voiceReport,
    voiceConnected,
    voicePaused,
  ]);

  useEffect(() => {
    if (!voiceConnected || voicePaused || voiceReport || isFinalizingCall || isGeneratingDiagnosis) return;
    const timer = window.setInterval(() => {
      const quota = resolveInterviewActiveQuota(callSecondsRef.current + 1);
      callSecondsRef.current = quota.activeSeconds;
      setCallSeconds(quota.activeSeconds);
      setRemainingTotalSec(quota.remainingSeconds);
      if (quota.isExhausted) {
        window.clearInterval(timer);
        void finalizeCallAndGenerateReport('timeout', { durationSecOverride: quota.activeSeconds });
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [voiceConnected, voicePaused, voiceReport, isFinalizingCall, isGeneratingDiagnosis]);

  useEffect(() => {
    if (
      !voiceConnected ||
      voicePaused ||
      voiceSpeaking ||
      summaryGenerating ||
      isFinalizingCall ||
      voiceFlags.voiceCallExhausted
    )
      return;
    const elapsedMinute = Math.max(0, Math.floor(callSeconds / 60));
    if (elapsedMinute <= 0) return;
    if (elapsedMinute <= summaryMinuteAppliedRef.current) return;
    void requestVoiceSummary('minute', elapsedMinute);
  }, [
    voiceConnected,
    voicePaused,
    voiceSpeaking,
    summaryGenerating,
    callSeconds,
    voiceFlags.voiceCallExhausted,
    isFinalizingCall,
  ]);

  useEffect(() => {
    if (voiceReport || !voiceFlags.voiceCallExhausted || isFinalizingCall || isGeneratingDiagnosis) return;

    if (!finalSummary && !summaryRequestRef.current && !summaryGenerating) {
      void requestVoiceSummary('final');
    }

    if (voiceAutoFinalizeRef.current) return;

    const hasSummarySignal =
      Boolean(finalSummary?.summary?.trim()) ||
      minuteSummaries.some((item) => String(item.summary ?? '').trim().length > 0);

    if (!hasSummarySignal && (summaryGenerating || summaryRequestRef.current)) return;

    const delayMs = hasSummarySignal ? 500 : 5200;
    const timer = window.setTimeout(() => {
      if (voiceAutoFinalizeRef.current || isFinalizingCall) return;
      voiceAutoFinalizeRef.current = true;
      void finalizeCallAndGenerateReport('timeout');
    }, delayMs);

    return () => window.clearTimeout(timer);
  }, [
    voiceFlags.voiceCallExhausted,
    voiceReport,
    finalSummary,
    summaryGenerating,
    isFinalizingCall,
    isGeneratingDiagnosis,
    minuteSummaries,
  ]);

  useEffect(() => {
    if (!voiceStateHydratedRef.current || voiceReport || isFinalizingCall || isGeneratingDiagnosis || !intake) return;
    if (!resolveInterviewActiveQuota(callSeconds).isExhausted) return;
    void finalizeCallAndGenerateReport('timeout', { durationSecOverride: callSeconds });
  }, [callSeconds, voiceReport, isFinalizingCall, isGeneratingDiagnosis, intake]);

  useEffect(() => {
    if (!isOpen || !voiceFlags.isClosingWindow || closeoutPromptSentRef.current) return;
    closeoutPromptSentRef.current = true;
    emitVoiceSessionContext(sendVoiceEventRef.current, voiceSessionContextRef.current, {
      callPhase: 'closeout',
      triggerResponse: true,
      startingFocus: 'Cierra la entrevista con síntesis ejecutiva clara. Empieza con <<CALL_COMPLETE>>.',
    });
  }, [isOpen, voiceFlags.isClosingWindow]);

  useEffect(() => {
    const normalized = voiceAgentTranscript.toUpperCase();
    if (!voiceConnected || isFinalizingCall || voiceFinalizeTriggeredRef.current || summaryRequestRef.current) return;
    if (!normalized.includes('<<CALL_COMPLETE>>')) return;
    voiceFinalizeTriggeredRef.current = true;
    void finalizeCallAndGenerateReport('agent');
  }, [voiceAgentTranscript, voiceConnected, isFinalizingCall]);

  useEffect(() => {
    if (isOpen) return;

    const quota = resolveInterviewActiveQuota(callSecondsRef.current);
    const hasContent =
      Boolean(callId) || minuteSummaries.length > 0 || Boolean(finalSummary) || Boolean(voiceReport);
    if (
      quota.isExhausted &&
      hasContent &&
      !voiceReport &&
      !isFinalizingCall &&
      !isGeneratingDiagnosis
    ) {
      void finalizeCallAndGenerateReport('timeout', { durationSecOverride: quota.activeSeconds });
      return;
    }

    if (hasContent && !voiceReport) {
      const snapshot = buildPersistSnapshot(callId ? 'paused' : 'idle');
      writeInterviewVoiceState(snapshot);
      void saveInterviewVoiceState(snapshot).catch(() => {});
    }
    cleanupVoiceSession();
  }, [
    isOpen,
    callId,
    minuteSummaries,
    finalSummary,
    voiceReport,
    callsStarted,
    callSeconds,
    maxCallDurationSec,
    remainingTotalSec,
    pauseUsed,
  ]);

  useEffect(() => {
    return () => {
      if (voiceSyncTimerRef.current) window.clearTimeout(voiceSyncTimerRef.current);
      cleanupVoiceSession();
    };
  }, []);

  const blockVoiceInteraction = voiceConnecting || isFinalizingCall || isGeneratingDiagnosis;

  return {
    voiceSupported,
    voiceConnecting,
    voiceConnected,
    voiceListening,
    voiceSpeaking,
    voiceError,
    voiceAgentTranscript,
    voiceUserTranscript,
    voicePartialTranscript,
    minuteSummaries,
    finalSummary,
    voicePaused,
    pauseUsed,
    callSeconds,
    maxCallDurationSec,
    remainingTotalSec,
    callId,
    callsStarted,
    latestDiagnosticProfileId,
    isFinalizingCall,
    voiceReport,
    summaryGenerating,
    voiceSessionReady,
    isGeneratingDiagnosis,
    canRetryDiagnosis,
    syncError,
    voiceFlags,
    blockVoiceInteraction,
    resetVoiceRuntimeState,
    applyHydratedVoiceState,
    setLatestDiagnosticProfileId,
    setVoiceReport,
    setSessionAlreadyCompletedVoice: (report: InterviewVoiceReport | null) => {
      if (report) setVoiceReport(report);
      clearInterviewVoiceState();
    },
    cleanupVoiceSession,
    startOrResumeVoiceSession,
    toggleCallPause,
    retryDiagnosisGeneration,
    applyLatestVoiceSummaryAsAnswer,
    setVoiceUserTranscript,
    setMinuteSummaries,
    setFinalSummary,
    setCallSeconds,
    setMaxCallDurationSec,
    setRemainingTotalSec,
    setCallId,
    setCallsStarted,
    setPauseUsed,
    summaryMinuteAppliedRef,
    voiceStateHydratedRef,
  };
}
