'use client';
import './intake.css';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useInterviewStore } from '@/state/interview.store';
import { submitIntake } from '@/lib/intake';

import type {
  IntakeQuestionnaire,
  FinancialProductEntry,
} from '@financial-agent/shared/src/intake/intake-questionnaire.types';

import {
  ContextStep,
  CashflowStep,
  SavingsStep,
  ProductsStep,
  KnowledgeStep,
} from './steps';

const EMPTY_PRODUCT: FinancialProductEntry = {
  product: '',
  institution: '',
  notes: '',
  acquisitionCost: undefined,
  monthlyCost: undefined,
  anualCost: undefined,
};

const INITIAL_FORM: IntakeQuestionnaire = {
  age: undefined,
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
  financialProducts: [structuredClone(EMPTY_PRODUCT)],
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

const STEP_LABELS = [
  'Contexto', 'Ingresos', 'Ahorro', 'Productos', 'Perfil'
];

export default function IntakePage() {
  const router = useRouter();
  const setIntake = useInterviewStore((s) => s.setIntake);

  const [form, setForm] = useState<IntakeQuestionnaire>(structuredClone(INITIAL_FORM));
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = <K extends keyof IntakeQuestionnaire>(key: K, value: IntakeQuestionnaire[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const updateProduct = (index: number, field: keyof FinancialProductEntry, value: any) =>
    setForm((f) => {
      const next = [...f.financialProducts];
      next[index] = { ...next[index], [field]: value };
      return { ...f, financialProducts: next };
    });

  const addProductRow = () =>
    setForm((f) => ({
      ...f,
      financialProducts: [...f.financialProducts, structuredClone(EMPTY_PRODUCT)],
    }));

  const nextStep = () => setStep((s) => Math.min(s + 1, 4));
  const prevStep = () => setStep((s) => Math.max(s - 1, 0));

  const onSubmit = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await submitIntake(form);
      setIntake(res.intake);
      router.push('/agent');
    } catch (e: any) {
      setError(e.message ?? 'Error al enviar el formulario');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="intake-shell">
      {/* Background orb */}
      <div className="intake-bg-orb" aria-hidden />

      {/* Header */}
      <div className="intake-content-panel">
        <header className="intake-header">
          <div className="intake-logo">Asesor Financiero</div>
          <div className="intake-header-badge">Privado · Seguro</div>
        </header>

        {/* Progress */}
        <div className="intake-progress-bar">
          {STEP_LABELS.map((label, i) => (
            <div
              key={i}
              className={`intake-progress-step${i === step ? ' is-current' : ''}${i < step ? ' is-done' : ''}`}
            >
              <div className="intake-progress-dot">
                {i < step ? '✓' : i + 1}
              </div>
              <span className="intake-progress-label">{label}</span>
            </div>
          ))}
          <div
            className="intake-progress-fill"
            style={{ width: `${(step / (STEP_LABELS.length - 1)) * 100}%` }}
          />
        </div>

        {/* Step content */}
        <main className="intake-main">
          {step === 0 && <ContextStep form={form} update={update} onNext={nextStep} />}
          {step === 1 && <CashflowStep form={form} update={update} onNext={nextStep} onBack={prevStep} />}
          {step === 2 && <SavingsStep form={form} update={update} onNext={nextStep} onBack={prevStep} />}
          {step === 3 && (
            <ProductsStep
              form={form}
              updateProduct={updateProduct}
              addProductRow={addProductRow}
              onNext={nextStep}
              onBack={prevStep}
            />
          )}
          {step === 4 && (
            <KnowledgeStep
              form={form}
              update={update}
              onSubmit={onSubmit}
              loading={loading}
              onBack={prevStep}
            />
          )}
        </main>
      </div>

      {error && (
        <div className="intake-error">
          {error}
        </div>
      )}
    </div>
  );
}
