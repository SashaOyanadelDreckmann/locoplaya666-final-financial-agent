'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { useInterviewStore } from '@/state/interview.store';
import { useProfileStore } from '@/state/profile.store';

import {
  finalizeInterviewVoiceCall,
  getInterviewRealtimeToken,
  getSessionInfo,
  nextConversationStep,
  saveInterviewVoiceState,
} from '@/lib/api';
import { ApiHttpError } from '@/lib/apiEnvelope';
import { toUserFacingError } from '@/lib/userError';
import {
  readInterviewVoiceState,
  writeInterviewVoiceState,
} from '@/lib/interviewVoiceState';
import { appendTranscriptChunk } from '@/lib/transcript';
import { INTERVIEW_TOTAL_LIMIT_MINUTES, INTERVIEW_TOTAL_LIMIT_SEC } from '@financial-agent/shared';

const DEFAULT_MAX_CALL_DURATION_SEC = INTERVIEW_TOTAL_LIMIT_SEC;

type InterviewVoiceReport = {
  executive_report: string;
  key_findings: string[];
  stop_reason?: string;
  has_enough_information?: boolean;
  confidence?: 'high' | 'medium' | 'low';
};

type InterviewVoiceSnapshot = {
  callId?: string;
  activeCallId?: string | null;
  status?: 'idle' | 'in_progress' | 'paused' | 'completed';
  callSeconds?: number;
  maxDurationSec?: number;
  remainingTotalSec?: number | null;
  pauseUsed?: boolean;
  voiceAgentTranscript?: string;
  voiceUserTranscript?: string;
  voicePartialTranscript?: string;
  transcript?: string;
  voiceReport?: InterviewVoiceReport | null;
  callsStarted?: number;
  completedAt?: string | null;
  startedAt?: string | null;
  lastUpdatedAt?: string | null;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

export function InterviewModal({ isOpen, onClose }: Props) {
  const router = useRouter();
  const bootedRef = useRef(false);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const eventIdRef = useRef(0);

  const {
    intake,
    answersByBlock,
    transcriptEntries,
    completedBlocks,
    lastResponse,
    addAnswer,
    resetBlock,
    setIntake,
    setResponse,
  } = useInterviewStore();

  const { setProfile } = useProfileStore();
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [voiceConnecting, setVoiceConnecting] = useState(false);
  const [voiceConnected, setVoiceConnected] = useState(false);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceSpeaking, setVoiceSpeaking] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceAgentTranscript, setVoiceAgentTranscript] = useState('');
  const [voiceUserTranscript, setVoiceUserTranscript] = useState('');
  const [voicePartialTranscript, setVoicePartialTranscript] = useState('');
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
  const [intakeReady, setIntakeReady] = useState(false);
  const [microphoneReady, setMicrophoneReady] = useState(false);
  const voiceSyncTimerRef = useRef<number | null>(null);
  const voiceStateHydratedRef = useRef(false);
  const voiceResumeModeRef = useRef(false);
  const voiceAutoFinalizeRef = useRef(false);
  const voiceTranscriptRef = useRef({
    agent: '',
    user: '',
    partial: '',
  });
  const callSecondsRef = useRef(0);

  const currentQuestion =
    lastResponse?.type === 'question' && typeof lastResponse.question === 'string'
      ? lastResponse.question
      : '';

  const interviewTranscriptSnapshot = useMemo(() => {
    const lines: string[] = [];

    if (currentQuestion) {
      lines.push(`AGENTE: ${currentQuestion}`);
    }

    for (const entry of transcriptEntries) {
      if (!entry?.answer || !String(entry.answer).trim()) continue;
      lines.push(`USUARIO [${entry.blockId}]: ${String(entry.answer).trim()}`);
    }

    return lines.join('\n').trim();
  }, [currentQuestion, transcriptEntries]);

  const hasCompletedVoiceInterview =
    Boolean(latestDiagnosticProfileId) || Boolean(voiceReport?.executive_report);
  const hasEverStartedVoiceCall =
    Boolean(callId) || callsStarted > 0 || callSeconds > 0 || Boolean(voiceReport);
  const hasLiveVoiceCall = Boolean(callId) && !hasCompletedVoiceInterview;
  const hasRemainingInterviewTime =
    remainingTotalSec === null ? callSeconds < maxCallDurationSec : remainingTotalSec > 0;
  const voiceCallExhausted =
    !hasCompletedVoiceInterview &&
    !hasRemainingInterviewTime &&
    Boolean(callId || callsStarted > 0 || callSeconds > 0 || voiceReport);
  const voiceInterviewLocked = hasCompletedVoiceInterview || voiceCallExhausted;

  function handleUnauthorized(error: unknown) {
    if (error instanceof ApiHttpError && error.status === 401) {
      router.replace('/login');
      return true;
    }
    return false;
  }

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    bootedRef.current = false;
    setIntakeReady(false);
    voiceStateHydratedRef.current = false;
    voiceAutoFinalizeRef.current = false;

    async function hydrateInterviewContext() {
      try {
        const session = await getSessionInfo();
        const sessionIntake = session?.injectedIntake?.intake;
        const productsContext = session?.injectedIntake?.productsContext;
        const budgetContext = session?.injectedIntake?.budgetContext;
        const sessionVoice = (session?.interviewVoice ?? null) as InterviewVoiceSnapshot | null;
        const sessionDiagnosticProfileId =
          typeof session?.latestDiagnosticProfileId === 'string' && session.latestDiagnosticProfileId.length > 0
            ? session.latestDiagnosticProfileId
            : null;

        if (!cancelled && !intake && sessionIntake && typeof sessionIntake === 'object') {
          setIntake({
            ...(sessionIntake as Record<string, unknown>),
            __productsContext: productsContext ?? null,
            __budgetContext: budgetContext ?? null,
          } as any);
        } else if (!cancelled && !intake && !sessionIntake) {
          onClose();
          return;
        }

        if (!cancelled) {
          const saved = readInterviewVoiceState();
          const snapshot: InterviewVoiceSnapshot | null =
            saved && typeof saved === 'object'
              ? ({ ...(sessionVoice ?? {}), ...(saved as InterviewVoiceSnapshot) } as InterviewVoiceSnapshot)
              : sessionVoice;

          if (snapshot && typeof snapshot === 'object') {
            if (typeof snapshot.callsStarted === 'number') {
              setCallsStarted(Math.max(0, Math.floor(snapshot.callsStarted)));
            }
            if (typeof snapshot.callSeconds === 'number') {
              setCallSeconds(Math.max(0, Math.floor(snapshot.callSeconds)));
            }
            if (typeof snapshot.maxDurationSec === 'number' && snapshot.maxDurationSec > 0) {
              setMaxCallDurationSec(
                Math.min(DEFAULT_MAX_CALL_DURATION_SEC, Math.max(1, Math.floor(snapshot.maxDurationSec))),
              );
            }
            if (typeof snapshot.remainingTotalSec === 'number') {
              setRemainingTotalSec(
                Math.min(DEFAULT_MAX_CALL_DURATION_SEC, Math.max(0, Math.floor(snapshot.remainingTotalSec))),
              );
            }
            if (typeof snapshot.callId === 'string' && snapshot.callId.length > 0) {
              setCallId(snapshot.callId);
            } else if (typeof snapshot.activeCallId === 'string' && snapshot.activeCallId.length > 0) {
              setCallId(snapshot.activeCallId);
            }
            if (typeof snapshot.pauseUsed === 'boolean') setPauseUsed(snapshot.pauseUsed);
            if (typeof snapshot.voiceAgentTranscript === 'string') {
              setVoiceAgentTranscript(snapshot.voiceAgentTranscript);
            }
            if (typeof snapshot.voiceUserTranscript === 'string') {
              setVoiceUserTranscript(snapshot.voiceUserTranscript);
            }
            if (typeof snapshot.voicePartialTranscript === 'string') {
              setVoicePartialTranscript(snapshot.voicePartialTranscript);
            }
            if (snapshot.voiceReport && typeof snapshot.voiceReport === 'object') {
              setVoiceReport(snapshot.voiceReport);
            }
          }
          if (sessionDiagnosticProfileId) {
            setLatestDiagnosticProfileId(sessionDiagnosticProfileId);
          }
          if (
            sessionDiagnosticProfileId ||
            snapshot?.status === 'completed' ||
            Boolean(snapshot?.completedAt) ||
            Boolean(snapshot?.voiceReport)
          ) {
            onClose();
            router.push('/diagnosis');
            return;
          }
          voiceStateHydratedRef.current = true;
        }
      } catch (error) {
        if (!cancelled && handleUnauthorized(error)) return;
        if (!cancelled && !intake) { onClose(); return; }
      } finally {
        if (!cancelled) setIntakeReady(true);
      }
    }

    void hydrateInterviewContext();

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    setVoiceSupported(
      typeof window !== 'undefined' &&
        typeof window.RTCPeerConnection !== 'undefined' &&
        typeof navigator !== 'undefined' &&
        !!navigator.mediaDevices?.getUserMedia
    );
  }, []);

  // Boot
  useEffect(() => {
    if (
      !isOpen ||
      !intakeReady ||
      !intake ||
      bootedRef.current ||
      voiceInterviewLocked ||
      currentQuestion
    ) {
      return;
    }
    bootedRef.current = true;

    nextConversationStep({
      intake,
      completedBlocks,
      interviewTranscript: interviewTranscriptSnapshot,
    })
      .then(setResponse)
      .catch((error) => {
        if (handleUnauthorized(error)) return;
      });
  }, [
    isOpen,
    intakeReady,
    intake,
    completedBlocks,
    currentQuestion,
    interviewTranscriptSnapshot,
    setResponse,
    voiceInterviewLocked,
  ]);

  // Auto-advance
  useEffect(() => {
    if (!isOpen || voiceInterviewLocked || lastResponse?.type !== 'block_completed') return;

    const updatedCompleted = lastResponse.completedBlocks ?? completedBlocks;

    nextConversationStep({
      intake,
      completedBlocks: updatedCompleted,
      interviewTranscript: interviewTranscriptSnapshot,
    })
      .then((res) => {
        if (res?.blockId) resetBlock(res.blockId);
        setResponse(res);
      })
      .catch((error) => {
        if (handleUnauthorized(error)) return;
      });
  }, [isOpen, lastResponse, intake, completedBlocks, resetBlock, setResponse, voiceInterviewLocked, interviewTranscriptSnapshot]);

  useEffect(() => {
    if (!isOpen) return;
    writeInterviewVoiceState({
      callsStarted,
      callSeconds,
      maxCallDurationSec,
      remainingTotalSec,
      callId,
      activeCallId: callId ?? undefined,
      pauseUsed,
      voiceAgentTranscript,
      voiceUserTranscript,
      voicePartialTranscript,
      voiceReport,
      updatedAt: new Date().toISOString(),
    });
  }, [
    isOpen,
    callsStarted,
    callSeconds,
    maxCallDurationSec,
    remainingTotalSec,
    callId,
    pauseUsed,
    voiceAgentTranscript,
    voiceUserTranscript,
    voicePartialTranscript,
    voiceReport,
  ]);

  useEffect(() => {
    voiceTranscriptRef.current = {
      agent: voiceAgentTranscript,
      user: voiceUserTranscript,
      partial: voicePartialTranscript,
    };
  }, [voiceAgentTranscript, voiceUserTranscript, voicePartialTranscript]);

  useEffect(() => {
    callSecondsRef.current = callSeconds;
  }, [callSeconds]);

  useEffect(() => {
    if (!isOpen || !voiceStateHydratedRef.current) return;
    if (voiceSyncTimerRef.current) window.clearTimeout(voiceSyncTimerRef.current);

    const hasContent =
      Boolean(callId) ||
      Boolean(voiceAgentTranscript.trim()) ||
      Boolean(voiceUserTranscript.trim()) ||
      Boolean(voicePartialTranscript.trim()) ||
      Boolean(voiceReport);
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
      const snapshot: InterviewVoiceSnapshot = {
        callsStarted,
        callId: callId ?? undefined,
        activeCallId: callId ?? undefined,
        status,
        callSeconds,
        maxDurationSec: Math.min(DEFAULT_MAX_CALL_DURATION_SEC, maxCallDurationSec),
        remainingTotalSec:
          remainingTotalSec === null
            ? null
            : Math.min(DEFAULT_MAX_CALL_DURATION_SEC, remainingTotalSec),
        pauseUsed,
        voiceAgentTranscript,
        voiceUserTranscript,
        voicePartialTranscript,
        completedAt: voiceReport ? new Date().toISOString() : undefined,
        transcript: [
          voiceAgentTranscript ? `AGENTE:\n${voiceAgentTranscript}` : '',
          voiceUserTranscript ? `USUARIO:\n${voiceUserTranscript}` : '',
        ]
          .filter(Boolean)
          .join('\n\n')
          .trim(),
        voiceReport,
      };

      writeInterviewVoiceState(snapshot);
      void saveInterviewVoiceState(snapshot).catch(() => {});
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
    voiceAgentTranscript,
    voiceUserTranscript,
    voicePartialTranscript,
    voiceReport,
    voiceConnected,
    voicePaused,
  ]);

  useEffect(() => {
    if (!isOpen) return;
    const derivedRemaining = Math.max(0, maxCallDurationSec - callSeconds);
    setRemainingTotalSec((prev) => (prev === derivedRemaining ? prev : derivedRemaining));
  }, [isOpen, callSeconds, maxCallDurationSec]);

  // Cleanup on unmount / close
  useEffect(() => {
    return () => {
      if (voiceSyncTimerRef.current) window.clearTimeout(voiceSyncTimerRef.current);
      if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
        try { dataChannelRef.current.close(); } catch {}
      }
      if (peerConnectionRef.current) {
        try { peerConnectionRef.current.close(); } catch {}
      }
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      if (remoteAudioRef.current) {
        remoteAudioRef.current.pause();
        remoteAudioRef.current.srcObject = null;
      }
    };
  }, []);

  // Call timer
  useEffect(() => {
    if (!isOpen || !voiceConnected || voicePaused) return;
    const timer = window.setInterval(() => {
      setCallSeconds((prev) => {
        const next = prev + 1;
        const nextRemaining = Math.max(0, maxCallDurationSec - next);
        setRemainingTotalSec(nextRemaining);
        if (next >= maxCallDurationSec) {
          window.clearInterval(timer);
          setRemainingTotalSec(0);
          void finalizeCallAndGenerateReport('timeout', { durationSecOverride: next });
        }
        return next;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isOpen, voiceConnected, voicePaused, maxCallDurationSec]);

  useEffect(() => {
    if (!isOpen || voiceReport || !voiceCallExhausted || isFinalizingCall) return;
    if (voiceAutoFinalizeRef.current) return;

    const persistedState = readInterviewVoiceState();
    const transcript = [
      voiceTranscriptRef.current.agent,
      voiceTranscriptRef.current.user,
      voiceTranscriptRef.current.partial,
      typeof persistedState?.transcript === 'string' ? persistedState.transcript : '',
    ]
      .map((item) => String(item ?? '').trim())
      .filter(Boolean)
      .join('\n\n')
      .trim();

    if (transcript.length < 10) return;

    voiceAutoFinalizeRef.current = true;
    void finalizeCallAndGenerateReport('timeout');
  }, [isOpen, voiceCallExhausted, voiceReport, isFinalizingCall]);

  // Auto-finalize on agent completion signal
  useEffect(() => {
    const normalized = voiceAgentTranscript.toUpperCase();
    if (!voiceConnected) return;
    if (!normalized.includes('<<CALL_COMPLETE>>')) return;
    void finalizeCallAndGenerateReport('agent');
  }, [voiceAgentTranscript, voiceConnected]);

  // Prime question on voice connect
  useEffect(() => {
    if (!isOpen || !voiceConnected || !currentQuestion) return;
    primeVoiceQuestion(currentQuestion, { resetTranscript: !voiceResumeModeRef.current });
    voiceResumeModeRef.current = false;
  }, [isOpen, voiceConnected, currentQuestion]);

  if (!isOpen) return null;

  const blockId = lastResponse?.blockId;
  const answersInBlock = blockId ? answersByBlock[blockId] ?? [] : [];
  const hasSavedVoiceState =
    Boolean(callId) ||
    callSeconds > 0 ||
    Boolean(voiceAgentTranscript.trim()) ||
    Boolean(voiceUserTranscript.trim()) ||
    Boolean(voicePartialTranscript.trim()) ||
    Boolean(voiceReport);

  const stageLabel =
    voiceReport?.executive_report
      ? 'Diagnóstico listo'
      : voiceCallExhausted
      ? 'Llamada agotada'
      : voiceConnected
      ? 'En llamada'
      : hasEverStartedVoiceCall
      ? hasRemainingInterviewTime
        ? 'Pausada'
        : 'Llamada agotada'
      : 'Lista para iniciar';
  const callTimeLabel = `${Math.floor(callSeconds / 60).toString().padStart(2, '0')}:${(callSeconds % 60).toString().padStart(2, '0')}`;
  const maxCallTimeLabel = `${Math.floor(maxCallDurationSec / 60).toString().padStart(2, '0')}:${(maxCallDurationSec % 60).toString().padStart(2, '0')}`;

  const intakeSnapshot = [
    intake?.profession ? String(intake.profession) : null,
    intake?.employmentStatus ? String(intake.employmentStatus).replace(/_/g, ' / ') : null,
    intake?.incomeBand ? String(intake.incomeBand) : null,
    typeof intake?.moneyStressLevel === 'number' ? `Estrés ${intake.moneyStressLevel}/10` : null,
  ].filter(Boolean) as string[];

  const productsContext = ((intake as unknown) as Record<string, unknown>)?.__productsContext as Record<string, unknown> | null | undefined;
  const budgetContext = ((intake as unknown) as Record<string, unknown>)?.__budgetContext as Record<string, unknown> | null | undefined;
  const interviewContextSummary = [
    productsContext ? `Productos: ${Math.max(0, Number(productsContext.productsCount ?? 0))}` : null,
    budgetContext
      ? `Presupuesto: ingreso=${Math.round(Number(budgetContext.income ?? 0))} gasto=${Math.round(Number(budgetContext.expenses ?? 0))} balance=${Math.round(Number(budgetContext.balance ?? 0))}`
      : null,
  ]
    .filter(Boolean)
    .join(' | ');

  const callProgressPct = Math.max(0, Math.min(100, Math.round((callSeconds / Math.max(1, maxCallDurationSec)) * 100)));

  function nextVoiceEventId() {
    eventIdRef.current += 1;
    return `voice-event-${eventIdRef.current}`;
  }

  function cleanupVoiceSession() {
    setVoiceConnected(false);
    setVoiceConnecting(false);
    setVoiceListening(false);
    setVoiceSpeaking(false);
    setVoicePaused(false);
    setMicrophoneReady(false);
    voiceResumeModeRef.current = false;
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

  function sendVoiceEvent(payload: Record<string, unknown>) {
    const dc = dataChannelRef.current;
    if (!dc || dc.readyState !== 'open') return;
    dc.send(JSON.stringify({ event_id: nextVoiceEventId(), ...payload }));
  }

  function primeVoiceQuestion(question: string, options?: { resetTranscript?: boolean }) {
    if (!question) return;
    if (options?.resetTranscript !== false) {
      setVoiceAgentTranscript('');
      setVoiceUserTranscript('');
      setVoicePartialTranscript('');
    }
    sendVoiceEvent({
      type: 'session.update',
      session: {
        instructions: [
          'Eres un entrevistador financiero premium en una llamada breve.',
          'Habla en español chileno.',
          'Haz solo una pregunta a la vez y profundiza con precisión.',
          'No expliques el sistema ni el contexto técnico.',
          `La llamada dura máximo ${INTERVIEW_TOTAL_LIMIT_MINUTES} minutos y busca un diagnóstico profundo basado en intake, transacciones, presupuesto y respuestas del usuario.`,
          'Tono: cool, seguro y sofisticado, estilo alta performance financiera, sin caer en arrogancia.',
          interviewContextSummary
            ? `Contexto financiero consolidado: ${interviewContextSummary}. Usa esto para preguntar con foco.`
            : '',
          'Si ya tienes información suficiente, inicia tu cierre con <<CALL_COMPLETE>> y resume el porqué en 2 frases.',
          `Pregunta de arranque que debes formular con calidez y precisión: ${question}`,
        ].join(' '),
      },
    });
    sendVoiceEvent({
      type: 'response.create',
      response: {
        output_modalities: ['audio'],
        instructions: `Inicia con esta pregunta y luego continúa entrevistando en profundidad: ${question}`,
      },
    });
  }

  function resolveVoiceCapabilityIssue() {
    if (typeof window === 'undefined') return null;
    if (!window.isSecureContext) {
      return 'La llamada en tiempo real requiere un contexto seguro (HTTPS o localhost).';
    }
    return null;
  }

  async function activateMicrophone() {
    const capabilityIssue = resolveVoiceCapabilityIssue();
    if (capabilityIssue) { setVoiceError(capabilityIssue); return; }

    try {
      setVoiceError(null);
      const stream = localStreamRef.current ?? (await navigator.mediaDevices.getUserMedia({ audio: true }));
      localStreamRef.current = stream;
      setMicrophoneReady(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo activar el micrófono';
      if (
        /microphone is not allowed in this document/i.test(message) ||
        /Permission denied/i.test(message) ||
        /Permission dismissed/i.test(message)
      ) {
        setVoiceError('El navegador bloqueó el micrófono. Concede permiso de micrófono e intenta de nuevo.');
        return;
      }
      setVoiceError(toUserFacingError(error, 'interview.voice'));
    }
  }

  async function startVoiceSession() {
    if (!voiceSupported || voiceConnecting || voiceConnected || !currentQuestion) return;
    if (voiceCallExhausted) {
      return;
    }
    if (voiceInterviewLocked && !hasLiveVoiceCall) {
      setVoiceError('Esta entrevista ya se convirtió en diagnóstico y no admite otra llamada.');
      return;
    }

    const capabilityIssue = resolveVoiceCapabilityIssue();
    if (capabilityIssue) { setVoiceError(capabilityIssue); return; }

    setVoiceError(null);
    setVoiceConnecting(true);

    try {
      const token = await getInterviewRealtimeToken();
      const ephemeralKey = token?.value;
      if (!ephemeralKey) throw new Error('No se recibió un client_secret válido');
      const tokenCallId = typeof token?.call_id === 'string' ? token.call_id : null;
      const hasPersistedCall =
        !voiceReport &&
        (Boolean(callId) ||
          callSeconds > 0 ||
          Boolean(voiceAgentTranscript.trim()) ||
          Boolean(voiceUserTranscript.trim()) ||
          Boolean(voicePartialTranscript.trim()));
      const nextCallId = tokenCallId ?? (hasPersistedCall ? callId : null) ?? null;
      voiceResumeModeRef.current = hasPersistedCall;
      setCallId(nextCallId);
      if (typeof token?.calls_used === 'number') {
        setCallsStarted(Math.max(0, Math.floor(token.calls_used)));
      } else if (typeof token?.interview_voice?.callsStarted === 'number') {
        setCallsStarted(Math.max(0, Math.floor(Number(token.interview_voice.callsStarted))));
      } else {
        setCallsStarted(1);
      }
      if (typeof token?.max_duration_sec === 'number' && token.max_duration_sec > 0) {
        setMaxCallDurationSec(Math.max(1, Math.floor(token.max_duration_sec)));
      } else {
        setMaxCallDurationSec(DEFAULT_MAX_CALL_DURATION_SEC);
      }
      if (typeof token?.remaining_total_sec === 'number') {
        setRemainingTotalSec(Math.max(0, Math.floor(token.remaining_total_sec)));
      } else {
        setRemainingTotalSec(null);
      }
      if (!hasPersistedCall) {
        setCallSeconds(0);
        setPauseUsed(false);
        setVoiceReport(null);
        setVoiceAgentTranscript('');
        setVoiceUserTranscript('');
        setVoicePartialTranscript('');
      } else {
        setVoiceReport((token?.interview_voice?.voiceReport as InterviewVoiceReport | undefined) ?? voiceReport ?? null);
      }

      const pc = new RTCPeerConnection();
      peerConnectionRef.current = pc;

      const audio = new Audio();
      audio.autoplay = true;
      remoteAudioRef.current = audio;

      pc.ontrack = (event) => { audio.srcObject = event.streams[0]; };

      const stream = localStreamRef.current ?? (await navigator.mediaDevices.getUserMedia({ audio: true }));
      localStreamRef.current = stream;
      setMicrophoneReady(true);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      const dc = pc.createDataChannel('oai-events');
      dataChannelRef.current = dc;

      dc.addEventListener('open', () => {
        setVoiceConnected(true);
        setVoiceConnecting(false);
        primeVoiceQuestion(currentQuestion, { resetTranscript: !hasPersistedCall });
      });

      dc.addEventListener('close', () => { cleanupVoiceSession(); });

      dc.addEventListener('message', (event) => {
        try {
          const payload = JSON.parse(event.data);
          const type = String(payload?.type ?? '');

          if (type === 'input_audio_buffer.speech_started') setVoiceListening(true);
          if (type === 'input_audio_buffer.speech_stopped') setVoiceListening(false);
          if (type === 'response.created') setVoiceSpeaking(true);
          if (type === 'response.done') setVoiceSpeaking(false);
          if (type === 'response.audio_transcript.delta' && typeof payload.delta === 'string') {
            setVoiceAgentTranscript((prev) => appendTranscriptChunk(prev, payload.delta));
          }
          if (
            type === 'conversation.item.input_audio_transcription.completed' &&
            typeof payload.transcript === 'string'
          ) {
            setVoiceUserTranscript((prev) => appendTranscriptChunk(prev, payload.transcript));
            setVoicePartialTranscript('');
          }
          if (
            type === 'conversation.item.input_audio_transcription.delta' &&
            typeof payload.delta === 'string'
          ) {
            setVoicePartialTranscript((prev) => appendTranscriptChunk(prev, payload.delta));
          }
        } catch {}
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

  function toggleCallPause() {
    if (!voiceConnected) return;
    if (voicePaused) {
      localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = true; });
      setVoicePaused(false);
      return;
    }
    if (pauseUsed) return;
    localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = false; });
    setVoicePaused(true);
    setPauseUsed(true);
  }

  async function finalizeCallAndGenerateReport(
    endedBy: 'timeout' | 'agent' | 'user',
    options?: { durationSecOverride?: number },
  ) {
    if (isFinalizingCall) return;
    setIsFinalizingCall(true);
    cleanupVoiceSession();
    try {
      const latestTranscript = voiceTranscriptRef.current;
      const transcript = [
        latestTranscript.agent ? `AGENTE:\n${latestTranscript.agent}` : '',
        latestTranscript.user ? `USUARIO:\n${latestTranscript.user}` : '',
        latestTranscript.partial ? `PARCIAL:\n${latestTranscript.partial}` : '',
      ]
        .filter(Boolean)
        .join('\n\n')
        .trim();
      const persistedState = readInterviewVoiceState();
      const persistedTranscript =
        typeof persistedState?.transcript === 'string' ? persistedState.transcript.trim() : '';
      const finalTranscript = transcript || persistedTranscript;
      if (!finalTranscript || finalTranscript.length < 10) {
        setVoiceError('No hay suficiente transcripción para generar informe ejecutivo.');
        return;
      }

      const result = await finalizeInterviewVoiceCall({
        intake,
        transcript: finalTranscript,
        endedBy,
        durationSec: Math.max(
          1,
          Math.floor(options?.durationSecOverride ?? callSecondsRef.current ?? callSeconds),
        ),
        callId: callId ?? undefined,
      });

      if (result?.profile) setProfile(result.profile);
      if (result?.type === 'interview_complete') setResponse(result);

      const interviewVoice = result?.interview_voice;
      if (typeof interviewVoice?.call_id === 'string' && interviewVoice.call_id.length > 0) {
        setCallId(interviewVoice.call_id);
      }
      if (typeof interviewVoice?.remaining_total_sec === 'number') {
        setRemainingTotalSec(Math.max(0, Math.floor(interviewVoice.remaining_total_sec)));
      }
      setCallsStarted((prev) => Math.max(prev, 1));

      const report = result?.voice_report;
      if (report?.executive_report) {
        setVoiceReport({
          executive_report: String(report.executive_report),
          key_findings: Array.isArray(report.key_findings)
            ? report.key_findings.map((item: unknown) => String(item))
            : [],
          stop_reason: typeof report.stop_reason === 'string' ? report.stop_reason : endedBy,
          has_enough_information: typeof report.has_enough_information === 'boolean' ? report.has_enough_information : undefined,
          confidence:
            report.confidence === 'high' || report.confidence === 'medium' || report.confidence === 'low'
              ? report.confidence
              : undefined,
        });
      }
      onClose();
      router.push('/diagnosis');
    } catch (error) {
      if (handleUnauthorized(error)) return;
      setVoiceError(toUserFacingError(error, 'interview.voice'));
    } finally {
      setIsFinalizingCall(false);
    }
  }

  async function useVoiceTranscriptAsAnswer() {
    const clean = (voiceUserTranscript || voicePartialTranscript).trim();
    if (!clean || !blockId) return;

    addAnswer(blockId, clean);

    try {
      const nextInterviewTranscript = [
        interviewTranscriptSnapshot,
        `USUARIO [${blockId}]: ${clean}`,
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

      setVoiceUserTranscript('');
      setVoicePartialTranscript('');
      setResponse(res);
    } catch (error) {
      if (handleUnauthorized(error)) return;
    }
  }

  const isLoading = !intakeReady || !intake || !lastResponse;

  return (
    <div
      className="agent-modal-overlay interview-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Entrevista estratégica"
      onClick={onClose}
    >
      <div
        className="agent-modal interview-modal"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="agent-modal-header">
          <h3>Entrevista estratégica</h3>
          <button
            type="button"
            className="agent-modal-close"
            onClick={onClose}
            aria-label="Cerrar entrevista"
          >
            ×
          </button>
        </div>

        {isLoading ? (
          <div className="interview-modal-loading">
            <span>Cargando sesión…</span>
          </div>
        ) : (
          <div className="interview-shell pro-interview-shell interview-modal-body">
            <div className="interview-column pro-interview-column">
              <section className="voice-call-shell">
                <div className="voice-call-topbar">
                  <div>
                    <span className="voice-call-label">Voice diagnostic session</span>
                    <h1>Entrevista estratégica en tiempo real</h1>
                  </div>
                  <div className="voice-call-status">
                    <span className="voice-call-status-dot" />
                    {voiceConnecting
                      ? 'Conectando'
                      : voiceConnected
                      ? voicePaused
                        ? 'Pausada'
                        : voiceListening
                        ? 'Escuchando'
                        : voiceSpeaking
                        ? 'Hablando'
                        : 'En llamada'
                      : stageLabel}
                  </div>
                </div>

                <div className="voice-call-progress" aria-hidden="true">
                  <span style={{ width: `${callProgressPct}%` }} />
                </div>

                <div className="voice-call-context">
                  {intakeSnapshot.map((item) => (
                    <span key={item} className="voice-call-pill">{item}</span>
                  ))}
                </div>

                <div className="voice-call-actions">
                  <button
                    type="button"
                    className="summary-action-btn"
                    onClick={activateMicrophone}
                    disabled={!voiceSupported || voiceConnecting || voiceConnected || voiceInterviewLocked}
                  >
                    {microphoneReady ? 'Micrófono activo' : 'Activar micrófono'}
                  </button>
                  <button
                    type="button"
                    className="summary-action-btn summary-action-accept"
                    onClick={voiceConnected ? () => void finalizeCallAndGenerateReport('user') : startVoiceSession}
                    disabled={
                      !voiceSupported ||
                      voiceConnecting ||
                      (!voiceConnected && !currentQuestion) ||
                      isFinalizingCall ||
                      (!voiceConnected && voiceCallExhausted) ||
                      (!voiceConnected && voiceInterviewLocked && !hasLiveVoiceCall)
                    }
                  >
                    {voiceConnecting
                      ? 'Conectando llamada…'
                      : voiceConnected
                        ? isFinalizingCall
                          ? 'Cerrando llamada…'
                          : 'Colgar y generar informe'
                      : hasCompletedVoiceInterview
                      ? 'Diagnóstico listo'
                      : voiceCallExhausted
                      ? 'Llamada agotada'
                      : hasEverStartedVoiceCall
                      ? 'Reanudar llamada'
                      : 'Iniciar llamada'}
                  </button>
                  <button
                    type="button"
                    className="summary-action-btn"
                    onClick={toggleCallPause}
                    disabled={!voiceConnected || Boolean(voiceReport) || (pauseUsed && !voicePaused)}
                    title={pauseUsed ? 'Ya usaste la pausa única de esta llamada' : 'Pausar una vez'}
                  >
                    {voicePaused ? 'Reanudar' : pauseUsed ? 'Pausa usada' : 'Pausar (1 vez)'}
                  </button>
                  {(voiceUserTranscript || voicePartialTranscript) && blockId ? (
                    <button
                      type="button"
                      className="summary-action-btn summary-action-reject"
                      onClick={useVoiceTranscriptAsAnswer}
                    >
                      Usar transcripción
                    </button>
                  ) : null}
                  {voiceConnected ? (
                    <button
                      type="button"
                      className="summary-action-btn summary-action-reject"
                      onClick={() => void finalizeCallAndGenerateReport('user')}
                      disabled={isFinalizingCall || Boolean(voiceReport)}
                    >
                      {isFinalizingCall ? 'Generando informe…' : 'Finalizar y generar informe'}
                    </button>
                  ) : null}
                </div>

                <div className="voice-call-context">
                  <span className="voice-call-pill">Tiempo {callTimeLabel} / {maxCallTimeLabel}</span>
                  <span className="voice-call-pill">
                    Pausa: {pauseUsed ? (voicePaused ? 'en uso' : 'usada') : 'disponible'}
                  </span>
                  <span className="voice-call-pill">
                    Tiempo total restante:{' '}
                    {remainingTotalSec === null
                      ? '—'
                      : `${Math.floor(remainingTotalSec / 60).toString().padStart(2, '0')}:${(remainingTotalSec % 60).toString().padStart(2, '0')}`}
                  </span>
                  <span className="voice-call-pill">
                    Sesión: única
                  </span>
                </div>

                {voiceError ? <p className="voice-call-error">{voiceError}</p> : null}

                {(voiceConnected || voiceUserTranscript || voicePartialTranscript || voiceAgentTranscript) && (
                  <div className="voice-call-transcripts">
                    <div className="voice-call-transcript-card">
                      <span className="voice-call-transcript-label">Agente</span>
                      <p>{voiceAgentTranscript || 'La pregunta hablada aparecerá aquí.'}</p>
                    </div>
                    <div className="voice-call-transcript-card">
                      <span className="voice-call-transcript-label">Tu voz</span>
                      <p>{voiceUserTranscript || voicePartialTranscript || 'Cuando hables, la transcripción se mostrará aquí.'}</p>
                    </div>
                  </div>
                )}
              </section>

              {voiceReport && (
                <section className="voice-call-shell">
                  <div className="voice-call-topbar">
                    <div>
                      <span className="voice-call-label">Informe ejecutivo</span>
                      <h1>Diagnóstico de la llamada</h1>
                    </div>
                  </div>
                  <div className="voice-call-transcript-card">
                    <p>{voiceReport.executive_report}</p>
                  </div>
                  {voiceReport.key_findings.length > 0 && (
                    <div className="voice-call-transcript-card">
                      <span className="voice-call-transcript-label">Hallazgos principales</span>
                      <ul>
                        {voiceReport.key_findings.map((finding) => (
                          <li key={finding}>{finding}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="voice-call-actions">
                    <button
                      type="button"
                      className="summary-action-btn summary-action-accept"
                      onClick={() => { onClose(); router.push('/diagnosis'); }}
                    >
                      Ir al diagnóstico completo
                    </button>
                  </div>
                </section>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
