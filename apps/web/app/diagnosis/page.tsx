// apps/web/app/diagnosis/page.tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import {
  DiagnosticNarrative,
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
    loadProfileIfNeeded,
  } = useProfileStore();

  /* ────────────────────────────── */
  /* Carga segura                   */
  /* ────────────────────────────── */

  useEffect(() => {
    if (!profile) {
      loadProfileIfNeeded();
    }
  }, [profile, loadProfileIfNeeded]);

  useEffect(() => {
    if (!loading && !profile && !error) {
      router.replace('/intake');
    }
  }, [loading, profile, error, router]);

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
          <p style={{ color: 'rgba(255,120,120,0.9)' }}>
            {error}
          </p>
        </div>
      </div>
    );
  }

  if (!profile) return null;

  /* ────────────────────────────── */
  /* Render                         */
  /* ────────────────────────────── */

  return (
    <div>
      <div className="app-content diagnosis-report pro-report">

        {/* ───────────── Header ───────────── */}
        <section className="app-section animate-fade-in">
          <div style={{ maxWidth: 720 }}>
            <h1 style={{ fontSize: 38, lineHeight: 1.2 }}>
              Diagnóstico financiero
            </h1>

            <p className="text-muted" style={{ marginTop: 12 }}>
              Informe financiero senior premium construido con intake, presupuesto,
              transacciones y entrevista. Incluye hallazgos, tensiones, hipótesis e insights accionables.
            </p>
          </div>
        </section>

        {/* ───────────── Narrativa ───────────── */}
        <section className="app-section">
          <DiagnosticNarrative
            narrative={profile.diagnosticNarrative}
          />
        </section>

        {/* ───────────── Perfil ───────────── */}
        <section className="app-section">
          <FinancialProfileCard profile={profile.profile} />
        </section>

        {/* ───────────── Tensiones ───────────── */}
        <section className="app-section">
          <TensionsList tensions={profile.tensions} />
        </section>

        {/* ───────────── Hipótesis ───────────── */}
        <section className="app-section">
          <HypothesesList hypotheses={profile.hypotheses} />
        </section>

        {/* ───────────── Preguntas abiertas ───────────── */}
        <section className="app-section">
          <OpenQuestionsCard questions={profile.openQuestions} />
        </section>

        {/* ───────────── Acciones finales ───────────── */}
        <section className="app-section animate-fade-in no-print">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 16,
              marginTop: 48,
              flexWrap: 'wrap',
            }}
          >
            <button
              className="continue-ghost"
              onClick={() => window.print()}
            >
              Guardar diagnóstico en PDF
            </button>

            <div style={{ display: 'flex', gap: 12 }}>
            <button
                  className="continue-ghost"
                  onClick={() => router.push('/agent')}
                >
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
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
