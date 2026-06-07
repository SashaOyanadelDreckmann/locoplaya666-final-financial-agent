'use client';
import { useState } from 'react';
import type { IntakeQuestionnaire } from '@financial-agent/shared/src/intake/intake-questionnaire.types';

const SAVINGS_BAND_OPTIONS: { value: IntakeQuestionnaire['savingsBand']; label: string }[] = [
  { value: '<300k', label: 'Menos de $300k' },
  { value: '300k-1M', label: '$300k – $1M' },
  { value: '1M-3M', label: '$1M – $3M' },
  { value: '3M-10M', label: '$3M – $10M' },
  { value: '>10M', label: 'Más de $10M' },
];

import { IntakeQuestionNav } from './IntakeQuestionNav';

export function SavingsStep({
  form,
  update,
  onNext,
}: {
  form: IntakeQuestionnaire;
  update: <K extends keyof IntakeQuestionnaire>(key: K, value: IntakeQuestionnaire[K]) => void;
  onNext: () => void;
}) {
  const [questionIndex, setQuestionIndex] = useState(0);
  const totalQuestions = 2;

  const onNextQuestion = () => {
    if (questionIndex >= totalQuestions - 1) {
      onNext();
      return;
    }
    setQuestionIndex((prev) => Math.min(prev + 1, totalQuestions - 1));
  };

  const onBackQuestion = () => {
    setQuestionIndex((prev) => Math.max(prev - 1, 0));
  };

  const canContinueSavings =
    form.hasSavingsOrInvestments === false ||
    (form.hasSavingsOrInvestments === true && Boolean(form.savingsBand));

  const showForward =
    (questionIndex === 0 && canContinueSavings) ||
    (questionIndex === 1 && typeof form.hasDebt === 'boolean');

  return (
    <div className="intake-step animate-intake-in">
      <div className="intake-step-header">
        <span className="intake-step-tag">Ahorro y deudas</span>
        <h2 className="intake-step-title">¿Dónde estás parado hoy?</h2>
        <p className="intake-step-subtitle">
          Tu colchón financiero y tus compromisos actuales determinan cuánto espacio
          tienes para crecer. Seamos honestos.
        </p>
      </div>

      <IntakeQuestionNav
        questionIndex={questionIndex}
        totalQuestions={totalQuestions}
        onBack={onBackQuestion}
        onNext={questionIndex === totalQuestions - 1 ? onNext : onNextQuestion}
        showForward={showForward}
        forwardAriaLabel={questionIndex === totalQuestions - 1 ? 'Siguiente sección' : 'Continuar'}
      />

      {questionIndex === 0 && (
        <div className="intake-question-block intake-question-screen animate-intake-in">
          <label className="intake-question-label">¿Tienes <span className="kw-yellow">ahorros</span> o dinero <span className="kw-yellow">invertido</span>?</label>
          <p className="intake-question-hint">Cuenta bancaria de ahorro, DAP, fondos mutuos, AFP voluntario, etc.</p>
          <div className="intake-chips">
            <button
              type="button"
              className={`intake-chip intake-chip-yesno${form.hasSavingsOrInvestments === true ? ' is-selected' : ''}`}
              onClick={() => update('hasSavingsOrInvestments', true)}
            >
              Sí, tengo
            </button>
            <button
              type="button"
              className={`intake-chip intake-chip-yesno${form.hasSavingsOrInvestments === false ? ' is-selected' : ''}`}
              onClick={() => {
                update('hasSavingsOrInvestments', false);
                update('savingsBand', undefined as any);
                setTimeout(() => setQuestionIndex(1), 120);
              }}
            >
              Todavía no
            </button>
          </div>
          {form.hasSavingsOrInvestments && (
            <div className="intake-sub-question animate-intake-in">
              <label className="intake-question-label-sm">¿En qué rango están esos ahorros?</label>
              <div className="intake-chips">
                {SAVINGS_BAND_OPTIONS.map((opt) => (
                  <button
                    key={opt.value!}
                    type="button"
                    className={`intake-chip${form.savingsBand === opt.value ? ' is-selected' : ''}`}
                    onClick={() => {
                      update('savingsBand', opt.value);
                      setTimeout(() => setQuestionIndex(1), 120);
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <input
                className="intake-input intake-input-sm"
                type="number"
                min={0}
                placeholder="Monto exacto (opcional)"
                value={form.exactSavingsAmount ?? ''}
                onChange={(e) =>
                  update('exactSavingsAmount', e.target.value ? Number(e.target.value) : undefined as any)
                }
              />
            </div>
          )}
        </div>
      )}

      {questionIndex === 1 && (
        <div className="intake-question-block intake-question-screen animate-intake-in">
          <label className="intake-question-label">¿Tienes <span className="kw-yellow">deudas</span> o compromisos activos?</label>
          <p className="intake-question-hint">Tarjeta de crédito, crédito de consumo, hipotecario, cuotas, etc.</p>
          <div className="intake-chips">
            <button
              type="button"
              className={`intake-chip intake-chip-yesno${form.hasDebt === true ? ' is-selected is-caution' : ''}`}
              onClick={() => {
                update('hasDebt', true);
                setTimeout(() => onNext(), 120);
              }}
            >
              Sí, tengo deudas
            </button>
            <button
              type="button"
              className={`intake-chip intake-chip-yesno${form.hasDebt === false ? ' is-selected' : ''}`}
              onClick={() => {
                update('hasDebt', false);
                setTimeout(() => onNext(), 120);
              }}
            >
              Sin deudas activas
            </button>
          </div>
          {form.hasDebt && (
            <p className="intake-debt-note animate-intake-in">
              Conocer tu situación de deuda permite elaborar un plan de acción real y específico para ti.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
