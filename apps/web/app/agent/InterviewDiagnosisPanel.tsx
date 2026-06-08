'use client';

import { useRouter } from 'next/navigation';

import {
  DiagnosisHero,
  ScorecardGrid,
  DiagnosticNarrative,
  FinancialProfileCard,
  TensionsList,
  HypothesesList,
  OpenQuestionsCard,
} from '@/components/diagnosis';
import type { DiagnosisProfile } from '@/state/profile.store';
import type { InterviewVoiceReport } from './interview-modal.context';

type Props = {
  profile: DiagnosisProfile;
  voiceReport?: InterviewVoiceReport | null;
  onClose: () => void;
  compact?: boolean;
};

export function InterviewDiagnosisPanel({ profile, voiceReport, onClose, compact = true }: Props) {
  const router = useRouter();
  const headline =
    profile.editorial?.headline ??
    (voiceReport?.executive_report ? 'Diagnóstico financiero consolidado' : 'Diagnóstico financiero');
  const dek =
    profile.editorial?.dek ??
    voiceReport?.executive_report ??
    profile.diagnosticNarrative?.slice(0, 220);

  function openFullReport() {
    onClose();
    router.push('/diagnosis');
  }

  function deepenInChat() {
    try {
      localStorage.setItem(
        'agent.prefill_prompt',
        'Quiero profundizar mi diagnóstico financiero. Ayúdame a conectar tensiones, hipótesis y próximos pasos concretos.',
      );
    } catch {}
    onClose();
    router.push('/agent');
  }

  return (
    <div className={`interview-diagnosis-panel${compact ? ' interview-diagnosis-panel--compact' : ''}`}>
      <DiagnosisHero headline={headline} dek={dek} keySignals={profile.editorial?.keySignals} />

      {voiceReport?.key_findings?.length ? (
        <section className="interview-diagnosis-bridge">
          <span className="interview-surface-eyebrow">Síntesis de entrevista</span>
          <ul className="diagnosis-list">
            {voiceReport.key_findings.map((finding) => (
              <li key={finding}>{finding}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <ScorecardGrid items={profile.editorial?.scorecard} />

      <section className="interview-diagnosis-grid interview-diagnosis-grid--lead">
        <DiagnosticNarrative narrative={profile.diagnosticNarrative} />
        <FinancialProfileCard profile={profile.profile} />
      </section>

      <section className="interview-diagnosis-grid interview-diagnosis-grid--secondary">
        <TensionsList tensions={profile.tensions} />
        <HypothesesList hypotheses={profile.hypotheses} />
        <OpenQuestionsCard questions={profile.openQuestions} />
      </section>

      <div className="voice-call-actions interview-diagnosis-actions">
        <button type="button" className="summary-action-btn summary-action-accept" onClick={openFullReport}>
          Ver informe completo
        </button>
        <button type="button" className="button-primary interview-diagnosis-deepen-btn" onClick={deepenInChat}>
          Profundizar en chat
        </button>
        <button type="button" className="summary-action-btn" onClick={onClose}>
          Cerrar
        </button>
      </div>
    </div>
  );
}
