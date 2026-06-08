// apps/web/app/diagnosis/page.tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import {
  DiagnosisHero,
  ScorecardGrid,
  DiagnosticNarrative,
  DiagnosticCharts,
  FinancialProfileCard,
  TensionsList,
  HypothesesList,
  OpenQuestionsCard,
} from '@/components/diagnosis';

import { useProfileStore } from '@/state/profile.store';

export default function DiagnosisPage() {
  const router = useRouter();

  const {
    profile,
    loading,
    error,
    hasDiagnosis,
    loadProfileIfNeeded,
    refreshProfile,
  } = useProfileStore();

  /* ────────────────────────────── */
  /* Carga segura                   */
  /* ────────────────────────────── */

  useEffect(() => {
    void loadProfileIfNeeded();
  }, [loadProfileIfNeeded]);

  useEffect(() => {
    if (!loading && !hasDiagnosis && !error) {
      router.replace('/intake');
    }
  }, [loading, hasDiagnosis, error, router]);

  /* ────────────────────────────── */
  /* Estados                        */
  /* ────────────────────────────── */

  if (loading) {
    return (
      <div>
        <div className="app-content">
          <p className="text-muted">
            Analizando tu situación financiera…
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <div className="app-content">
          <p style={{ color: 'rgba(255,120,120,0.9)' }}>{error}</p>
          <div className="diagnosis-hero-actions" style={{ marginTop: 16 }}>
            <button
              type="button"
              className="button-primary"
              onClick={() => void refreshProfile()}
              disabled={loading}
            >
              {loading ? 'Reintentando…' : 'Reintentar carga'}
            </button>
            <button type="button" className="continue-ghost" onClick={() => router.push('/agent')}>
              Volver al agente
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!profile) return null;

  /* ────────────────────────────── */
  /* Render                         */
  /* ────────────────────────────── */

  return (
    <div className="diagnosis-page-shell">
      <div className="app-content diagnosis-report pro-report diagnosis-premium-report">
        <DiagnosisHero
          headline={profile.editorial?.headline ?? 'Diagnostico financiero premium'}
          dek={profile.editorial?.dek}
          keySignals={profile.editorial?.keySignals}
        />

        <section className="app-section diagnosis-hero-actions no-print">
          <button className="continue-ghost" onClick={() => window.print()}>
            Guardar como PDF
          </button>
          <button className="continue-ghost" onClick={() => router.push('/agent')}>
            Continuar conversación
          </button>
          <button
            className="button-primary"
            onClick={() => {
              try {
                localStorage.setItem(
                  'agent.prefill_prompt',
                  'Quiero profundizar mi diagnóstico financiero. Ayúdame a conectar tensiones, hipótesis y próximos pasos concretos.'
                );
              } catch {}
              router.push('/agent');
            }}
          >
            Profundizar diagnóstico
          </button>
        </section>

        <ScorecardGrid items={profile.editorial?.scorecard} />

        <section className="app-section diagnosis-grid diagnosis-grid--lead">
          <DiagnosticNarrative narrative={profile.diagnosticNarrative} />
          <FinancialProfileCard profile={profile.profile} />
        </section>

        <DiagnosticCharts
          cashflowBuckets={profile.editorial?.cashflowBuckets}
          pressurePoints={profile.editorial?.pressurePoints}
        />

        <section className="app-section diagnosis-grid diagnosis-grid--secondary">
          <TensionsList tensions={profile.tensions} />
          <HypothesesList hypotheses={profile.hypotheses} />
          <OpenQuestionsCard questions={profile.openQuestions} />
        </section>
      </div>
    </div>
  );
}
