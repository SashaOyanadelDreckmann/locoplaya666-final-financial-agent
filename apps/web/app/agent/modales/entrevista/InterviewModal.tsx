'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { useInterviewStore } from '@/state/interview.store';
import { useProfileStore } from '@/state/profile.store';

import { syncDiagnosisSession } from '@/lib/diagnostico/sesion';
import { getSessionInfo } from '@/lib/api/cliente';
import { ApiHttpError } from '@/lib/api/envelope';
import { toUserFacingError } from '@/lib/compartido/userError';
import {
  type InterviewVoiceSnapshot,
} from './interview-modal.context';
import {
  buildInterviewInsightCells,
  resolveInterviewTimeChip,
  resolveInterviewWorkspaceStatus,
} from './interview-modal.presentation';
import { InterviewInsightRail } from './InterviewInsightRail';
import {
  InterviewModalBootError,
  InterviewModalLoader,
} from './interview-modal.components';
import { canEndInterviewCallEarly, resolveInterviewModalLoadingState, resolveInterviewStartBlockedReason } from './interview-modal.helpers';
import { resolveMicrophonePermissionHint } from './interview-modal.voice-session';
import { INTERVIEW_MIN_EARLY_END_SEC } from '@financial-agent/shared';
import { AgentModalCloseButton } from '../comunes/AgentModalCloseButton';
import { InterviewDiagnosisPanel } from './InterviewDiagnosisPanel';
import { type InterviewIntakeWithContext } from './interview-modal.hydration';
import { useInterviewVoiceRuntime } from './useInterviewVoiceRuntime';
import { useInterviewModalBootstrap } from './useInterviewModalBootstrap';
import { useInterviewModalA11y } from './useInterviewModalA11y';
import { useInterviewModalLayout } from './use-interview-modal-layout';
import { INTERVIEW_TOTAL_LIMIT_SEC } from '@financial-agent/shared';
import { InterviewVoiceAura } from './InterviewVoiceAura';
import { resolveInterviewVoiceAuraPhase } from './interview-voice-aura.helpers';

type Props = {
  isOpen: boolean;
  fincoinSpendBlocked?: boolean;
  onClose: () => void;
  onDiagnosisComplete?: () => void;
  onDeepenInChat?: (context?: { voiceFindings?: string[] }) => void;
  deepenInChatDisabled?: boolean;
};

export function InterviewModal({
  isOpen,
  fincoinSpendBlocked,
  onClose,
  onDiagnosisComplete,
  onDeepenInChat,
  deepenInChatDisabled = false,
}: Props) {
  const router = useRouter();
  const { isMobileShell } = useInterviewModalLayout();
  const mobileShellClass = isMobileShell ? ' is-mobile-shell' : '';
  const modalRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const titleId = 'interview-modal-title';
  const descriptionId = 'interview-modal-description';

  const { intake, setIntake } = useInterviewStore();

  const profile = useProfileStore((s) => s.profile);
  const profileLoading = useProfileStore((s) => s.loading);
  const profileError = useProfileStore((s) => s.error);
  const hasDiagnosis = useProfileStore((s) => s.hasDiagnosis);
  const { setProfile, refreshProfile } = useProfileStore();
  const [intakeReady, setIntakeReady] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [sessionAlreadyCompleted, setSessionAlreadyCompleted] = useState(false);
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);

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

  const voice = useInterviewVoiceRuntime({
    isOpen,
    fincoinSpendBlocked,
    intake: intake as InterviewIntakeWithContext | null,
    handleUnauthorized,
    onDiagnosisComplete,
    setProfile,
    onBootError: setBootError,
  });

  const {
    voiceAwaitingMic,
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
    remoteAudioRef,
    voiceCapabilityIssue,
    callsStarted,
    callId,
    voiceSessionReady,
    summaryGenerating,
    resetVoiceRuntimeState,
    applyHydratedVoiceState,
    setLatestDiagnosticProfileId,
    setSessionAlreadyCompletedVoice,
    startOrResumeVoiceSession,
    endCallEarly,
    toggleCallPause,
    retryDiagnosisGeneration,
    voiceSupported,
  } = voice;

  const [confirmEndCall, setConfirmEndCall] = useState(false);

  useEffect(() => {
    if (!isOpen) setConfirmEndCall(false);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !isMobileShell) return;
    document.documentElement.classList.add('interview-modal-open');
    return () => {
      document.documentElement.classList.remove('interview-modal-open');
    };
  }, [isMobileShell, isOpen]);

  const canDismissOverlay = !blockVoiceInteraction;
  const handleOverlayDismiss = useCallback(() => {
    if (!canDismissOverlay) return;
    onClose();
  }, [canDismissOverlay, onClose]);

  useInterviewModalBootstrap({
    isOpen,
    bootstrapAttempt,
    intake: intake as InterviewIntakeWithContext | null,
    handleUnauthorized,
    setIntake,
    setBootError,
    setIntakeReady,
    setSessionAlreadyCompleted,
    resetVoiceRuntimeState,
    applyHydratedVoiceState,
    setSessionAlreadyCompletedVoice,
    setLatestDiagnosticProfileId,
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
    voiceAwaitingMic,
    voiceConnecting,
    voiceConnected,
    voicePaused,
  });

  const showVoiceReport = Boolean(voiceReport?.executive_report);
  const canEndCallEarly =
    voiceFlags.hasEverStartedVoiceCall &&
    canEndInterviewCallEarly(callSeconds) &&
    !showVoiceReport &&
    !isFinalizingCall &&
    !isGeneratingDiagnosis &&
    !voiceFlags.hasCompletedVoiceInterview;

  useEffect(() => {
    if (!canEndCallEarly) setConfirmEndCall(false);
  }, [canEndCallEarly]);

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
  const synthesisCount = minuteSummaries.length;
  const workspaceStatus = resolveInterviewWorkspaceStatus({
    voiceAwaitingMic,
    voiceConnecting,
    voiceConnected,
    voicePaused,
    voiceListening,
    voiceSpeaking,
    voiceFlags,
    isFinalizingCall,
    isGeneratingDiagnosis,
    showVoiceReport,
    stageLabel,
  });
  const timeChip = resolveInterviewTimeChip(callSeconds, remainingTotalSec);
  const latestMinuteSummary = minuteSummaries.at(-1)?.summary ?? null;
  const insightCells = buildInterviewInsightCells({
    intake: intake as InterviewIntakeWithContext | null,
    intakeReady,
    showVoiceReport,
    isFinalizingCall,
    isGeneratingDiagnosis,
    voiceAwaitingMic,
    voiceConnecting,
    voiceConnected,
    voicePaused,
    voiceListening,
    voiceSpeaking,
    voiceSessionReady,
    summaryGenerating,
    syncError,
    voiceFlags,
    callId,
    minuteSummariesCount: synthesisCount,
    latestMinuteSummary,
    hasFinalSummary: Boolean(finalSummary?.summary),
    remainingTotalSec,
  });

  const callProgressPct = Math.max(
    0,
    Math.min(100, Math.round((callSeconds / Math.max(1, INTERVIEW_TOTAL_LIMIT_SEC)) * 100)),
  );
  const earlyEndSecondsRemaining = Math.max(0, INTERVIEW_MIN_EARLY_END_SEC - callSeconds);
  const showInCallControls = voiceConnected && !showVoiceReport && !isFinalizingCall && !isGeneratingDiagnosis;
  const voiceStatusAnnouncement = voiceAwaitingMic
    ? 'Esperando permiso de micrófono'
    : voiceConnecting
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

  const callStateDescription = voiceAwaitingMic
    ? resolveMicrophonePermissionHint()
    : voiceReport
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

  const modalTitle = isDiagnosisMode ? 'Diagnóstico' : 'Entrevista';
  const minimalShellClass = ' interview-modal--minimal';

  const showBootstrapLoader = isLoading;
  const showGeneratingLoader = isGeneratingDiagnosis;
  const startBlockedReason = resolveInterviewStartBlockedReason({
    intakeReady,
    voiceSupported,
    voiceCapabilityIssue,
    voiceAwaitingMic,
    voiceConnecting,
    voiceConnected,
    isFinalizingCall,
    isGeneratingDiagnosis,
    showVoiceReport,
    callsStarted,
    voiceFlags,
  });
  const startButtonDisabled =
    voiceAwaitingMic ||
    voiceConnecting ||
    isFinalizingCall ||
    isGeneratingDiagnosis ||
    voiceConnected;

  const voiceAuraPhase = resolveInterviewVoiceAuraPhase({
    voiceAwaitingMic,
    voiceConnecting,
    voiceConnected,
    voicePaused,
    voiceListening,
    voiceSpeaking,
  });

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
          className={`agent-modal interview-modal interview-modal--generating${minimalShellClass}${mobileShellClass}`}
          data-interview-mobile={isMobileShell ? 'true' : undefined}
          ref={modalRef}
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {showGeneratingLoader ? (
            <InterviewModalLoader
              title="Generando diagnóstico"
              subtitle="Consolidando tu perfil con la evidencia de la llamada."
            />
          ) : (
            <InterviewModalLoader animateSteps subtitle="Cargando contexto para la llamada." />
          )}
        </div>
      ) : (
        <div
          className={`agent-modal interview-modal${isDiagnosisMode ? ' interview-modal--diagnosis' : ''}${minimalShellClass}${mobileShellClass}`}
          data-interview-mobile={isMobileShell ? 'true' : undefined}
          ref={modalRef}
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div
            className={`bcc-modal-header interview-modal-header-layer interview-matte-panel interview-matte-panel--header${!isDiagnosisMode ? ' interview-modal-header-layer--live' : ''}`}
          >
            <div className="bcc-modal-title-wrap">
              <span className="bcc-modal-eyebrow">Financieramente</span>
              <div className={`interview-header-title-band${!isDiagnosisMode ? ' interview-header-title-band--live' : ''}`}>
                <h3 id={titleId} className="bcc-modal-title">
                  {modalTitle}
                </h3>
                {!isDiagnosisMode ? (
                  <div className="interview-header-status-row" aria-label="Estado de la llamada">
                    <div className="voice-call-status interview-header-status-label">
                      <span className="voice-call-status-dot" />
                      {workspaceStatus}
                    </div>
                    <span className="interview-time-chip">{timeChip}</span>
                  </div>
                ) : null}
              </div>
            </div>
            <AgentModalCloseButton
              ref={closeButtonRef}
              onClick={canDismissOverlay ? handleOverlayDismiss : undefined}
              disabled={!canDismissOverlay}
              aria-label={
                canDismissOverlay
                  ? isDiagnosisMode
                    ? 'Cerrar diagnóstico'
                    : voiceConnected && voicePaused
                      ? 'Cerrar entrevista en pausa'
                      : voiceConnected
                        ? 'Cerrar y guardar progreso'
                        : 'Cerrar entrevista'
                  : 'Cerrar bloqueado mientras la llamada se conecta o cierra'
              }
            />
          </div>

          <p id={descriptionId} className="sr-only">
            {isDiagnosisMode ? 'Diagnóstico financiero consolidado.' : 'Entrevista estratégica con contexto integrado.'}
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
                onDeepenInChat={onDeepenInChat}
                deepenDisabled={deepenInChatDisabled}
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
                  <button type="button" className="summary-action-btn" onClick={handleOverlayDismiss}>
                    Cerrar
                  </button>
                </div>
              </div>
            ) : (
              <div className="interview-modal-loading">
                <InterviewModalLoader
                  title={profileLoading ? 'Cargando diagnóstico' : 'Preparando informe'}
                  subtitle={profileLoading ? 'Un momento…' : 'Armando la vista del informe.'}
                />
              </div>
            )
          ) : (
            <div className="interview-shell pro-interview-shell interview-modal-body">
              <div className="interview-stage-shell">
                <div className="interview-column pro-interview-column interview-panel-surface interview-panel-surface--workspace">
                  <section className={`voice-call-shell interview-live-shell interview-live-zones${showVoiceReport ? ' is-hidden-by-report' : ''}`}>
                    <div className="interview-live-zone interview-live-zone--head">
                      <p className="sr-only">{callStateDescription}</p>

                      {bootError ? <p className="voice-call-error interview-call-error-banner">{bootError}</p> : null}

                      {(startBlockedReason || voiceError) && !showInCallControls ? (
                        <div className="interview-call-error-panel interview-call-error-panel--prestart" role="alert">
                          {startBlockedReason ? (
                            <p className="voice-call-error interview-call-error-banner">{startBlockedReason}</p>
                          ) : null}
                          {voiceError ? (
                            <p className="voice-call-error interview-call-error-banner">{voiceError}</p>
                          ) : null}
                        </div>
                      ) : null}

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
                    </div>

                    <div className="interview-live-zone interview-live-zone--center">
                      <InterviewVoiceAura phase={voiceAuraPhase} remoteAudioRef={remoteAudioRef} />
                      <div
                        className={`interview-call-controls interview-call-controls--centered${showInCallControls ? ' is-live' : ' is-idle'}`}
                        aria-label={showInCallControls ? 'Controles de llamada en curso' : 'Iniciar entrevista por voz'}
                      >
                        {showInCallControls ? (
                          <div className="voice-call-actions interview-call-actions interview-call-actions--primary interview-call-actions--live">
                            <button
                              type="button"
                              className={`summary-action-btn interview-call-pause-btn${voicePaused ? ' is-paused' : ''}`}
                              onClick={toggleCallPause}
                              disabled={blockVoiceInteraction}
                              title={voicePaused ? 'Reanudar la llamada' : 'Pausar la llamada'}
                            >
                              {voicePaused ? 'Reanudar llamada' : 'Pausar llamada'}
                            </button>
                            {canEndCallEarly ? (
                              <button
                                type="button"
                                className={`summary-action-btn interview-call-end-btn${confirmEndCall ? ' is-armed' : ''}`}
                                onClick={() => setConfirmEndCall((prev) => !prev)}
                                disabled={blockVoiceInteraction}
                                title="Finalizar la llamada y generar diagnóstico con el avance actual"
                              >
                                {confirmEndCall ? 'Cancelar cierre' : 'Finalizar llamada'}
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="summary-action-btn interview-call-end-btn interview-call-end-btn--pending"
                                disabled
                                aria-disabled="true"
                                title={`Podrás finalizar tras ${INTERVIEW_MIN_EARLY_END_SEC} segundos activos de entrevista`}
                              >
                                Finalizar en {earlyEndSecondsRemaining}s
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="voice-call-actions interview-call-actions interview-call-actions--primary interview-call-actions--idle">
                            <button
                              type="button"
                              className="summary-action-btn summary-action-accept interview-call-start-btn"
                              onClick={() => void startOrResumeVoiceSession()}
                              disabled={startButtonDisabled}
                              aria-disabled={startButtonDisabled || Boolean(startBlockedReason)}
                              title={startBlockedReason ?? undefined}
                            >
                              {voiceAwaitingMic
                                ? 'Activa el micrófono en el navegador…'
                                : voiceConnecting
                                  ? 'Conectando llamada…'
                                  : showVoiceReport
                                    ? 'Diagnóstico listo'
                                    : voiceFlags.voiceCallExhausted && !showVoiceReport
                                      ? 'Entrevista cerrada'
                                      : voiceFlags.hasEverStartedVoiceCall && voiceFlags.hasRemainingInterviewTime
                                        ? 'Reanudar llamada'
                                        : 'Iniciar llamada'}
                            </button>
                          </div>
                        )}

                        {confirmEndCall && canEndCallEarly ? (
                          <div className="voice-call-transcript-card interview-flow-notice interview-end-call-confirm">
                            <p>
                              ¿Generar diagnóstico con el avance actual? Si la llamada fue breve, el informe será
                              preliminar.
                            </p>
                            <div className="interview-call-actions interview-call-actions--secondary">
                              <button
                                type="button"
                                className="summary-action-btn summary-action-accept interview-call-end-confirm-btn"
                                onClick={() => {
                                  setConfirmEndCall(false);
                                  void endCallEarly();
                                }}
                                disabled={blockVoiceInteraction}
                              >
                                Confirmar y generar diagnóstico
                              </button>
                              <button
                                type="button"
                                className="summary-action-btn"
                                onClick={() => setConfirmEndCall(false)}
                                disabled={blockVoiceInteraction}
                              >
                                Seguir en llamada
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>

                      {voiceError && (showInCallControls || voiceConnected) ? (
                        <div className="interview-call-error-panel interview-call-error-panel--center">
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
                    </div>

                    <div className="interview-live-zone interview-live-zone--rail interview-matte-panel interview-matte-panel--rail">
                      <InterviewInsightRail cells={insightCells} />
                    </div>
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
