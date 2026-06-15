'use client';

import { useState } from 'react';

import {
  DiagnosisHero,
  ScorecardGrid,
  DiagnosticNarrative,
  FinancialProfileCard,
  TensionsList,
  HypothesesList,
  OpenQuestionsCard,
} from '@/components/diagnostico';
import type { DiagnosisProfile } from '@/state/profile.store';
import type { InterviewVoiceReport } from './interview-modal.context';

type Props = {
  profile: DiagnosisProfile;
  voiceReport?: InterviewVoiceReport | null;
  onClose: () => void;
  onDeepenInChat?: (context?: { voiceFindings?: string[] }) => void;
  deepenDisabled?: boolean;
  compact?: boolean;
};

export function InterviewDiagnosisPanel({
  profile,
  voiceReport,
  onClose,
  onDeepenInChat,
  deepenDisabled = false,
  compact = true,
}: Props) {
  const [deepenedLocally, setDeepenedLocally] = useState(false);
  const isDeepenBlocked = deepenDisabled || deepenedLocally;

  function deepenInChat() {
    if (isDeepenBlocked) return;
    setDeepenedLocally(true);
    onClose();
    onDeepenInChat?.({
      voiceFindings: voiceReport?.key_findings?.filter(Boolean),
    });
  }

  return (
    <div className={`interview-diagnosis-panel${compact ? ' interview-diagnosis-panel--compact' : ''}`}>
      <div className="interview-diagnosis-panel__body">
        <DiagnosisHero variant="embedded" keySignals={profile.editorial?.keySignals} />

        {voiceReport?.coverage_tier === 'minimal' || voiceReport?.coverage_tier === 'partial' ? (
          <p className="interview-inline-note interview-diagnosis-coverage-note">
            Diagnóstico generado con cobertura{' '}
            {voiceReport.coverage_tier === 'minimal' ? 'preliminar' : 'parcial'} según el avance de la llamada.
            {voiceReport.has_enough_information === false
              ? ' Conviene profundizar en chat para completar el mapa financiero.'
              : null}
          </p>
        ) : null}

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

        <section className="interview-diagnosis-stack">
          <DiagnosticNarrative narrative={profile.diagnosticNarrative} />
          <FinancialProfileCard profile={profile.profile} />
          <TensionsList tensions={profile.tensions} concise={compact} />
          <HypothesesList hypotheses={profile.hypotheses} concise={compact} />
          <OpenQuestionsCard questions={profile.openQuestions} concise={compact} />
        </section>
      </div>

      <div className="interview-diagnosis-panel__footer">
        <button
          type="button"
          className="button-primary interview-diagnosis-deepen-btn"
          onClick={deepenInChat}
          disabled={isDeepenBlocked}
          aria-disabled={isDeepenBlocked}
        >
          Profundizar en chat
        </button>
      </div>
    </div>
  );
}
