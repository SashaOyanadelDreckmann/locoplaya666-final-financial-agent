'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { useInterviewStore } from '@/state/interview.store';
import { useProfileStore } from '@/state/profile.store';

import { syncDiagnosisSession } from '@/lib/diagnosis-session';
import { getSessionInfo, nextConversationStep } from '@/lib/api';
import { ApiHttpError } from '@/lib/apiEnvelope';
import { toUserFacingError } from '@/lib/userError';
import {
  buildInterviewContextHighlights,
  formatBlockLabel,
  type InterviewVoiceSnapshot,
} from './interview-modal.context';
import {
  InterviewModalBootError,
  InterviewModalLoader,
  InterviewVoiceSummaryBlock,
} from './interview-modal.components';
import { resolveInterviewModalLoadingState } from './interview-modal.helpers';
import { InterviewDiagnosisPanel } from './InterviewDiagnosisPanel';
import { type InterviewIntakeWithContext } from './interview-modal.hydration';
import { formatInterviewClock } from './interview-modal.voice-summary';
import { useInterviewVoiceRuntime } from './useInterviewVoiceRuntime';
import { useInterviewModalBootstrap } from './useInterviewModalBootstrap';
import { useInterviewModalA11y } from './useInterviewModalA11y';
import { INTERVIEW_TOTAL_LIMIT_SEC } from '@financial-agent/shared';

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

  const profile = useProfileStore((s) => s.profile);
  const profileLoading = useProfileStore((s) => s.loading);
  const profileError = useProfileStore((s) => s.error);
  const hasDiagnosis = useProfileStore((s) => s.hasDiagnosis);
  const { setProfile, refreshProfile } = useProfileStore();
  const [intakeReady, setIntakeReady] = useState(false);
  const [summaryComment, setSummaryComment] = useState('');
  const [summarySubmitting, setSummarySubmitting] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [sessionAlreadyCompleted, setSessionAlreadyCompleted] = useState(false);
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);

  const currentQuestion =
    lastResponse?.type === 'question' && typeof lastResponse.question === 'string'
      ? lastResponse.question
      : '';
  const currentSummary =
    lastResponse?.type === 'block_summary' && typeof lastResponse.summary === 'string'
      ? lastResponse.summary
      : '';
  const awaitingSummaryValidation = Boolean(currentSummary);
  const interviewTranscriptSnapshot = transcriptEntries
    .filter((entry) => entry?.answer && String(entry.answer).trim())
    .map((entry) => `USUARIO [${entry.blockId}]: ${String(entry.answer).trim()}`)
    .join('\n')
    .trim();

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
    startOrResumeVoiceSession,
    toggleCallPause,
    retryDiagnosisGeneration,
    applyLatestVoiceSummaryAsAnswer,
    voiceSupported,
  } = voice;

  const canDismissOverlay = !blockVoiceInteraction;
  const handleOverlayDismiss = useCallback(() => {
    if (!canDismissOverlay) return;
    onClose();
  }, [canDismissOverlay, onClose]);

  useInterviewModalBootstrap({
    isOpen,
    bootstrapAttempt,
    intake: intake as InterviewIntakeWithContext | null,
    transcriptEntries,
    interviewTranscriptSnapshot,
    completedBlocks: completedBlocks as Record<string, unknown>,
    currentQuestion,
    bootedRef,
    handleUnauthorized,
    setIntake,
    setBootError,
    setIntakeReady,
    setSessionAlreadyCompleted,
    setSummaryComment,
    setSummarySubmitting,
    resetVoiceRuntimeState,
    applyHydratedVoiceState,
    setSessionAlreadyCompletedVoice,
    setLatestDiagnosticProfileId,
    setResponse,
    onDiagnosisOnlyOpen: () => {
      void syncDiagnosisSession();
    },
  });

  useInterviewModalA11y({
    isOpen,
    modalRef,
    closeButtonRef,
    restoreFocusRef,
    canDismissOverlay,
    onDismiss: handleOverlayDismiss,
    isGeneratingDiagnosis,
    isFinalizingCall,
    voiceConnecting,
    voiceConnected,
    voicePaused,
  });

  const showVoiceReport = Boolean(voiceReport?.executive_report);
  const isDiagnosisMode =
    !isGeneratingDiagnosis &&
    !isFinalizingCall &&
    (sessionAlreadyCompleted || showVoiceReport || hasDiagnosis);

  useEffect(() => {
    if (!isOpen || !isDiagnosisMode || profile || profileLoading) return;
    void refreshProfile();
  }, [isDiagnosisMode, isOpen, profile, profileLoading, refreshProfile]);

  const handleRetryBootstrap = useCallback(() => {
    setBootError(null);
    setBootstrapAttempt((attempt) => attempt + 1);
  }, []);

  const isLoading = resolveInterviewModalLoadingState({
    intakeReady,
    hasIntake: Boolean(intake),
    bootError,
    sessionAlreadyCompleted,
    hasDiagnosis,
  });

  if (!isOpen) return null;

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
  const callStateLabel = voiceReport
    ? 'Diagnóstico consolidado'
    : isFinalizingCall || isGeneratingDiagnosis
      ? 'Cerrando entrevista'
      : voiceConnected && voicePaused
        ? 'Entrevista en pausa'
        : voiceConnected
          ? 'Entrevista en vivo'
          : voiceFlags.voiceCallExhausted
            ? 'Entrevista cerrada'
            : voiceFlags.hasEverStartedVoiceCall
              ? 'Entrevista pausada'
              : 'Lista para iniciar';
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
      value: callStateLabel,
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
      ? 'El diagnóstico se genera solo al cerrar la entrevista. Puedes pausar o cerrar el modal cuando quieras y retomar con el contexto guardado.'
      : voiceFlags.voiceCallExhausted && (isFinalizingCall || isGeneratingDiagnosis)
        ? 'Entrevista finalizada. Estamos consolidando tu diagnóstico automáticamente.'
      : voiceFlags.hasEverStartedVoiceCall
        ? 'Puedes retomar la llamada donde quedó. El progreso y las síntesis siguen guardados.'
        : 'Inicia la llamada para una entrevista ejecutiva breve. El diagnóstico se entrega al terminar el tiempo o el cierre del entrevistador.';

  const callProgressPct = Math.max(
    0,
    Math.min(100, Math.round((callSeconds / Math.max(1, INTERVIEW_TOTAL_LIMIT_SEC)) * 100)),
  );
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

  const callStateDescription = voiceReport
    ? 'El informe ya está consolidado y puedes revisar el diagnóstico final.'
    : isFinalizingCall || isGeneratingDiagnosis
      ? 'Estamos cerrando la llamada y consolidando el diagnóstico con la evidencia disponible.'
      : voiceConnected && voicePaused
        ? 'La llamada quedó en pausa y puedes retomarla sin perder contexto.'
        : voiceConnected
          ? 'La entrevista está activa y continúa con contexto integrado.'
          : voiceFlags.voiceCallExhausted
            ? 'La entrevista terminó y el diagnóstico se está consolidando o ya quedó listo.'
            : voiceFlags.hasEverStartedVoiceCall
              ? 'La llamada puede retomarse cuando quieras, sin reiniciar el contexto.'
              : 'Aún estamos preparando la sesión y cargando el contexto inicial.';

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

  const modalTitle = isDiagnosisMode ? 'Diagnóstico financiero' : 'Entrevista estratégica';
  const modalEyebrow = isDiagnosisMode ? 'Diagnóstico final' : 'Financieramente';
  const modalIntro = isDiagnosisMode
    ? 'Tu entrevista quedó consolidada en un informe accionable. Revisa el diagnóstico, expórtalo o profundízalo en chat.'
    : 'Llamada breve con contexto integrado de presupuesto y productos. El diagnóstico se genera automáticamente al terminar la entrevista; no hace falta finalizarla manualmente.';
  const voiceFocusHint = currentQuestion
    ? currentQuestion
    : `Explorar ${currentBlockLabel.toLowerCase()} con el contexto financiero disponible.`;

  const showBootstrapLoader = isLoading;
  const showGeneratingLoader = isGeneratingDiagnosis;

  return (
    <div
      className="agent-modal-overlay interview-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onClick={canDismissOverlay ? handleOverlayDismiss : undefined}
    >
      {showGeneratingLoader || showBootstrapLoader ? (
        <div
          className="agent-modal interview-modal interview-modal--generating"
          ref={modalRef}
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {showGeneratingLoader ? (
            <InterviewModalLoader
              title="Generando diagnóstico final"
              subtitle="Estamos consolidando el diagnóstico profesional con toda la evidencia disponible."
            />
          ) : (
            <InterviewModalLoader
              animateSteps
              note="Si el perfil tarda unos segundos, es normal: estamos cruzando intake, productos y presupuesto."
            />
          )}
        </div>
      ) : (
        <div
          className={`agent-modal interview-modal${isDiagnosisMode ? ' interview-modal--diagnosis' : ''}`}
          ref={modalRef}
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="bcc-modal-header interview-modal-header">
            <div className="bcc-modal-title-wrap">
              <span className="bcc-modal-eyebrow">{modalEyebrow}</span>
              <h3 id={titleId} className="bcc-modal-title">
                {modalTitle}
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
                ? voiceConnected && voicePaused
                  ? 'Cerrar entrevista en pausa'
                  : voiceConnected
                    ? 'Cerrar y guardar progreso'
                    : 'Cerrar entrevista'
                : 'Cerrar bloqueado mientras la llamada se conecta o cierra'
            }
            >
              ×
            </button>
          </div>

          <p id={descriptionId} className="agent-modal-intro interview-modal-intro">
            {modalIntro}
          </p>

          <p className="sr-only" aria-live="polite" aria-atomic="true">
            {voiceStatusAnnouncement}
          </p>

          {syncError ? (
            <div className="interview-sync-error-toast" role="status" aria-live="polite">
              {syncError}
            </div>
          ) : null}

          {bootError && !intake ? (
            <InterviewModalBootError
              message={bootError}
              onRetry={handleRetryBootstrap}
              onClose={handleOverlayDismiss}
              retrying={!intakeReady}
            />
          ) : isDiagnosisMode ? (
            profile ? (
              <InterviewDiagnosisPanel
                profile={profile}
                voiceReport={voiceReport}
                onClose={handleOverlayDismiss}
              />
            ) : profileError ? (
              <div className="interview-modal-completed">
                <div className="voice-call-transcript-card">
                  <span className="voice-call-transcript-label">No se pudo cargar el diagnóstico</span>
                  <p>{profileError}</p>
                  <p className="interview-inline-note">
                    La entrevista quedó consolidada, pero este panel no pudo cargar el detalle completo en este momento.
                  </p>
                </div>
                <div className="voice-call-actions">
                  <button
                    type="button"
                    className="summary-action-btn summary-action-accept"
                    onClick={() => void refreshProfile()}
                    disabled={profileLoading}
                  >
                    {profileLoading ? 'Reintentando…' : 'Reintentar carga'}
                  </button>
                  <button
                    type="button"
                    className="summary-action-btn"
                    onClick={() => {
                      handleOverlayDismiss();
                      router.push('/diagnosis');
                    }}
                  >
                    Abrir informe completo
                  </button>
                  <button type="button" className="summary-action-btn" onClick={handleOverlayDismiss}>
                    Cerrar
                  </button>
                </div>
              </div>
            ) : (
              <div className="interview-modal-loading">
                <InterviewModalLoader
                  title={profileLoading ? 'Cargando diagnóstico' : 'Preparando informe'}
                  subtitle={
                    profileLoading
                      ? 'Esto suele durar unos segundos mientras traemos el perfil consolidado.'
                      : 'Estamos ensamblando la vista ejecutiva del diagnóstico final.'
                  }
                />
              </div>
            )
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
                        {voiceConnected ? 'En vivo' : voiceReport ? 'Listo' : callStateLabel}
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
                      <strong>{voicePaused ? 'Activa' : voiceConnected ? 'Lista' : '—'}</strong>
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
                            : callStateLabel}
                      </div>
                    </div>

                    <div className="voice-call-transcript-card interview-focus-card">
                      <span className="voice-call-transcript-label">Estado actual</span>
                      <p>{callStateLabel}</p>
                      <small className="interview-inline-note">{callStateDescription}</small>
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
                          !intakeReady ||
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
                                ? 'Entrevista cerrada'
                                : voiceFlags.hasEverStartedVoiceCall && voiceFlags.hasRemainingInterviewTime
                                  ? 'Reanudar llamada'
                                  : 'Iniciar llamada'}
                      </button>
                      <button
                        type="button"
                        className="summary-action-btn"
                        onClick={toggleCallPause}
                        disabled={!voiceConnected || showVoiceReport}
                        title={voicePaused ? 'Reanudar la llamada' : 'Pausar la llamada'}
                      >
                        {voicePaused ? 'Reanudar' : 'Pausar'}
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
                        Pausa: {voicePaused ? 'activa' : voiceConnected ? 'disponible' : '—'}
                      </span>
                      <span className="voice-call-pill">
                        Restante: {formatInterviewClock(remainingTotalSec)}
                      </span>
                      <span className="voice-call-pill">Hasta 3 min activos</span>
                    </div>

                    {voiceError ? (
                      <div className="interview-call-error-panel">
                        <p className="voice-call-error interview-call-error-banner">{voiceError}</p>
                        <p className="interview-inline-note">
                          {voiceConnected
                            ? 'La llamada sigue viva: este error suele ser recuperable.'
                            : voiceFlags.voiceInterviewLocked || voiceFlags.voiceCallExhausted
                              ? 'Este estado es terminal para la llamada actual.'
                              : 'Puedes reintentar cuando el contexto termine de estabilizarse.'}
                        </p>
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

                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
