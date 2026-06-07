'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { useInterviewStore } from '@/state/interview.store';
import { useProfileStore } from '@/state/profile.store';

import {
  abortInterviewRealtimeToken,
  finalizeInterviewVoiceCall,
  getInterviewRealtimeToken,
  getSessionInfo,
  nextConversationStep,
  saveInterviewVoiceState,
} from '@/lib/api';
import { ApiHttpError } from '@/lib/apiEnvelope';
import { toUserFacingError } from '@/lib/userError';
import { AiLoader } from '@/components/ui/ai-loader';
import {
  clearInterviewVoiceState,
  readInterviewVoiceState,
  writeInterviewVoiceState,
} from '@/lib/interviewVoiceState';
import {
  INTERVIEW_CLOSEOUT_BUFFER_SEC,
  INTERVIEW_MAX_CALLS_PER_USER,
  INTERVIEW_TOTAL_LIMIT_MINUTES,
  INTERVIEW_TOTAL_LIMIT_SEC,
} from '@financial-agent/shared';
import {
  buildVoiceSessionInstructions,
  resolveInterviewVoiceStateFlags,
  formatBlockLabel,
  formatMoneyCompact,
  summarizeVoiceInterviewContext,
  type InterviewVoiceReport,
  type InterviewVoiceSnapshot,
  type InterviewVoiceSummaryEntry,
  type VoiceSessionContext,
} from './interview-modal.context';

const DEFAULT_MAX_CALL_DURATION_SEC = INTERVIEW_TOTAL_LIMIT_SEC;

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onDiagnosisComplete?: () => void;
};

function emitVoiceSessionContext(
  sendVoiceEvent: ((payload: Record<string, unknown>) => void) | null,
  ctx: VoiceSessionContext,
  options?: {
    latestUserSnippet?: string;
    callPhase?: 'exploration' | 'closeout';
    startingFocus?: string;
    triggerResponse?: boolean;
  },
) {
  if (!sendVoiceEvent) return;
  sendVoiceEvent({
    type: 'session.update',
    session: {
      instructions: buildVoiceSessionInstructions({
        intake: ctx.intake,
        transcriptEntries: ctx.transcriptEntries,
        minuteSummaries: ctx.minuteSummaries,
        finalSummary: ctx.finalSummary,
        completedBlocks: ctx.completedBlocks,
        currentQuestion: ctx.currentQuestion,
        latestUserSnippet: options?.latestUserSnippet,
        callPhase: options?.callPhase ?? 'exploration',
      }),
    },
  });
  if (!options?.triggerResponse) return;
  const focus =
    options.startingFocus ||
    ctx.currentQuestion ||
    'Profundiza la tensión más relevante entre intake, presupuesto y cartolas.';
  sendVoiceEvent({
    type: 'response.create',
    response: {
      output_modalities: ['audio'],
      instructions: [
        'Inicia con tono ejecutivo chileno, sobrio y preciso.',
        'Demuestra dominio del caso citando un dato concreto del presupuesto, cartola o intake.',
        'Formula una sola pregunta de alto valor para profundizar el diagnóstico.',
        `Foco: ${focus}`,
      ].join(' '),
    },
  });
}

function formatClock(totalSeconds: number | null) {
  if (totalSeconds === null) return '—';
  const safe = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(safe / 60).toString().padStart(2, '0')}:${(safe % 60).toString().padStart(2, '0')}`;
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function InterviewVoiceSummaryBlock(props: {
  title: string;
  items: InterviewVoiceSummaryEntry[];
  fallbackText: string;
}) {
  const { title, items, fallbackText } = props;
  return (
    <div className="voice-call-transcript-card">
      <span className="voice-call-transcript-label">{title}</span>
      <div>
        {items.length > 0 ? (
          items.map((item) => (
            <p key={`${title}-${item.minute}-${item.createdAt}`}>
              Minuto {item.minute}: {item.summary}
              {item.keyFindings.length ? ` | hallazgos: ${item.keyFindings.join(' | ')}` : ''}
              {item.confidence ? ` | confianza: ${item.confidence}` : ''}
            </p>
          ))
        ) : (
          <p>{fallbackText}</p>
        )}
      </div>
    </div>
  );
}

function InterviewVoiceReportBlock(props: {
  report: InterviewVoiceReport;
  onOpenDiagnosis: () => void;
  onClose: () => void;
}) {
  const { report, onOpenDiagnosis, onClose } = props;
  return (
    <section className="voice-call-shell interview-report-shell">
      <div className="voice-call-transcript-card">
        <p>{report.executive_report}</p>
      </div>
      {report.key_findings.length > 0 && (
        <div className="voice-call-transcript-card">
          <span className="voice-call-transcript-label">Hallazgos principales</span>
          <ul>
            {report.key_findings.map((finding) => (
              <li key={finding}>{finding}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="voice-call-actions">
        <button type="button" className="summary-action-btn summary-action-accept" onClick={onOpenDiagnosis}>
          Ver diagnóstico completo
        </button>
        <button type="button" className="summary-action-btn" onClick={onClose}>
          Cerrar
        </button>
      </div>
    </section>
  );
}

export function InterviewModal({ isOpen, onClose, onDiagnosisComplete }: Props) {
  const router = useRouter();
  const bootedRef = useRef(false);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
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
  const [intakeReady, setIntakeReady] = useState(false);
  const [summaryComment, setSummaryComment] = useState('');
  const [summarySubmitting, setSummarySubmitting] = useState(false);
  const [summaryGenerating, setSummaryGenerating] = useState(false);
  const [voiceSessionReady, setVoiceSessionReady] = useState(false);
  const [isGeneratingDiagnosis, setIsGeneratingDiagnosis] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [sessionAlreadyCompleted, setSessionAlreadyCompleted] = useState(false);
  const voiceSyncTimerRef = useRef<number | null>(null);
  /** Set to true once the server token is received; cleared on DataChannel open (success) or catch (abort). */
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

  const currentQuestion =
    lastResponse?.type === 'question' && typeof lastResponse.question === 'string'
      ? lastResponse.question
      : '';
  const currentSummary =
    lastResponse?.type === 'block_summary' && typeof lastResponse.summary === 'string'
      ? lastResponse.summary
      : '';
  const awaitingSummaryValidation = Boolean(currentSummary);

  const interviewTranscriptSnapshot = useMemo(() => {
    const lines: string[] = [];

    for (const entry of transcriptEntries) {
      if (!entry?.answer || !String(entry.answer).trim()) continue;
      lines.push(`USUARIO [${entry.blockId}]: ${String(entry.answer).trim()}`);
    }

    return lines.join('\n').trim();
  }, [transcriptEntries]);

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

  const {
    hasCompletedVoiceInterview,
    hasEverStartedVoiceCall,
    hasRemainingInterviewTime,
    hasLiveVoiceCall,
    isClosingWindow,
    voiceCallExhausted,
    voiceInterviewLocked,
  } = resolveInterviewVoiceStateFlags({
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

  function handleUnauthorized(error: unknown) {
    if (error instanceof ApiHttpError && error.status === 401) {
      router.replace('/login');
      return true;
    }
    return false;
  }

  function getFocusableElements() {
    if (!modalRef.current) return [] as HTMLElement[];
    return Array.from(
      modalRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true');
  }

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    bootedRef.current = false;
    setIntakeReady(false);
    setBootError(null);
    setSessionAlreadyCompleted(false);
    setVoiceSessionReady(false);
    setVoiceConnecting(false);
    setVoiceConnected(false);
    setVoiceListening(false);
    setVoiceSpeaking(false);
    setVoiceError(null);
    setVoicePaused(false);
    setPauseUsed(false);
    setCallSeconds(0);
    setMaxCallDurationSec(DEFAULT_MAX_CALL_DURATION_SEC);
    setRemainingTotalSec(null);
    setCallId(null);
    setCallsStarted(0);
    setLatestDiagnosticProfileId(null);
    setIsFinalizingCall(false);
    setIsGeneratingDiagnosis(false);
    setSummaryComment('');
    setSummarySubmitting(false);
    setSummaryGenerating(false);
    setSyncError(null);
    setVoiceReport(null);
    setMinuteSummaries([]);
    setFinalSummary(null);
    setVoiceAgentTranscript('');
    setVoiceUserTranscript('');
    setVoicePartialTranscript('');
    voiceStateHydratedRef.current = false;
    voiceAutoFinalizeRef.current = false;
    voiceFinalizeTriggeredRef.current = false;
    closeoutPromptSentRef.current = false;
    pendingInitialResponseRef.current = null;
    summaryRequestRef.current = null;
    summaryDraftRef.current = '';
    summaryMinuteAppliedRef.current = 0;

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

        if (!cancelled && sessionIntake && typeof sessionIntake === 'object') {
          const mergedIntake = {
            ...(sessionIntake as Record<string, unknown>),
            __productsContext: productsContext ?? null,
            __budgetContext: budgetContext ?? null,
          };
          if (!intake) {
            setIntake(mergedIntake as any);
          } else {
            const current = intake as unknown as Record<string, unknown>;
            setIntake({
              ...current,
              __productsContext: current.__productsContext ?? productsContext ?? null,
              __budgetContext: current.__budgetContext ?? budgetContext ?? null,
            } as any);
          }
        } else if (!cancelled && !intake && !sessionIntake) {
        setBootError(
            'No se encontró información de perfil. Completa el cuestionario de intake para iniciar la entrevista.',
          );
          return;
        }

        if (!cancelled) {
          const saved = readInterviewVoiceState();
          const localSaved = saved && typeof saved === 'object' ? (saved as InterviewVoiceSnapshot) : null;

          /**
           * Merge strategy (senior rule):
           *   - Server (sessionVoice) is the source of truth for quota/timer fields and stored summaries.
           *   - Local sessionStorage may have fresher summaries while sync is pending.
           *   - callSeconds: take the larger of both (most recent progress).
           */
          const snapshot: InterviewVoiceSnapshot | null =
            localSaved || sessionVoice
              ? ({
                  ...(localSaved ?? {}),
                  // --- Server overrides all quota/timer/status fields ---
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
                        callSeconds: Math.max(
                          Number(sessionVoice.callSeconds ?? 0),
                          Number(localSaved?.callSeconds ?? 0),
                        ),
                        pauseUsed: sessionVoice.pauseUsed ?? localSaved?.pauseUsed,
                      }
                    : {}),
                } as InterviewVoiceSnapshot)
              : null;

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
            if (Array.isArray(snapshot.minuteSummaries)) {
              setMinuteSummaries(snapshot.minuteSummaries as InterviewVoiceSummaryEntry[]);
              summaryMinuteAppliedRef.current = Math.max(
                summaryMinuteAppliedRef.current,
                ...(snapshot.minuteSummaries as InterviewVoiceSummaryEntry[]).map((item) => Number(item.minute ?? 0)),
              );
              setVoiceUserTranscript(
                (snapshot.minuteSummaries as InterviewVoiceSummaryEntry[])
                  .map((item) => `Minuto ${item.minute}: ${item.summary}`)
                  .join('\n\n'),
              );
            }
            if (snapshot.finalSummary) {
              setFinalSummary(snapshot.finalSummary);
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
            clearInterviewVoiceState();
            setSessionAlreadyCompleted(true);
            if (snapshot?.voiceReport && typeof snapshot.voiceReport === 'object') {
              setVoiceReport(snapshot.voiceReport as InterviewVoiceReport);
            }
            return;
          }
          voiceStateHydratedRef.current = true;
        }
      } catch (error) {
        if (!cancelled && handleUnauthorized(error)) return;
        if (!cancelled && !intake) {
          setBootError('Error al cargar la sesión. Verifica tu conexión e intenta de nuevo.');
          return;
        }
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
    if (isOpen) return;
    setIsGeneratingDiagnosis(false);
    setSyncError(null);
    cleanupVoiceSession();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTimer = window.setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 0);

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (isGeneratingDiagnosis || isFinalizingCall || voiceConnected || voiceConnecting) return;
        event.preventDefault();
        handleOverlayDismiss();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = getFocusableElements();
      if (focusable.length === 0) {
        event.preventDefault();
        modalRef.current?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const insideModal = activeElement ? modalRef.current?.contains(activeElement) : false;

      if (!insideModal) {
        event.preventDefault();
        first.focus();
        return;
      }

      if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
        return;
      }

      if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (restoreFocusRef.current && document.contains(restoreFocusRef.current)) {
        restoreFocusRef.current.focus();
      }
    };
  }, [isOpen, onClose, isGeneratingDiagnosis, isFinalizingCall, voiceConnected, voiceConnecting]);

  useEffect(() => {
    setVoiceSupported(
      typeof window !== 'undefined' &&
        typeof window.RTCPeerConnection !== 'undefined' &&
        typeof navigator !== 'undefined' &&
        !!navigator.mediaDevices?.getUserMedia
    );
  }, []);

  // Boot contextual blocks in background (voice session does not depend on this)
  useEffect(() => {
    if (!isOpen || !intakeReady || !intake || bootedRef.current || currentQuestion) {
      return;
    }
    bootedRef.current = true;
    setBootError(null);

    nextConversationStep({
      intake,
      completedBlocks,
      interviewTranscript: interviewTranscriptSnapshot,
    })
      .then(setResponse)
      .catch((error) => {
        if (handleUnauthorized(error)) return;
        setBootError(toUserFacingError(error, 'interview.voice'));
      });
  }, [
    isOpen,
    intakeReady,
    intake,
    completedBlocks,
    currentQuestion,
    interviewTranscriptSnapshot,
    setResponse,
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
        setBootError(toUserFacingError(error, 'interview.voice'));
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
      minuteSummaries,
      finalSummary,
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
    minuteSummaries,
    finalSummary,
    voiceReport,
  ]);

  useEffect(() => {
    callSecondsRef.current = callSeconds;
  }, [callSeconds]);

  useEffect(() => {
    if (!isOpen || !voiceStateHydratedRef.current) return;
    if (voiceSyncTimerRef.current) window.clearTimeout(voiceSyncTimerRef.current);

    const hasContent =
      Boolean(callId) ||
      minuteSummaries.length > 0 ||
      Boolean(finalSummary) ||
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
        minuteSummaries,
        finalSummary,
        completedAt: voiceReport ? new Date().toISOString() : undefined,
        voiceReport,
      };

      writeInterviewVoiceState(snapshot);
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

  // Only derive remaining time from local counter when the server has NOT provided a value yet.
  // Once the server sets remainingTotalSec (via token or hydration), the call timer takes over.
  useEffect(() => {
    if (!isOpen || remainingTotalSec !== null) return;
    setRemainingTotalSec(Math.max(0, maxCallDurationSec - callSeconds));
  }, [isOpen, callSeconds, maxCallDurationSec, remainingTotalSec]);

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
        }
        return next;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isOpen, voiceConnected, voicePaused, maxCallDurationSec]);

  useEffect(() => {
    if (!isOpen || !voiceConnected || voicePaused || voiceSpeaking || summaryGenerating || isFinalizingCall || voiceCallExhausted) return;
    const elapsedMinute = Math.max(0, Math.floor(callSeconds / 60));
    if (elapsedMinute <= 0) return;
    if (elapsedMinute <= summaryMinuteAppliedRef.current) return;
    void requestVoiceSummary('minute', elapsedMinute);
  }, [isOpen, voiceConnected, voicePaused, voiceSpeaking, summaryGenerating, callSeconds, voiceCallExhausted, isFinalizingCall]);

  useEffect(() => {
    if (!isOpen || voiceReport || !voiceCallExhausted || isFinalizingCall) return;
    if (!finalSummary && !summaryRequestRef.current && !summaryGenerating) {
      void requestVoiceSummary('final');
      return;
    }
    if (voiceAutoFinalizeRef.current) return;

    voiceAutoFinalizeRef.current = true;
    void finalizeCallAndGenerateReport('timeout');
  }, [isOpen, voiceCallExhausted, voiceReport, finalSummary, summaryGenerating, isFinalizingCall]);

  useEffect(() => {
    if (!isOpen || !isClosingWindow || closeoutPromptSentRef.current) return;
    closeoutPromptSentRef.current = true;
    emitVoiceSessionContext(sendVoiceEventRef.current, voiceSessionContextRef.current, {
      callPhase: 'closeout',
      triggerResponse: true,
      startingFocus: 'Cierra la entrevista con síntesis ejecutiva clara. Empieza con <<CALL_COMPLETE>>.',
    });
  }, [isOpen, isClosingWindow]);

  // Auto-finalize on agent completion signal
  useEffect(() => {
    const normalized = voiceAgentTranscript.toUpperCase();
    if (!voiceConnected || isFinalizingCall || voiceFinalizeTriggeredRef.current || summaryRequestRef.current) return;
    if (!normalized.includes('<<CALL_COMPLETE>>')) return;
    voiceFinalizeTriggeredRef.current = true;
    void finalizeCallAndGenerateReport('agent');
  }, [voiceAgentTranscript, voiceConnected, isFinalizingCall]);

  if (!isOpen) return null;

  const blockVoiceInteraction =
    voiceConnected || voiceConnecting || isFinalizingCall || isGeneratingDiagnosis;
  const canDismissOverlay = !blockVoiceInteraction;

  function handleOverlayDismiss() {
    if (!canDismissOverlay) return;
    cleanupVoiceSession();
    onClose();
  }

  const blockId = lastResponse?.blockId;
  const answersInBlock = blockId ? answersByBlock[blockId] ?? [] : [];
  const stageLabel =
    voiceReport?.executive_report
      ? 'Diagnóstico listo'
      : finalSummary
      ? 'Síntesis lista'
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

  const interviewContextSummary = summarizeVoiceInterviewContext(intake, transcriptEntries);
  const enrichedIntake = intake as Record<string, unknown> | null;
  const productsContext = enrichedIntake?.__productsContext as Record<string, unknown> | undefined;
  const budgetContext = enrichedIntake?.__budgetContext as Record<string, unknown> | undefined;
  const currentBlockLabel = formatBlockLabel(blockId);
  const completedBlockCount = Object.keys(completedBlocks ?? {}).length;
  const productCount = Math.max(0, Number(productsContext?.productsCount ?? 0));
  const budgetBalance = Math.round(Number(budgetContext?.balance ?? 0));
  const budgetRowsCount = Math.max(0, Number(budgetContext?.rowsCount ?? 0));
  const interviewBriefPoints = [
    productCount > 0 ? `${productCount} producto${productCount === 1 ? '' : 's'} enlazado${productCount === 1 ? '' : 's'}` : null,
    budgetRowsCount > 0 ? `${budgetRowsCount} fila${budgetRowsCount === 1 ? '' : 's'} reales de presupuesto` : null,
    Number.isFinite(budgetBalance) && budgetRowsCount > 0
      ? `Balance mensual ${budgetBalance >= 0 ? '+' : ''}${budgetBalance.toLocaleString('es-CL')}`
      : null,
  ].filter(Boolean) as string[];
  const contextHighlights = interviewContextSummary
    ? interviewContextSummary
        .split('||')
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 4)
    : [];
  const sessionStatusItems = [
    {
      label: 'Estado',
      value: stageLabel,
      tone: voiceConnected ? 'is-live' : voiceReport ? 'is-done' : '',
    },
    {
      label: 'Bloque activo',
      value: currentBlockLabel,
      tone: awaitingSummaryValidation ? 'is-review' : '',
    },
    {
      label: 'Cierre',
      value: voiceReport ? 'Informe listo' : finalSummary ? 'Síntesis lista' : awaitingSummaryValidation ? 'Validación pendiente' : isClosingWindow ? 'Ventana final' : 'Exploración abierta',
      tone: isClosingWindow ? 'is-closing' : voiceReport || finalSummary ? 'is-done' : '',
    },
  ];
  const workspaceCoachNote = awaitingSummaryValidation
    ? 'Puedes validar el bloque en paralelo. La llamada sigue disponible.'
    : voiceConnected
    ? 'Responde con ejemplos concretos. El entrevistador ya tiene tu intake, presupuesto, cartolas y síntesis de llamada.'
    : hasEverStartedVoiceCall
    ? 'Puedes retomar la llamada donde quedó.'
    : 'Inicia la llamada para una entrevista ejecutiva breve con contexto completo.';

  const callProgressPct = Math.max(0, Math.min(100, Math.round((callSeconds / Math.max(1, maxCallDurationSec)) * 100)));

  function normalizeSummaryText(value: unknown) {
    return String(value ?? '')
      .trim()
      .replace(/\s+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n');
  }

  function buildSummaryInstructions(kind: 'minute' | 'final', minute?: number) {
    const targetMinute = typeof minute === 'number' ? minute : Math.max(1, Math.ceil(callSecondsRef.current / 60));
    return [
      'Eres un sintetizador ejecutivo de una entrevista financiera en tiempo real.',
      'No transcribas literalmente. Resume el contenido con precisión, sin inventar datos.',
      'Devuelve SOLO JSON válido, sin markdown ni explicación adicional.',
      'Esquema requerido:',
      '{"minute":number,"summary":"string","keyFindings":["string"],"confidence":"high|medium|low","nextFocus":"string"}',
      'Reglas:',
      '- summary: 2 a 4 frases cortas, chileno profesional, foco ejecutivo.',
      '- keyFindings: 2 a 5 bullets en formato string.',
      '- nextFocus: la mejor próxima línea de profundización.',
      kind === 'minute'
        ? `Objeto para síntesis intermedia del minuto ${targetMinute}.`
        : 'Objeto para síntesis final de la llamada completa.',
      `Contexto activo del bloque: ${currentBlockLabel}.`,
      currentQuestion ? `Pregunta activa: ${currentQuestion}` : 'Sin pregunta activa concreta.',
    ].join('\n');
  }

  function parseSummaryPayload(payload: Record<string, unknown>, fallbackMinute: number) {
    const text =
      typeof payload.text === 'string'
        ? payload.text
        : typeof payload.delta === 'string'
        ? payload.delta
        : typeof payload.content === 'string'
        ? payload.content
        : '';
    const trimmed = normalizeSummaryText(text);
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const summary = normalizeSummaryText(parsed.summary ?? parsed.summaryText ?? trimmed);
      const keyFindings = Array.isArray(parsed.keyFindings)
        ? parsed.keyFindings.map((item) => normalizeSummaryText(item)).filter(Boolean).slice(0, 5)
        : [];
      const minute = Number.isFinite(Number(parsed.minute)) ? Math.max(1, Math.floor(Number(parsed.minute))) : fallbackMinute;
      const confidence =
        parsed.confidence === 'high' || parsed.confidence === 'medium' || parsed.confidence === 'low'
          ? parsed.confidence
          : undefined;
      return {
        minute,
        summary,
        keyFindings,
        confidence,
        createdAt: new Date().toISOString(),
      } satisfies InterviewVoiceSummaryEntry;
    } catch {
      return {
        minute: fallbackMinute,
        summary: trimmed,
        keyFindings: [],
        confidence: undefined,
        createdAt: new Date().toISOString(),
      } satisfies InterviewVoiceSummaryEntry;
    }
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
      setBootError(toUserFacingError(error, 'interview.voice'));
    }
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
        instructions: buildSummaryInstructions(kind, minute),
      },
    });
    return true;
  }

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
    setVoiceError(null);
    setSummaryGenerating(false);
    setVoiceSessionReady(false);
    voiceResumeModeRef.current = false;
    closeoutPromptSentRef.current = false;
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
      question ||
      `Profundiza el bloque ${currentBlockLabel.toLowerCase()} cruzando intake, presupuesto y productos.`;
    if (options?.resetTranscript !== false) {
      setVoiceAgentTranscript('');
      setVoicePartialTranscript('');
    }
    pushVoiceSessionContext({ startingFocus, triggerResponse: true });
  }

  function resolveVoiceCapabilityIssue() {
    if (typeof window === 'undefined') return null;
    if (!window.isSecureContext) {
      return 'La llamada en tiempo real requiere un contexto seguro (HTTPS o localhost).';
    }
    return null;
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
    if (voiceCallExhausted && !hasLiveVoiceCall) {
      setVoiceError('El tiempo de la entrevista se agotó. Genera el informe con el botón inferior.');
      return;
    }
    if (voiceInterviewLocked && !hasLiveVoiceCall) {
      setVoiceError('Esta entrevista senior ya quedó cerrada y no admite otra llamada.');
      return;
    }
    if (!hasLiveVoiceCall && callsStarted >= INTERVIEW_MAX_CALLS_PER_USER) {
      setVoiceError('Solo se permite una llamada por usuario en esta entrevista.');
      return;
    }

    const capabilityIssue = resolveVoiceCapabilityIssue();
    if (capabilityIssue) { setVoiceError(capabilityIssue); return; }

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
        (Boolean(callId) ||
          callSeconds > 0 ||
          minuteSummaries.length > 0 ||
          Boolean(finalSummary));
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
        setMinuteSummaries([]);
        setFinalSummary(null);
        setVoiceAgentTranscript('');
        setVoiceUserTranscript('');
        setVoicePartialTranscript('');
      } else {
        setMinuteSummaries(
          (token?.interview_voice?.minuteSummaries as InterviewVoiceSummaryEntry[] | undefined) ??
            minuteSummaries,
        );
        setFinalSummary(
          (token?.interview_voice?.finalSummary as InterviewVoiceSnapshot['finalSummary']) ??
            finalSummary ??
            null,
        );
        setVoiceReport(
          (token?.interview_voice?.voiceReport as InterviewVoiceReport | undefined) ?? voiceReport ?? null,
        );
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
        // WebRTC handshake confirmed — the call token is legitimately consumed.
        tokenIssuedRef.current = false;
        setVoiceConnected(true);
        setVoiceConnecting(false);
        pendingInitialResponseRef.current = {
          question: currentQuestion,
          resetTranscript: !hasPersistedCall,
        };
        emitVoiceSessionContext(sendVoiceEventRef.current, voiceSessionContextRef.current, {
          startingFocus:
            currentQuestion || `Profundiza el bloque ${currentBlockLabel.toLowerCase()} cruzando intake, presupuesto y productos.`,
          triggerResponse: false,
        });
      });

      dc.addEventListener('close', () => { cleanupVoiceSession(); });

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

      // If the server issued a token but WebRTC never reached DataChannel open,
      // roll back callsStarted so the user does not lose their one allowed call.
      if (tokenIssuedRef.current) {
        tokenIssuedRef.current = false;
        setCallsStarted((prev) => Math.max(0, prev - 1));
        void abortInterviewRealtimeToken().catch(() => {
          // Best-effort: if the abort fails, the quota remains incremented.
          // The user can contact support; we do not surface this as an error.
        });
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
    if (isFinalizingCall || voiceFinalizeTriggeredRef.current) return;
    voiceFinalizeTriggeredRef.current = true;
    setIsFinalizingCall(true);
    setIsGeneratingDiagnosis(true);
    cleanupVoiceSession();
    try {
      const minuteSummaryPayload = minuteSummaries.map((item, index) => ({
        minute: typeof item.minute === 'number' ? item.minute : index + 1,
        summary: normalizeSummaryText(item.summary),
        keyFindings: Array.isArray(item.keyFindings) ? item.keyFindings.map((finding) => normalizeSummaryText(finding)).filter(Boolean) : [],
        confidence: item.confidence ?? 'medium',
        createdAt: item.createdAt ?? new Date().toISOString(),
      })).filter((item) => item.summary.length > 0);
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

      let result: Awaited<ReturnType<typeof finalizeInterviewVoiceCall>> | null = null;
      let lastError: unknown = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          result = await finalizeInterviewVoiceCall({
            intake,
            minuteSummaries: minuteSummaryPayload,
            finalSummary: fallbackFinalSummary ?? undefined,
            endedBy,
            durationSec: Math.max(
              1,
              Math.floor(options?.durationSecOverride ?? callSecondsRef.current ?? callSeconds),
            ),
            callId: callId ?? undefined,
          });
          break;
        } catch (error) {
          lastError = error;
          if (handleUnauthorized(error)) {
            setIsGeneratingDiagnosis(false);
            return;
          }
          if (attempt < 2) await wait(400 * (attempt + 1));
        }
      }
      if (!result) throw lastError ?? new Error('No se pudo finalizar la llamada');

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
          keyFindings: Array.isArray(item?.key_findings) ? item.key_findings.map((finding: unknown) => String(finding)) : [],
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
      setIsGeneratingDiagnosis(false);
      onDiagnosisComplete?.();
    } catch (error) {
      voiceFinalizeTriggeredRef.current = false;
      if (handleUnauthorized(error)) {
        setIsGeneratingDiagnosis(false);
        return;
      }
      setIsGeneratingDiagnosis(false);
      setVoiceError(toUserFacingError(error, 'interview.voice'));
    } finally {
      setIsFinalizingCall(false);
    }
  }

  async function applyVoiceTranscriptAsAnswer() {
    return applyLatestVoiceSummaryAsAnswer();
  }

  async function submitSummaryValidation(accepted: boolean) {
    if (!blockId || !currentSummary || summarySubmitting) return;
    setSummarySubmitting(true);
    try {
      const res = await nextConversationStep({
        intake,
        blockId,
        answersInCurrentBlock: answersInBlock,
        completedBlocks,
        summaryValidation: {
          accepted,
          comment: summaryComment.trim() || undefined,
        },
        interviewTranscript: interviewTranscriptSnapshot,
      });
      setSummaryComment('');
      setResponse(res);
    } catch (error) {
      if (handleUnauthorized(error)) return;
    } finally {
      setSummarySubmitting(false);
    }
  }

  const isLoading = !intakeReady || !intake;
  const showVoiceReport = Boolean(voiceReport?.executive_report);
  const voiceFocusHint = currentQuestion
    ? currentQuestion
    : `Explorar ${currentBlockLabel.toLowerCase()} con el contexto financiero disponible.`;

  return (
    <div
      className="agent-modal-overlay interview-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Entrevista estratégica"
      onClick={canDismissOverlay ? handleOverlayDismiss : undefined}
    >
      {isGeneratingDiagnosis ? (
        <div
          className="agent-modal interview-modal interview-modal--generating"
          ref={modalRef}
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <AiLoader
        text="Generando diagnóstico final"
        subtitle="Estamos consolidando el diagnóstico profesional con toda la evidencia disponible."
          />
        </div>
      ) : (
      <div
        className="agent-modal interview-modal"
        ref={modalRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="bcc-modal-header interview-modal-header">
          <div className="bcc-modal-title-wrap">
            <span className="bcc-modal-eyebrow">Financieramente</span>
            <h3 className="bcc-modal-title">Entrevista estratégica</h3>
          </div>
          <button
            type="button"
            className="agent-modal-close"
            ref={closeButtonRef}
            onClick={canDismissOverlay ? handleOverlayDismiss : undefined}
            disabled={!canDismissOverlay}
            aria-label="Cerrar entrevista"
          >
            ×
          </button>
        </div>

        <p className="agent-modal-intro interview-modal-intro">
          Llamada breve con contexto integrado de presupuesto y productos para convertir señales dispersas en entrevista útil y diagnóstico final.
        </p>

        {syncError ? (
          <div className="interview-sync-error-toast" role="status" aria-live="polite">
            {syncError}
          </div>
        ) : null}

        {isLoading ? (
          <div className="interview-modal-loading">
            <span>Cargando sesión…</span>
          </div>
        ) : sessionAlreadyCompleted && !showVoiceReport ? (
          <div className="interview-modal-completed">
            <div className="voice-call-transcript-card">
              <span className="voice-call-transcript-label">Entrevista completada</span>
              <p>Ya consolidamos tu diagnóstico final. Puedes revisarlo en detalle o exportarlo.</p>
            </div>
            <div className="voice-call-actions">
              <button
                type="button"
                className="summary-action-btn summary-action-accept"
                onClick={() => {
                  handleOverlayDismiss();
                  router.push('/diagnosis');
                }}
              >
                Ver diagnóstico completo
              </button>
              <button type="button" className="summary-action-btn" onClick={handleOverlayDismiss}>
                Cerrar
              </button>
            </div>
          </div>
        ) : (
          <div className="interview-shell pro-interview-shell interview-modal-body">
            <div className="interview-stage-shell">
              <aside className="interview-panel-surface interview-panel-surface--sidebar">
                <div className="interview-brief-card">
                  <div className="interview-brief-top">
                    <div>
                      <span className="interview-surface-eyebrow">Resumen de sesión</span>
                      <h4>Entrevista guiada</h4>
                    </div>
                    <span className={`interview-brief-status${voiceConnected ? ' is-live' : voiceReport ? ' is-done' : ''}`}>
                      {voiceConnected ? 'En vivo' : voiceReport ? 'Listo' : stageLabel}
                    </span>
                  </div>
                  <p>
                    {voiceConnected
                      ? 'Sesión activa. Responde con ejemplos concretos de tu situación real.'
                      : showVoiceReport
                      ? 'Diagnóstico consolidado. Revisa el informe y continúa al detalle completo.'
                      : 'Conversación breve con contexto de presupuesto y productos para cerrar tu diagnóstico.'}
                  </p>
                  <div className="interview-brief-tags">
                    <span className="interview-brief-tag">{currentBlockLabel}</span>
                    <span className="interview-brief-tag">{completedBlockCount} bloque{completedBlockCount === 1 ? '' : 's'} cerrado{completedBlockCount === 1 ? '' : 's'}</span>
                    <span className="interview-brief-tag">Tiempo {callTimeLabel}</span>
                  </div>
                </div>

                <div className="interview-metrics-grid">
                  <article className="interview-metric-card">
                    <span>Tiempo restante</span>
                    <strong>{formatClock(remainingTotalSec)}</strong>
                  </article>
                  <article className="interview-metric-card">
                    <span>Balance base</span>
                    <strong>{budgetRowsCount > 0 ? `${budgetBalance >= 0 ? '+' : ''}${budgetBalance.toLocaleString('es-CL')}` : '—'}</strong>
                  </article>
                  <article className="interview-metric-card">
                    <span>Productos</span>
                    <strong>{productCount}</strong>
                  </article>
                  <article className="interview-metric-card">
                    <span>Pausa</span>
                    <strong>{pauseUsed ? (voicePaused ? 'Activa' : 'Usada') : 'Disponible'}</strong>
                  </article>
                </div>

                {interviewBriefPoints.length > 0 ? (
                  <div className="interview-notes-card">
                    <span className="interview-surface-eyebrow">Base detectada</span>
                    <ul>
                      {interviewBriefPoints.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {contextHighlights.length > 0 ? (
                  <div className="interview-notes-card">
                    <span className="interview-surface-eyebrow">Contexto consolidado</span>
                    <ul>
                      {contextHighlights.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="interview-status-rail">
                  <span className="interview-surface-eyebrow">Estado</span>
                  <div className="interview-status-list">
                    {sessionStatusItems.map((item) => (
                      <div key={item.label} className={`interview-status-item ${item.tone}`.trim()}>
                        <span>{item.label}</span>
                        <strong>{item.value}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </aside>

              <div className="interview-column pro-interview-column interview-panel-surface interview-panel-surface--workspace">
              <section className={`voice-call-shell interview-live-shell${showVoiceReport ? ' is-hidden-by-report' : ''}`}>
                <div className="voice-call-topbar">
                  <div>
                    <span className="voice-call-label">Entrevista en tiempo real</span>
                    <h1>Entrevista estratégica</h1>
                    <p className="voice-call-subtitle">
                      {voiceCallExhausted && !showVoiceReport
                        ? 'Tiempo agotado — puedes generar el informe con lo registrado'
                        : voiceConnected
                        ? voicePaused
                          ? 'Llamada en pausa'
                          : voiceListening
                          ? 'Te escucho…'
                          : voiceSpeaking
                          ? 'Entrevistador hablando'
                          : 'Conversación activa'
                        : 'Presiona iniciar llamada para comenzar'}
                    </p>
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

                <div className="voice-call-transcript-card interview-focus-card">
                  <span className="voice-call-transcript-label">Foco de conversación</span>
                  <p>{voiceFocusHint}</p>
                  <small className="interview-inline-note">{workspaceCoachNote}</small>
                </div>

                {awaitingSummaryValidation && !voiceConnected ? (
                  <div className="voice-call-transcript-card interview-validation-card">
                    <span className="voice-call-transcript-label">Validación de bloque (opcional)</span>
                    <p>{currentSummary}</p>
                    <textarea
                      className="agent-textarea"
                      rows={3}
                      value={summaryComment}
                      onChange={(event) => setSummaryComment(event.target.value)}
                      placeholder="Si falta algo, escríbelo aquí para afinar la siguiente repregunta."
                    />
                    <div className="voice-call-actions">
                      <button
                        type="button"
                        className="summary-action-btn summary-action-accept"
                        onClick={() => void submitSummaryValidation(true)}
                        disabled={summarySubmitting}
                      >
                        {summarySubmitting ? 'Guardando…' : 'Validar bloque'}
                      </button>
                      <button
                        type="button"
                        className="summary-action-btn summary-action-reject"
                        onClick={() => void submitSummaryValidation(false)}
                        disabled={summarySubmitting}
                      >
                        {summarySubmitting ? 'Repreguntando…' : 'Pedir repregunta'}
                      </button>
                    </div>
                  </div>
                ) : null}

                {bootError ? (
                  <p className="voice-call-error interview-call-error-banner">{bootError}</p>
                ) : null}

                <div className="voice-call-progress" aria-hidden="true">
                  <span style={{ width: `${callProgressPct}%` }} />
                </div>

                <div className="voice-call-context">
                  {intakeSnapshot.map((item) => (
                    <span key={item} className="voice-call-pill">{item}</span>
                  ))}
                </div>

                <div className="voice-call-actions interview-call-actions interview-call-actions--primary">
                  <button
                    type="button"
                    className="summary-action-btn summary-action-accept interview-call-start-btn"
                    onClick={() => void startOrResumeVoiceSession()}
                    disabled={
                      !voiceSupported ||
                      voiceConnecting ||
                      voiceConnected ||
                      isFinalizingCall ||
                      showVoiceReport ||
                      (!voiceConnected && voiceCallExhausted && !hasLiveVoiceCall) ||
                      (!voiceConnected && voiceInterviewLocked && !hasLiveVoiceCall)
                    }
                  >
                    {voiceConnecting
                      ? 'Conectando llamada…'
                      : showVoiceReport
                      ? 'Diagnóstico listo'
                      : voiceConnected
                      ? 'Llamada activa'
                      : voiceCallExhausted && !showVoiceReport
                      ? 'Tiempo agotado'
                      : hasEverStartedVoiceCall && hasRemainingInterviewTime
                      ? 'Reanudar llamada'
                      : 'Iniciar llamada'}
                  </button>
                  <button
                    type="button"
                    className="summary-action-btn"
                    onClick={toggleCallPause}
                    disabled={!voiceConnected || showVoiceReport || (pauseUsed && !voicePaused)}
                    title={pauseUsed ? 'Ya usaste la pausa única de esta llamada' : 'Pausar una vez'}
                  >
                    {voicePaused ? 'Reanudar' : pauseUsed ? 'Pausa usada' : 'Pausar (1 vez)'}
                  </button>
                </div>

                <div className="voice-call-actions interview-call-actions interview-call-actions--secondary">
                  {(minuteSummaries.length > 0 || finalSummary) && blockId ? (
                    <button
                      type="button"
                      className="summary-action-btn summary-action-reject"
                      onClick={() => void applyVoiceTranscriptAsAnswer()}
                    >
                      Usar síntesis
                    </button>
                  ) : null}
                  {voiceCallExhausted && !showVoiceReport && !voiceConnected && !isFinalizingCall ? (
                    <button
                      type="button"
                      className="summary-action-btn summary-action-accept"
                      onClick={() => void finalizeCallAndGenerateReport('timeout')}
                    >
                      Generar informe con contexto disponible
                    </button>
                  ) : null}
                  {voiceConnected ? (
                    <button
                      type="button"
                      className="summary-action-btn summary-action-reject"
                      onClick={() => void finalizeCallAndGenerateReport('user')}
                      disabled={isFinalizingCall || showVoiceReport}
                    >
                      {isFinalizingCall ? 'Generando informe…' : 'Finalizar y generar informe'}
                    </button>
                  ) : null}
                </div>

                <div className="voice-call-context interview-call-meta">
                  <span className="voice-call-pill">Tiempo {callTimeLabel} / {maxCallTimeLabel}</span>
                  <span className="voice-call-pill">
                    Pausa: {pauseUsed ? (voicePaused ? 'en uso' : 'usada') : 'disponible'}
                  </span>
                  <span className="voice-call-pill">
                    Restante:{' '}
                    {remainingTotalSec === null
                      ? '—'
                      : `${Math.floor(remainingTotalSec / 60).toString().padStart(2, '0')}:${(remainingTotalSec % 60).toString().padStart(2, '0')}`}
                  </span>
                  <span className="voice-call-pill">Una sesión por usuario</span>
                </div>

                {voiceError ? <p className="voice-call-error interview-call-error-banner">{voiceError}</p> : null}

                {(voiceConnected || minuteSummaries.length > 0 || finalSummary || voiceAgentTranscript) && (
                  <div className="voice-call-transcripts">
                    <InterviewVoiceSummaryBlock
                      title="Síntesis por minuto"
                      items={minuteSummaries.slice(-2)}
                      fallbackText="La síntesis acumulada aparecerá aquí."
                    />
                    <div className="voice-call-transcript-card">
                      <span className="voice-call-transcript-label">Síntesis final</span>
                      <p>
                        {finalSummary?.summary ||
                          voiceUserTranscript ||
                          voicePartialTranscript ||
                          'Cuando cierre la entrevista, verás la síntesis ejecutiva aquí.'}
                      </p>
                    </div>
                  </div>
                )}
              </section>

              {showVoiceReport && voiceReport && (
                <InterviewVoiceReportBlock
                  report={voiceReport}
                  onOpenDiagnosis={() => {
                    handleOverlayDismiss();
                    router.push('/diagnosis');
                  }}
                  onClose={handleOverlayDismiss}
                />
              )}
              </div>
            </div>
          </div>
        )}
      </div>
      )}
    </div>
  );
}
