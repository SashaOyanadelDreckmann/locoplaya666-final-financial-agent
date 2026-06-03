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
import { AiLoader } from '@/components/ui/ai-loader';
import {
  clearInterviewVoiceState,
  readInterviewVoiceState,
  writeInterviewVoiceState,
} from '@/lib/interviewVoiceState';
import { appendTranscriptChunk } from '@/lib/transcript';
import {
  INTERVIEW_CLOSEOUT_BUFFER_SEC,
  INTERVIEW_MAX_CALLS_PER_USER,
  INTERVIEW_TOTAL_LIMIT_MINUTES,
  INTERVIEW_TOTAL_LIMIT_SEC,
} from '@financial-agent/shared';

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

function formatMoneyCompact(value: unknown) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return '0';
  return amount.toLocaleString('es-CL');
}

function buildVoiceKnowledgePacket(intake: unknown, transcriptEntries: Array<{ blockId?: string; answer?: string }>) {
  const source = (intake ?? {}) as Record<string, unknown>;
  const products = source.__productsContext as Record<string, unknown> | undefined;
  const budget = source.__budgetContext as Record<string, unknown> | undefined;
  const transactionSummary =
    products?.transactionSummary && typeof products.transactionSummary === 'object'
      ? (products.transactionSummary as Record<string, unknown>)
      : {};
  const topRows = Array.isArray(budget?.rows)
    ? budget.rows
        .map((row) => (row && typeof row === 'object' ? (row as Record<string, unknown>) : {}))
        .filter((row) => Number(row.amount ?? 0) > 0)
        .sort((a, b) => Number(b.amount ?? 0) - Number(a.amount ?? 0))
        .slice(0, 3)
        .map((row) => `${String(row.category ?? 'Item')}: ${formatMoneyCompact(row.amount)} CLP`)
    : [];
  const priorAnswers = transcriptEntries
    .filter((entry) => entry?.answer && String(entry.answer).trim())
    .slice(-3)
    .map((entry) => `${formatBlockLabel(entry.blockId)}: ${String(entry.answer).trim().slice(0, 120)}`);

  const packet = [
    `Perfil base: ${typeof source.age === 'number' ? `${source.age} años, ` : ''}${source.profession ? `${String(source.profession)}, ` : ''}${typeof source.exactMonthlyIncome === 'number' ? `ingreso ${formatMoneyCompact(source.exactMonthlyIncome)} CLP, ` : ''}estrés ${source.moneyStressLevel ?? 'na'}/10.`,
    typeof source.hasDebt === 'boolean' ? `Deuda: ${source.hasDebt ? 'activa' : 'sin deuda declarada'}.` : '',
    source.tracksExpenses === false ? 'Blind spot: no registra gastos con disciplina.' : '',
    Number(budget?.balance ?? 0) < 0
      ? `Presupuesto en rojo: balance ${formatMoneyCompact(budget?.balance)} CLP.`
      : budget
      ? `Presupuesto: ingreso ${formatMoneyCompact(budget.income)} CLP, gasto ${formatMoneyCompact(budget.expenses)} CLP, balance ${formatMoneyCompact(budget.balance)} CLP.`
      : '',
    topRows.length > 0 ? `Rubros pesados: ${topRows.join(' | ')}.` : '',
    Number(transactionSummary.netFlow ?? 0) < 0 ? 'Movimientos recientes muestran salida neta de caja.' : '',
    Array.isArray(transactionSummary.alerts) && transactionSummary.alerts.length > 0
      ? `Alertas de productos: ${transactionSummary.alerts.slice(0, 2).join(' | ')}.`
      : '',
    Number(products?.productsCount ?? 0) > 0
      ? `Productos activos: ${Math.max(0, Number(products?.productsCount ?? 0))}; foco en ${String(products?.activeProductLabel ?? 'producto principal')}.`
      : '',
    priorAnswers.length > 0 ? `Respuestas previas: ${priorAnswers.join(' | ')}.` : '',
  ]
    .map((item) => item.trim())
    .filter(Boolean);

  return packet.join('\n');
}

function summarizeVoiceInterviewContext(intake: unknown, transcriptEntries: Array<{ blockId?: string; answer?: string }>) {
  const source = (intake ?? {}) as Record<string, unknown>;
  const products = source.__productsContext as Record<string, unknown> | undefined;
  const budget = source.__budgetContext as Record<string, unknown> | undefined;
  const parts: string[] = [];
  const knowledge =
    source.financialKnowledge && typeof source.financialKnowledge === 'object'
      ? (source.financialKnowledge as Record<string, unknown>)
      : {};
  const knownTopics = Object.entries(knowledge)
    .filter(([, value]) => value === true)
    .slice(0, 5)
    .map(([key]) => key.replace(/([A-Z])/g, ' $1').trim().toLowerCase());

  parts.push(
    [
      typeof source.age === 'number' ? `${source.age} años` : null,
      source.profession ? `profesión ${String(source.profession)}` : null,
      source.employmentStatus ? `situación ${String(source.employmentStatus).replace(/_/g, ' ')}` : null,
      typeof source.exactMonthlyIncome === 'number'
        ? `ingreso exacto ${formatMoneyCompact(source.exactMonthlyIncome)} CLP`
        : source.incomeBand
        ? `ingreso rango ${String(source.incomeBand)}`
        : null,
      source.expensesCoverage ? `cobertura ${String(source.expensesCoverage).replace(/_/g, ' ')}` : null,
      typeof source.tracksExpenses === 'boolean' ? `registra gastos ${source.tracksExpenses ? 'sí' : 'no'}` : null,
    ]
      .filter(Boolean)
      .join(', '),
  );

  parts.push(
    [
      typeof source.hasSavingsOrInvestments === 'boolean'
        ? `ahorros/inversiones ${source.hasSavingsOrInvestments ? 'sí' : 'no'}`
        : null,
      source.savingsBand ? `tramo ahorro ${String(source.savingsBand)}` : null,
      typeof source.exactSavingsAmount === 'number'
        ? `ahorro exacto ${formatMoneyCompact(source.exactSavingsAmount)} CLP`
        : null,
      typeof source.hasDebt === 'boolean' ? `deuda activa ${source.hasDebt ? 'sí' : 'no'}` : null,
    ]
      .filter(Boolean)
      .join(', '),
  );

  parts.push(
    [
      typeof source.moneyStressLevel === 'number' ? `estrés financiero ${source.moneyStressLevel}/10` : null,
      source.selfRatedUnderstanding ? `comprensión ${String(source.selfRatedUnderstanding)}` : null,
      source.riskReaction ? `reacción al riesgo ${String(source.riskReaction)}` : null,
      knownTopics.length ? `temas dominados ${knownTopics.join(' | ')}` : null,
    ]
      .filter(Boolean)
      .join(', '),
  );

  if (products && typeof products === 'object') {
    const transactionSummary =
      products.transactionSummary && typeof products.transactionSummary === 'object'
        ? (products.transactionSummary as Record<string, unknown>)
        : {};
    const alerts = Array.isArray(transactionSummary.alerts)
      ? transactionSummary.alerts.slice(0, 3).map((item) => String(item).trim()).filter(Boolean)
      : [];
    parts.push(
      `Productos: ${Math.max(0, Number(products.productsCount ?? 0))}, producto activo: ${String(products.activeProductLabel ?? 'sin foco')}, flujo neto: ${formatMoneyCompact(transactionSummary.netFlow)} CLP, movimientos: ${Math.round(Number(transactionSummary.movementCount ?? 0))}`,
    );
    if (alerts.length > 0) {
      parts.push(`Alertas detectadas: ${alerts.join(' | ')}`);
    }
  }

  if (budget && typeof budget === 'object') {
    const topRows = Array.isArray(budget.rows)
      ? budget.rows
          .slice(0, 5)
          .map((row) => {
            const item = row as Record<string, unknown>;
            return `${String(item.category ?? 'item')}: ${formatMoneyCompact(item.amount)}`;
          })
          .join(' | ')
      : '';
    parts.push(
      `Presupuesto: ingreso ${formatMoneyCompact(budget.income)} CLP, gasto ${formatMoneyCompact(budget.expenses)} CLP, balance ${formatMoneyCompact(budget.balance)} CLP, filas ${Math.round(Number(budget.rowsCount ?? 0))}`,
    );
    if (topRows) {
      parts.push(`Renglones relevantes: ${topRows}`);
    }
  }

  const priorAnswers = transcriptEntries
    .filter((entry) => entry?.answer && String(entry.answer).trim())
    .slice(-3)
    .map((entry) => `${formatBlockLabel(entry.blockId)}: ${String(entry.answer).trim().slice(0, 180)}`);
  if (priorAnswers.length > 0) {
    parts.push(`Respuestas previas: ${priorAnswers.join(' | ')}`);
  }

  return parts.map((item) => item.trim()).filter(Boolean).join(' || ');
}

function formatClock(totalSeconds: number | null) {
  if (totalSeconds === null) return '—';
  const safe = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(safe / 60).toString().padStart(2, '0')}:${(safe % 60).toString().padStart(2, '0')}`;
}

function formatBlockLabel(blockId?: string) {
  if (!blockId) return 'Exploración';
  const labels: Record<string, string> = {
    warmup: 'Apertura',
    cashflow: 'Flujo',
    resilience: 'Resiliencia',
    debt: 'Deuda',
    products: 'Productos',
    goals: 'Metas',
    knowledge: 'Comprensión',
    risk: 'Riesgo',
    emotional: 'Patrón emocional',
  };
  return labels[blockId] ?? blockId;
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function InterviewModal({ isOpen, onClose }: Props) {
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
  const [summaryComment, setSummaryComment] = useState('');
  const [summarySubmitting, setSummarySubmitting] = useState(false);
  const [isGeneratingDiagnosis, setIsGeneratingDiagnosis] = useState(false);
  const voiceSyncTimerRef = useRef<number | null>(null);
  const voiceStateHydratedRef = useRef(false);
  const voiceResumeModeRef = useRef(false);
  const voiceAutoFinalizeRef = useRef(false);
  const closeoutPromptSentRef = useRef(false);
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

  const hasCompletedVoiceInterview =
    Boolean(latestDiagnosticProfileId) || Boolean(voiceReport?.executive_report);
  const hasEverStartedVoiceCall =
    Boolean(callId) || callsStarted > 0 || callSeconds > 0 || Boolean(voiceReport);
  const hasLiveVoiceCall = Boolean(callId) && !hasCompletedVoiceInterview;
  const hasRemainingInterviewTime =
    remainingTotalSec === null ? callSeconds < maxCallDurationSec : remainingTotalSec > 0;
  const isClosingWindow =
    voiceConnected &&
    hasRemainingInterviewTime &&
    (remainingTotalSec ?? Math.max(0, maxCallDurationSec - callSeconds)) <= INTERVIEW_CLOSEOUT_BUFFER_SEC;
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
    voiceStateHydratedRef.current = false;
    voiceAutoFinalizeRef.current = false;
    closeoutPromptSentRef.current = false;

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
            clearInterviewVoiceState();
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
    if (isOpen) return;
    setIsGeneratingDiagnosis(false);
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
        if (isGeneratingDiagnosis || isFinalizingCall) return;
        event.preventDefault();
        onClose();
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
  }, [isOpen, onClose, isGeneratingDiagnosis, isFinalizingCall]);

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

  useEffect(() => {
    if (!isOpen || !isClosingWindow || closeoutPromptSentRef.current) return;
    closeoutPromptSentRef.current = true;
    sendVoiceEvent({
      type: 'session.update',
      session: {
        instructions: [
          'Entraste en ventana final de cierre.',
          'No abras temas nuevos.',
          'Cierra con síntesis ejecutiva y una última pregunta de confirmación solo si es indispensable.',
          'Comienza el cierre con <<CALL_COMPLETE>> apenas tengas claridad suficiente.',
        ].join(' '),
      },
    });
    sendVoiceEvent({
      type: 'response.create',
      response: {
        output_modalities: ['audio'],
        instructions:
          'Empieza a cerrar ahora. Sintetiza los hallazgos principales, valida el punto más crítico si hace falta y no abras líneas nuevas.',
      },
    });
  }, [isOpen, isClosingWindow]);

  // Auto-finalize on agent completion signal
  useEffect(() => {
    const normalized = voiceAgentTranscript.toUpperCase();
    if (!voiceConnected) return;
    if (!normalized.includes('<<CALL_COMPLETE>>')) return;
    void finalizeCallAndGenerateReport('agent');
  }, [voiceAgentTranscript, voiceConnected]);

  // Prime voice session on connect
  useEffect(() => {
    if (!isOpen || !voiceConnected) return;
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

  const interviewContextSummary = summarizeVoiceInterviewContext(intake, transcriptEntries);
  const voiceKnowledgePacket = buildVoiceKnowledgePacket(intake, transcriptEntries);
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
      value: voiceReport ? 'Informe listo' : awaitingSummaryValidation ? 'Validación pendiente' : isClosingWindow ? 'Ventana final' : 'Exploración abierta',
      tone: isClosingWindow ? 'is-closing' : voiceReport ? 'is-done' : '',
    },
  ];
  const workspaceCoachNote = awaitingSummaryValidation
    ? 'Valida o corrige este bloque antes de abrir una línea nueva.'
    : voiceConnected
    ? 'Habla directo, concreto y con ejemplos reales. El sistema ya tiene el contexto base.'
    : hasEverStartedVoiceCall
    ? 'Puedes retomar la llamada en el punto exacto donde quedó.'
    : 'Activa micrófono y parte con una conversación corta, precisa y ejecutiva.';

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
    closeoutPromptSentRef.current = false;
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
    const startingFocus = question || `Explora el bloque ${currentBlockLabel.toLowerCase()} usando el contexto disponible y entra por la señal más relevante.`;
    if (options?.resetTranscript !== false) {
      setVoiceAgentTranscript('');
      setVoiceUserTranscript('');
      setVoicePartialTranscript('');
    }
    sendVoiceEvent({
      type: 'session.update',
      session: {
        instructions: [
          'Eres un entrevistador financiero senior, sobrio, relajado y muy claro.',
          'Habla en español chileno natural. Usa tú; no voseo ni entonación rioplatense.',
          'Haz una sola pregunta a la vez y profundiza con precisión quirúrgica.',
          'No expliques el sistema.',
          `La llamada dura máximo ${INTERVIEW_TOTAL_LIMIT_MINUTES} minutos y debes empezar a cerrar ${INTERVIEW_CLOSEOUT_BUFFER_SEC} segundos antes.`,
          'Prioriza fricciones reales, inconsistencias, liquidez, deuda, uso de productos, metas y capacidad de ejecución.',
          'Si detectas tensión o incoherencia, conviértela en una pregunta de alto valor.',
          'Cada pocos turnos entrega una microlectura útil en una frase.',
          interviewContextSummary
            ? `Contexto financiero consolidado: ${interviewContextSummary}. Usa esto para preguntar con foco.`
            : '',
          voiceKnowledgePacket
            ? `Brief estrategico del usuario:\n${voiceKnowledgePacket}`
            : '',
          'Si ya tienes información suficiente, inicia tu cierre con <<CALL_COMPLETE>>, no abras temas nuevos y resume el porqué en 2 frases.',
          `Foco inicial de la conversación: ${startingFocus}`,
        ].join(' '),
      },
    });
    sendVoiceEvent({
      type: 'response.create',
      response: {
        output_modalities: ['audio'],
        instructions: `Inicia la conversación desde el foco definido, usa toda la ficha del usuario, evita sonar argentino, habla como chileno natural, profundiza con criterio senior y deja insights útiles durante la conversación: ${startingFocus}`,
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
    if (!voiceSupported || voiceConnecting || voiceConnected) return;
    if (voiceCallExhausted) {
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
    setIsGeneratingDiagnosis(true);
    cleanupVoiceSession();
    try {
      const latestTranscript = voiceTranscriptRef.current;
      const rawTranscript = [
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
      const interviewFlowFallback = [
        currentQuestion ? `ULTIMA_PREGUNTA_PLANIFICADA:\n${currentQuestion}` : '',
        currentSummary ? `RESUMEN_ACTIVO:\n${currentSummary}` : '',
        interviewTranscriptSnapshot ? `HISTORIAL_ENTREVISTA:\n${interviewTranscriptSnapshot}` : '',
        voiceKnowledgePacket ? `CONTEXTO_USUARIO:\n${voiceKnowledgePacket}` : '',
        'NOTA: si la transcripción de audio es parcial, igual debes consolidar diagnóstico con el contexto estructurado disponible.',
      ]
        .filter(Boolean)
        .join('\n\n')
        .trim();
      const finalTranscript = [rawTranscript, persistedTranscript, interviewFlowFallback]
        .filter((item) => String(item || '').trim().length > 0)
        .join('\n\n')
        .trim();
      const safeTranscript =
        finalTranscript.length >= 10
          ? finalTranscript
          : [
              'TRANSCRIPCION_MINIMA:',
              'La llamada finalizó antes de consolidar suficiente audio limpio.',
              interviewFlowFallback || 'Se debe diagnosticar con intake y contexto estructurado disponible.',
            ]
              .filter(Boolean)
              .join('\n');

      let result: Awaited<ReturnType<typeof finalizeInterviewVoiceCall>> | null = null;
      let lastError: unknown = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          result = await finalizeInterviewVoiceCall({
            intake,
            transcript: safeTranscript,
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
      clearInterviewVoiceState();
      onClose();
      router.push('/diagnosis');
    } catch (error) {
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

  async function useVoiceTranscriptAsAnswer() {
    const clean = (voiceUserTranscript || voicePartialTranscript).trim();
    if (!clean || !blockId || awaitingSummaryValidation) return;

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

  const isLoading = !intakeReady || !intake || !lastResponse;

  return (
    <div
      className="agent-modal-overlay interview-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Entrevista estratégica"
      onClick={isGeneratingDiagnosis ? undefined : onClose}
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
            text="Generando diagnostico"
            subtitle="Estamos consolidando el diagnostico profesional con toda la evidencia disponible."
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
            onClick={onClose}
            aria-label="Cerrar entrevista"
          >
            ×
          </button>
        </div>

        <p className="agent-modal-intro interview-modal-intro">
          Llamada breve con contexto integrado de presupuesto y productos para convertir señales dispersas en diagnóstico ejecutivo.
        </p>

        {isLoading ? (
          <div className="interview-modal-loading">
            <span>Cargando sesión…</span>
          </div>
        ) : (
          <div className="interview-shell pro-interview-shell interview-modal-body">
            <div className="interview-stage-shell">
              <aside className="interview-panel-surface interview-panel-surface--sidebar">
                <div className="interview-brief-card">
                  <div className="interview-brief-top">
                    <div>
                      <span className="interview-surface-eyebrow">Session brief</span>
                      <h4>Entrevista premium guiada</h4>
                    </div>
                    <span className={`interview-brief-status${voiceConnected ? ' is-live' : voiceReport ? ' is-done' : ''}`}>
                      {voiceConnected ? 'Live' : voiceReport ? 'Done' : stageLabel}
                    </span>
                  </div>
                  <p>
                    {awaitingSummaryValidation
                      ? 'Se consolidó un bloque y ahora toca validar precisión antes de seguir.'
                      : voiceConnected
                      ? 'La sesión está activa. Mantén foco en señales concretas, no en explicación general.'
                      : 'La capa de entrevista toma contexto previo y lo convierte en lectura ejecutiva accionable.'}
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
                  <span className="interview-surface-eyebrow">Session rail</span>
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
              <section className="voice-call-shell interview-live-shell">
                <div className="voice-call-topbar">
                  <div>
                    <span className="voice-call-label">Voice diagnostic session</span>
                    <h1>Entrevista estratégica en tiempo real</h1>
                    <p className="voice-call-subtitle">
                      {awaitingSummaryValidation
                        ? 'Validación de bloque antes de seguir'
                        : voiceReport
                        ? 'Diagnóstico listo para lectura completa'
                        : 'Modo entrevista premium con contexto financiero vivo'}
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

                <div className="voice-call-transcript-card">
                  <span className="voice-call-transcript-label">
                    {awaitingSummaryValidation ? 'Resumen del bloque' : 'Foco de conversación'}
                  </span>
                  <p>
                    {awaitingSummaryValidation
                      ? currentSummary
                      : `Bloque activo: ${currentBlockLabel}. La llamada parte desde contexto real, no desde una pregunta fija.`}
                  </p>
                  <small className="interview-inline-note">{workspaceCoachNote}</small>
                </div>

                {awaitingSummaryValidation ? (
                  <div className="voice-call-transcript-card">
                    <span className="voice-call-transcript-label">Validación</span>
                    <textarea
                      className="agent-textarea"
                      rows={3}
                      value={summaryComment}
                      onChange={(event) => setSummaryComment(event.target.value)}
                      placeholder="Si falta algo, escríbelo aquí para que la siguiente repregunta sea precisa."
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
                    className="summary-action-btn"
                    onClick={activateMicrophone}
                    disabled={!voiceSupported || voiceConnecting || voiceConnected || voiceInterviewLocked || awaitingSummaryValidation}
                  >
                    {microphoneReady ? 'Micrófono activo' : 'Activar micrófono'}
                  </button>
                  <button
                    type="button"
                    className="summary-action-btn summary-action-accept"
                    onClick={() => void startVoiceSession()}
                    disabled={
                      !voiceSupported ||
                      voiceConnecting ||
                      voiceConnected ||
                      isFinalizingCall ||
                      (!voiceConnected && voiceCallExhausted) ||
                      (!voiceConnected && voiceInterviewLocked && !hasLiveVoiceCall) ||
                      awaitingSummaryValidation
                    }
                  >
                    {voiceConnecting
                      ? 'Conectando llamada…'
                      : hasCompletedVoiceInterview
                      ? 'Diagnóstico listo'
                      : voiceConnected
                      ? 'Llamada activa'
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
                    disabled={!voiceConnected || Boolean(voiceReport) || (pauseUsed && !voicePaused) || awaitingSummaryValidation}
                    title={pauseUsed ? 'Ya usaste la pausa única de esta llamada' : 'Pausar una vez'}
                  >
                    {voicePaused ? 'Reanudar' : pauseUsed ? 'Pausa usada' : 'Pausar (1 vez)'}
                  </button>
                </div>

                <div className="voice-call-actions interview-call-actions interview-call-actions--secondary">
                  {(voiceUserTranscript || voicePartialTranscript) && blockId && !awaitingSummaryValidation ? (
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
                      disabled={isFinalizingCall || Boolean(voiceReport) || awaitingSummaryValidation}
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

                {voiceError ? <p className="voice-call-error interview-call-error-banner">{voiceError}</p> : null}

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
                <section className="voice-call-shell diagnosis-ready-shell">
                  <div className="voice-call-topbar">
                    <div>
                      <span className="voice-call-brand">Financieramente</span>
                      <span className="voice-call-label">Informe ejecutivo</span>
                      <h1>Diagnóstico de la llamada</h1>
                      <span className="voice-call-subtitle">Cierre consolidado de la entrevista senior</span>
                    </div>
                    <div className="voice-call-status">
                      <span className="voice-call-status-dot" />
                      Diagnóstico listo
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
          </div>
        )}
      </div>
      )}
    </div>
  );
}
