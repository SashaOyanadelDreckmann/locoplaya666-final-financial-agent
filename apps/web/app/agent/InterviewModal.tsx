'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { useInterviewStore } from '@/state/interview.store';
import { useProfileStore } from '@/state/profile.store';

import { getSessionInfo, nextConversationStep } from '@/lib/api';
import { ApiHttpError } from '@/lib/apiEnvelope';
import { toUserFacingError } from '@/lib/userError';
import { AiLoader } from '@/components/ui/ai-loader';
import { readInterviewVoiceState } from '@/lib/interviewVoiceState';
import {
  buildInterviewContextHighlights,
  formatBlockLabel,
  type InterviewVoiceSnapshot,
} from './interview-modal.context';
import { InterviewVoiceReportBlock, InterviewVoiceSummaryBlock } from './interview-modal.components';
import {
  deriveHydratedVoiceState,
  mergeInterviewIntake,
  mergeInterviewVoiceSnapshots,
  type InterviewIntakeWithContext,
} from './interview-modal.hydration';
import { formatInterviewClock } from './interview-modal.voice-summary';
import { useInterviewVoiceRuntime } from './useInterviewVoiceRuntime';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onDiagnosisComplete?: () => void;
};

export function InterviewModal({ isOpen, onClose, onDiagnosisComplete }: Props) {
  const router = useRouter();
  const bootedRef = useRef(false);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const titleId = 'interview-modal-title';
  const descriptionId = 'interview-modal-description';

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
  const [intakeReady, setIntakeReady] = useState(false);
  const [summaryComment, setSummaryComment] = useState('');
  const [summarySubmitting, setSummarySubmitting] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [sessionAlreadyCompleted, setSessionAlreadyCompleted] = useState(false);

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

  const handleUnauthorized = useCallback(
    (error: unknown) => {
      if (error instanceof ApiHttpError && error.status === 401) {
        router.replace('/login');
        return true;
      }
      return false;
    },
    [router],
  );

  const blockId = lastResponse?.blockId;
  const answersInBlock = blockId ? (answersByBlock[blockId] ?? []) : [];
  const currentBlockLabel = formatBlockLabel(blockId);

  const voice = useInterviewVoiceRuntime({
    isOpen,
    intake: intake as InterviewIntakeWithContext | null,
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
    onBootError: setBootError,
  });

  const {
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
    isFinalizingCall,
    voiceReport,
    isGeneratingDiagnosis,
    canRetryDiagnosis,
    syncError,
    voiceFlags,
    blockVoiceInteraction,
    resetVoiceRuntimeState,
    applyHydratedVoiceState,
    setLatestDiagnosticProfileId,
    setSessionAlreadyCompletedVoice,
    cleanupVoiceSession,
    startOrResumeVoiceSession,
    toggleCallPause,
    retryDiagnosisGeneration,
    applyLatestVoiceSummaryAsAnswer,
    voiceSupported,
  } = voice;

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
    setSummaryComment('');
    setSummarySubmitting(false);
    resetVoiceRuntimeState();

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

        const mergedIntake = mergeInterviewIntake(
          intake as InterviewIntakeWithContext | null,
          sessionIntake && typeof sessionIntake === 'object'
            ? (sessionIntake as Record<string, unknown>)
            : null,
          (productsContext as Record<string, unknown> | null | undefined) ?? null,
          (budgetContext as Record<string, unknown> | null | undefined) ?? null,
        );

        if (!cancelled && mergedIntake) {
          setIntake(mergedIntake);
        } else if (!cancelled && !intake && !sessionIntake) {
          setBootError(
            'No se encontró información de perfil. Completa el cuestionario de intake para iniciar la entrevista.',
          );
          return;
        }

        if (!cancelled) {
          const saved = readInterviewVoiceState();
          const localSaved = saved && typeof saved === 'object' ? (saved as InterviewVoiceSnapshot) : null;
          const snapshot = mergeInterviewVoiceSnapshots(localSaved, sessionVoice);
          const hydrated = deriveHydratedVoiceState({ snapshot, sessionDiagnosticProfileId });

          if (hydrated.sessionAlreadyCompleted) {
            setSessionAlreadyCompleted(true);
            if (hydrated.voiceReport) setSessionAlreadyCompletedVoice(hydrated.voiceReport);
            if (hydrated.latestDiagnosticProfileId) setLatestDiagnosticProfileId(hydrated.latestDiagnosticProfileId);
            return;
          }

          applyHydratedVoiceState(hydrated);
          if (hydrated.latestDiagnosticProfileId) {
            setLatestDiagnosticProfileId(hydrated.latestDiagnosticProfileId);
          }
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
    handleUnauthorized,
  ]);

  useEffect(() => {
    if (!isOpen || voiceFlags.voiceInterviewLocked || lastResponse?.type !== 'block_completed') return;

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
  }, [
    isOpen,
    lastResponse,
    intake,
    completedBlocks,
    resetBlock,
    setResponse,
    voiceFlags.voiceInterviewLocked,
    interviewTranscriptSnapshot,
    handleUnauthorized,
  ]);

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
        if (isGeneratingDiagnosis || isFinalizingCall || voiceConnecting || (voiceConnected && !voicePaused)) return;
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
  }, [isOpen, onClose, isGeneratingDiagnosis, isFinalizingCall, voiceConnected, voiceConnecting, voicePaused]);

  if (!isOpen) return null;

  const canDismissOverlay = !blockVoiceInteraction;

  function handleOverlayDismiss() {
    if (!canDismissOverlay) return;
    cleanupVoiceSession();
    onClose();
  }

  const stageLabel =
    voiceReport?.executive_report
      ? 'Diagnóstico listo'
      : finalSummary
        ? 'Síntesis lista'
        : voiceFlags.voiceCallExhausted
          ? 'Llamada agotada'
          : voiceConnected && voicePaused
            ? 'Pausada'
            : voiceConnected
              ? 'En llamada'
              : voiceFlags.hasEverStartedVoiceCall
                ? voiceFlags.hasRemainingInterviewTime
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

  const enrichedIntake = intake as InterviewIntakeWithContext | null;
  const productsContext = enrichedIntake?.__productsContext;
  const budgetContext = enrichedIntake?.__budgetContext;
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
  const contextHighlights = buildInterviewContextHighlights(intake, transcriptEntries);
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
      value: voiceReport
        ? 'Informe listo'
        : isFinalizingCall || isGeneratingDiagnosis
          ? 'Diagnóstico en curso'
        : finalSummary
          ? 'Síntesis lista'
          : awaitingSummaryValidation
            ? 'Validación pendiente'
            : voiceFlags.isClosingWindow
              ? 'Cierre automático'
              : 'Exploración abierta',
      tone: voiceFlags.isClosingWindow ? 'is-closing' : voiceReport || finalSummary ? 'is-done' : '',
    },
  ];
  const workspaceCoachNote = awaitingSummaryValidation
    ? 'Puedes validar el bloque en paralelo. La llamada sigue disponible.'
    : voiceConnected && voicePaused
      ? 'Llamada en pausa. Tu progreso y síntesis quedaron guardados; puedes cerrar el modal y retomar después.'
    : voiceConnected && voiceFlags.isClosingWindow
      ? 'Cierre de entrevista en curso. El diagnóstico se generará automáticamente al terminar.'
    : voiceConnected
      ? 'El diagnóstico se genera solo al cerrar la entrevista. Puedes pausar una vez y retomar con el contexto guardado.'
      : voiceFlags.voiceCallExhausted && (isFinalizingCall || isGeneratingDiagnosis)
        ? 'Entrevista finalizada. Estamos consolidando tu diagnóstico automáticamente.'
      : voiceFlags.hasEverStartedVoiceCall
        ? 'Puedes retomar la llamada donde quedó. El progreso y las síntesis siguen guardados.'
        : 'Inicia la llamada para una entrevista ejecutiva breve. El diagnóstico se entrega al terminar el tiempo o el cierre del entrevistador.';

  const callProgressPct = Math.max(0, Math.min(100, Math.round((callSeconds / Math.max(1, maxCallDurationSec)) * 100)));
  const voiceStatusAnnouncement = voiceConnecting
    ? 'Conectando llamada'
    : voiceConnected
      ? voicePaused
        ? 'Llamada en pausa'
        : voiceListening
          ? 'Te escucho'
          : voiceSpeaking
            ? 'Entrevistador hablando'
            : 'Conversación activa'
      : stageLabel;

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
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
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
              <h3 id={titleId} className="bcc-modal-title">
                Entrevista estratégica
              </h3>
            </div>
            <button
              type="button"
              className="agent-modal-close"
              ref={closeButtonRef}
              onClick={canDismissOverlay ? handleOverlayDismiss : undefined}
              disabled={!canDismissOverlay}
              aria-label={
              canDismissOverlay
                ? voicePaused
                  ? 'Cerrar entrevista en pausa'
                  : 'Cerrar entrevista'
                : 'Cerrar bloqueado mientras la llamada está activa'
            }
            >
              ×
            </button>
          </div>

          <p id={descriptionId} className="agent-modal-intro interview-modal-intro">
            Llamada breve con contexto integrado de presupuesto y productos. El diagnóstico se genera automáticamente
            al terminar la entrevista; no hace falta finalizarla manualmente.
          </p>

          <p className="sr-only" aria-live="polite" aria-atomic="true">
            {voiceStatusAnnouncement}
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
                      <span
                        className={`interview-brief-status${voiceConnected ? ' is-live' : voiceReport ? ' is-done' : ''}`}
                      >
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
                      <span className="interview-brief-tag">
                        {completedBlockCount} bloque{completedBlockCount === 1 ? '' : 's'} cerrado
                        {completedBlockCount === 1 ? '' : 's'}
                      </span>
                      <span className="interview-brief-tag">Tiempo {callTimeLabel}</span>
                    </div>
                  </div>

                  <div className="interview-metrics-grid">
                    <article className="interview-metric-card">
                      <span>Tiempo restante</span>
                      <strong>{formatInterviewClock(remainingTotalSec)}</strong>
                    </article>
                    <article className="interview-metric-card">
                      <span>Balance base</span>
                      <strong>
                        {budgetRowsCount > 0
                          ? `${budgetBalance >= 0 ? '+' : ''}${budgetBalance.toLocaleString('es-CL')}`
                          : '—'}
                      </strong>
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
                          {voiceFlags.voiceCallExhausted && !showVoiceReport
                            ? isFinalizingCall || isGeneratingDiagnosis
                              ? 'Entrevista finalizada — generando diagnóstico automáticamente'
                              : 'Tiempo agotado — preparando cierre y diagnóstico automático'
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

                    {bootError ? <p className="voice-call-error interview-call-error-banner">{bootError}</p> : null}

                    <div
                      className="voice-call-progress"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={callProgressPct}
                      aria-label="Progreso de la llamada"
                    >
                      <span style={{ width: `${callProgressPct}%` }} />
                    </div>

                    <div className="voice-call-context">
                      {intakeSnapshot.map((item) => (
                        <span key={item} className="voice-call-pill">
                          {item}
                        </span>
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
                          (!voiceConnected && voiceFlags.voiceCallExhausted && !voiceFlags.hasLiveVoiceCall) ||
                          (!voiceConnected && voiceFlags.voiceInterviewLocked && !voiceFlags.hasLiveVoiceCall)
                        }
                      >
                        {voiceConnecting
                          ? 'Conectando llamada…'
                          : showVoiceReport
                            ? 'Diagnóstico listo'
                            : voiceConnected
                              ? 'Llamada activa'
                              : voiceFlags.voiceCallExhausted && !showVoiceReport
                                ? 'Tiempo agotado'
                                : voiceFlags.hasEverStartedVoiceCall && voiceFlags.hasRemainingInterviewTime
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

                    {voiceConnected && !voicePaused ? (
                      <div className="voice-call-transcript-card interview-flow-notice">
                        <span className="voice-call-transcript-label">Flujo de cierre</span>
                        <p>
                          La entrevista cierra sola al terminar el tiempo o cuando el entrevistador concluye. El
                          diagnóstico se genera en ese momento, sin pasos manuales.
                        </p>
                      </div>
                    ) : null}

                    <div className="voice-call-actions interview-call-actions interview-call-actions--secondary">
                      {awaitingSummaryValidation && (minuteSummaries.length > 0 || finalSummary) && blockId ? (
                        <button
                          type="button"
                          className="summary-action-btn summary-action-reject"
                          onClick={() => void applyLatestVoiceSummaryAsAnswer()}
                        >
                          Usar síntesis en bloque
                        </button>
                      ) : null}
                    </div>

                    <div className="voice-call-context interview-call-meta">
                      <span className="voice-call-pill">
                        Tiempo {callTimeLabel} / {maxCallTimeLabel}
                      </span>
                      <span className="voice-call-pill">
                        Pausa: {pauseUsed ? (voicePaused ? 'en uso' : 'usada') : 'disponible'}
                      </span>
                      <span className="voice-call-pill">
                        Restante: {formatInterviewClock(remainingTotalSec)}
                      </span>
                      <span className="voice-call-pill">Una sesión por usuario</span>
                    </div>

                    {voiceError ? (
                      <div className="interview-call-error-panel">
                        <p className="voice-call-error interview-call-error-banner">{voiceError}</p>
                        {canRetryDiagnosis ? (
                          <button
                            type="button"
                            className="summary-action-btn summary-action-accept interview-diagnosis-retry-btn"
                            onClick={() => void retryDiagnosisGeneration()}
                            disabled={isFinalizingCall || isGeneratingDiagnosis}
                          >
                            {isFinalizingCall || isGeneratingDiagnosis
                              ? 'Reintentando diagnóstico…'
                              : 'Reintentar diagnóstico'}
                          </button>
                        ) : null}
                      </div>
                    ) : null}

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
