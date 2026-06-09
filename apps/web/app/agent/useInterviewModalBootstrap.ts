'use client';

import { useEffect, useLayoutEffect } from 'react';
import { getSessionInfo } from '@/lib/api';
import { readInterviewVoiceState } from '@/lib/interviewVoiceState';
import {
  deriveHydratedVoiceState,
  mergeInterviewIntake,
  mergeInterviewVoiceSnapshots,
  type InterviewIntakeWithContext,
} from './interview-modal.hydration';
import type { InterviewVoiceSnapshot } from './interview-modal.context';

type Params = {
  isOpen: boolean;
  bootstrapAttempt: number;
  intake: InterviewIntakeWithContext | null;
  handleUnauthorized: (error: unknown) => boolean;
  setIntake: (value: InterviewIntakeWithContext) => void;
  setBootError: (value: string | null) => void;
  setIntakeReady: (value: boolean) => void;
  setSessionAlreadyCompleted: (value: boolean) => void;
  resetVoiceRuntimeState: (options?: { preserveDiagnosisSignals?: boolean }) => void;
  applyHydratedVoiceState: (value: ReturnType<typeof deriveHydratedVoiceState>) => void;
  setSessionAlreadyCompletedVoice: (value: any) => void;
  setLatestDiagnosticProfileId: (value: string | null) => void;
  onDiagnosisOnlyOpen?: () => void;
};

export function useInterviewModalBootstrap(params: Params) {
  const {
    isOpen,
    bootstrapAttempt,
    intake,
    handleUnauthorized,
    setIntake,
    setBootError,
    setIntakeReady,
    setSessionAlreadyCompleted,
    resetVoiceRuntimeState,
    applyHydratedVoiceState,
    setSessionAlreadyCompletedVoice,
    setLatestDiagnosticProfileId,
    onDiagnosisOnlyOpen,
  } = params;

  useLayoutEffect(() => {
    if (!isOpen) {
      setIntakeReady(false);
      setBootError(null);
      setSessionAlreadyCompleted(false);
      return;
    }

    setIntakeReady(false);
    setBootError(null);
    setSessionAlreadyCompleted(false);
  }, [isOpen, bootstrapAttempt, setBootError, setIntakeReady, setSessionAlreadyCompleted]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

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
        const diagnosisOnly = Boolean(
          sessionDiagnosticProfileId ||
            (typeof session?.latestDiagnosticCompletedAt === 'string' &&
              session.latestDiagnosticCompletedAt.length > 0),
        );

        if (!cancelled) {
          resetVoiceRuntimeState({ preserveDiagnosisSignals: diagnosisOnly });
        }

        const mergedIntake = mergeInterviewIntake(
          intake,
          sessionIntake && typeof sessionIntake === 'object' ? (sessionIntake as Record<string, unknown>) : null,
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

          if (hydrated.sessionAlreadyCompleted || diagnosisOnly) {
            setSessionAlreadyCompleted(true);
            if (hydrated.voiceReport) setSessionAlreadyCompletedVoice(hydrated.voiceReport);
            if (hydrated.latestDiagnosticProfileId) setLatestDiagnosticProfileId(hydrated.latestDiagnosticProfileId);
            onDiagnosisOnlyOpen?.();
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
  }, [
    applyHydratedVoiceState,
    handleUnauthorized,
    intake,
    isOpen,
    resetVoiceRuntimeState,
    setBootError,
    setIntake,
    setIntakeReady,
    setLatestDiagnosticProfileId,
    setSessionAlreadyCompleted,
    setSessionAlreadyCompletedVoice,
    bootstrapAttempt,
    onDiagnosisOnlyOpen,
  ]);
}
