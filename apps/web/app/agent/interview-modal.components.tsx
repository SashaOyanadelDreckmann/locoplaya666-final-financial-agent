'use client';

import { useEffect, useState } from 'react';

import type { InterviewVoiceReport, InterviewVoiceSummaryEntry } from './interview-modal.context';

const INTERVIEW_BOOT_STEPS = [
  {
    title: 'Cargando perfil',
    detail: 'Recuperamos tu intake y preferencias financieras.',
  },
  {
    title: 'Integrando presupuesto',
    detail: 'Cruzamos ingresos, gastos y balance mensual.',
  },
  {
    title: 'Preparando entrevista',
    detail: 'Ensamblamos productos y contexto para abrir la llamada.',
  },
] as const;

export function InterviewModalLoader(props: {
  title?: string;
  subtitle?: string;
  note?: string;
  animateSteps?: boolean;
}) {
  const { title, subtitle, note, animateSteps = false } = props;
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (!animateSteps) return;
    const timer = window.setInterval(() => {
      setStepIndex((current) => (current + 1) % INTERVIEW_BOOT_STEPS.length);
    }, 2600);
    return () => window.clearInterval(timer);
  }, [animateSteps]);

  const activeStep = animateSteps ? INTERVIEW_BOOT_STEPS[stepIndex] : null;
  const resolvedTitle = title ?? activeStep?.title ?? 'Preparando entrevista';
  const resolvedSubtitle =
    subtitle ??
    activeStep?.detail ??
    'Estamos cargando tu contexto para abrir la conversación con continuidad.';

  return (
    <div className="interview-modal-loader" role="status" aria-live="polite" aria-busy="true">
      <div className="interview-modal-loader__visual" aria-hidden="true">
        <span className="interview-modal-loader__ring" />
        <span className="interview-modal-loader__pulse">
          <span className="bcc-dot-pulse" />
          <span className="bcc-dot-pulse" />
          <span className="bcc-dot-pulse" />
        </span>
      </div>
      <div className="interview-modal-loader__copy">
        <span className="interview-modal-loader__eyebrow">Financieramente</span>
        <h4 className="interview-modal-loader__title">{resolvedTitle}</h4>
        <p className="interview-modal-loader__subtitle">{resolvedSubtitle}</p>
        {note ? <p className="interview-modal-loader__note">{note}</p> : null}
      </div>
      {animateSteps ? (
        <div className="interview-modal-loader__steps" aria-hidden="true">
          {INTERVIEW_BOOT_STEPS.map((step, index) => (
            <span
              key={step.title}
              className={`interview-modal-loader__step${index === stepIndex ? ' is-active' : index < stepIndex ? ' is-done' : ''}`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function InterviewModalBootError(props: {
  message: string;
  onRetry: () => void;
  onClose: () => void;
  retrying?: boolean;
}) {
  const { message, onRetry, onClose, retrying = false } = props;

  return (
    <div className="interview-modal-loading interview-modal-loading--error" role="alert">
      <div className="interview-modal-loader__copy">
        <span className="interview-modal-loader__eyebrow">No pudimos abrir la entrevista</span>
        <h4 className="interview-modal-loader__title">Revisa el contexto e inténtalo de nuevo</h4>
        <p className="interview-modal-loader__subtitle">{message}</p>
      </div>
      <div className="interview-modal-loader__actions">
        <button
          type="button"
          className="summary-action-btn summary-action-accept"
          onClick={onRetry}
          disabled={retrying}
        >
          {retrying ? 'Reintentando…' : 'Reintentar'}
        </button>
        <button type="button" className="summary-action-btn" onClick={onClose}>
          Cerrar
        </button>
      </div>
    </div>
  );
}

export function InterviewVoiceSummaryBlock(props: {
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

export function InterviewVoiceReportBlock(props: {
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
