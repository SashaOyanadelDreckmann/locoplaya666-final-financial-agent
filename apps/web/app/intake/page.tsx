'use client';
import './intake.css';

import { useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useInterviewStore } from '@/state/interview.store';
import { submitIntake } from '@/lib/intake';
import { getSessionInfo } from '@/lib/api';
import { toUserFacingError } from '@/lib/userError';
import { hasCompletedIntakeAccess, resolveAuthRedirectPath } from '@/lib/sessionAccess';

import type { IntakeQuestionnaire } from '@financial-agent/shared/src/intake/intake-questionnaire.types';

import {
  ContextStep,
  CashflowStep,
  SavingsStep,
  KnowledgeStep,
} from './steps';

const INTAKE_STEPS = [
  { key: 'context',   label: 'Contexto', title: 'Tu contexto personal',      rgb: '44, 111, 172'  },
  { key: 'cashflow',  label: 'Flujo',    title: 'Ingresos y gastos',          rgb: '89, 176, 196'  },
  { key: 'savings',   label: 'Base',     title: 'Ahorro y deudas',            rgb: '201, 168, 64'  },
  { key: 'knowledge', label: 'Perfil',   title: 'Conocimiento y riesgo',      rgb: '139, 26, 43'   },
] as const;

const INITIAL_FORM: IntakeQuestionnaire = {
  age: undefined,
  city: '',
  employmentStatus: 'employed',
  profession: '',
  incomeBand: '600k-1M',
  exactMonthlyIncome: undefined,
  expensesCoverage: 'tight',
  tracksExpenses: 'sometimes',
  hasSavingsOrInvestments: false,
  savingsBand: undefined,
  exactSavingsAmount: undefined,
  hasDebt: false,
  financialKnowledge: {
    interest: false, inflation: false, creditCard: false,
    creditLine: false, loanComponents: false, interestRate: false,
    liquidity: false, returnConcept: false, diversification: false,
    assetVsLiability: false, financialRisk: false, capitalMarkets: false,
    alternativeInvestments: false, fintech: false, CAE: false,
  },
  riskReaction: 'hold',
  riskReactionOther: '',
  selfRatedUnderstanding: 4,
  moneyStressLevel: 5,
};

export default function IntakePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setIntake = useInterviewStore((s) => s.setIntake);

  const [form, setForm] = useState<IntakeQuestionnaire>(structuredClone(INITIAL_FORM));
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        const session = await getSessionInfo();
        if (cancelled) return;
        if (!session?.id) {
          router.replace('/login');
          return;
        }
        if (hasCompletedIntakeAccess(session?.injectedIntake)) {
          router.replace('/agent');
          return;
        }
      } catch (err) {
        if (cancelled) return;
        router.replace(resolveAuthRedirectPath(err));
        return;
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    };

    void bootstrap();
    return () => { cancelled = true; };
  }, [router]);

  // Cursor-following glow on answer cards: track pointer position into CSS vars
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const chip = (e.target as HTMLElement | null)?.closest<HTMLElement>('.intake-chip');
      if (!chip) return;
      const rect = chip.getBoundingClientRect();
      chip.style.setProperty('--mx', `${e.clientX - rect.left}px`);
      chip.style.setProperty('--my', `${e.clientY - rect.top}px`);
    };
    document.addEventListener('pointermove', onMove, { passive: true });
    return () => document.removeEventListener('pointermove', onMove);
  }, []);

  const update = <K extends keyof IntakeQuestionnaire>(key: K, value: IntakeQuestionnaire[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const nextStep = () => setStep((s) => Math.min(s + 1, INTAKE_STEPS.length - 1));
  const prevStep = () => setStep((s) => Math.max(s - 1, 0));

  const onSubmit = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await submitIntake(form);
      setIntake(res.intake);
      router.push('/agent');
    } catch (e: any) {
      setError(toUserFacingError(e, 'intake.submit'));
    } finally {
      setLoading(false);
    }
  };

  if (bootstrapping) return null;

  const stepMeta = INTAKE_STEPS[step];
  const cssVars = { '--c-step': stepMeta.rgb } as React.CSSProperties;
  const approvedStatus = searchParams.get('status') === 'approved';

  return (
    <div className="intake-shell" data-step={stepMeta.key} style={cssVars}>
      <div className="intake-photo-bg" aria-hidden />
      <div className="intake-bg-orb" aria-hidden />

      <header className="intake-topbar">
        <button
          type="button"
          className="intake-topbar-back"
          onClick={() => (step > 0 ? prevStep() : router.back())}
          aria-label="Volver"
        >
          ←
        </button>

        <nav className="intake-stage-bar" aria-label="Progreso del perfil">
          {INTAKE_STEPS.map((s, i) => (
            <div
              key={s.key}
              className={`intake-stage-seg${i === step ? ' active' : i < step ? ' done' : ''} intake-stage-seg--${s.key}`}
            >
              <span className="intake-stage-seg-label">{s.label}</span>
              <div className="intake-stage-seg-pill" />
            </div>
          ))}
        </nav>
      </header>

      <main
        className="intake-main intake-main-immersive"
        data-step={stepMeta.key}
        aria-label={stepMeta.title}
      >
        {approvedStatus ? (
          <div className="intake-error" role="status" style={{ marginBottom: 12 }}>
            Cuenta aprobada. Falta completar este perfil inicial para entrar al agente.
          </div>
        ) : null}
        <AnimatePresence mode="wait">
          <motion.div
            key={stepMeta.key}
            className="intake-warp-stage"
            initial={{ opacity: 0, rotateX: -5, skewY: -1.5, scaleY: 1.18, scaleX: 0.92, y: 54, filter: 'blur(10px)' }}
            animate={{ opacity: 1, rotateX: 0, skewY: 0, scaleY: 1, scaleX: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, rotateX: 5, skewY: 1.2, scaleY: 0.92, scaleX: 1.05, y: -34, filter: 'blur(10px)' }}
            transition={{ duration: 0.42, ease: [0.59, 0, 0.35, 1] }}
            style={{ transformPerspective: 1000, transformOrigin: '50% 0%' }}
          >
            {step === 0 && <ContextStep form={form} update={update} onNext={nextStep} />}
            {step === 1 && <CashflowStep form={form} update={update} onNext={nextStep} />}
            {step === 2 && <SavingsStep form={form} update={update} onNext={nextStep} />}
            {step === 3 && (
              <KnowledgeStep
                form={form}
                update={update}
                onSubmit={onSubmit}
                loading={loading}
                onBack={prevStep}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {error && (
        <div className="intake-error">{error}</div>
      )}
    </div>
  );
}
