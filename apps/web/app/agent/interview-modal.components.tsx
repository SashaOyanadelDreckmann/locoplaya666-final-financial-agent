'use client';

import type { InterviewVoiceReport, InterviewVoiceSummaryEntry } from './interview-modal.context';

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
