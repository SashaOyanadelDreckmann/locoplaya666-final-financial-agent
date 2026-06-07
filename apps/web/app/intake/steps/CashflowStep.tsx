'use client';
import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { IntakeQuestionnaire } from '@financial-agent/shared/src/intake/intake-questionnaire.types';
import { balancedColumns } from './grid';

const INCOME_OPTIONS: { value: IntakeQuestionnaire['incomeBand']; label: string; sub: string }[] = [
  { value: 'no_income', label: 'Sin ingresos', sub: 'Actualmente' },
  { value: '<300k', label: 'Hasta $300 mil', sub: 'Mensual' },
  { value: '300k-600k', label: '$300k – $600k', sub: 'Mensual' },
  { value: '600k-1M', label: '$600k – $1M', sub: 'Mensual' },
  { value: '1M-2M', label: '$1M – $2M', sub: 'Mensual' },
  { value: '2M-4M', label: '$2M – $4M', sub: 'Mensual' },
  { value: '>4M', label: 'Más de $4M', sub: 'Mensual' },
  { value: 'variable', label: 'Variable', sub: 'Cambia cada mes' },
];

const COVERAGE_OPTIONS: { value: IntakeQuestionnaire['expensesCoverage']; label: string; sub: string }[] = [
  { value: 'surplus', label: 'Me sobra', sub: 'Queda dinero al final del mes' },
  { value: 'tight', label: 'Llego justo', sub: 'Se acaba pero alcanza' },
  { value: 'sometimes', label: 'A veces no alcanza', sub: 'Meses difíciles' },
  { value: 'no', label: 'No alcanza', sub: 'Necesito ajustar gastos' },
];

const TRACKING_OPTIONS: { value: IntakeQuestionnaire['tracksExpenses']; label: string }[] = [
  { value: 'yes', label: 'Sí, siempre' },
  { value: 'sometimes', label: 'A veces' },
  { value: 'no', label: 'No registro' },
];

import { useIntakeQuestionAmbient } from '../useIntakeQuestionAmbient';
import { IntakeQuestionNav } from './IntakeQuestionNav';
import { IntakeQuestionTransition } from './IntakeQuestionTransition';

export function CashflowStep({
  form,
  update,
  onNext,
}: {
  form: IntakeQuestionnaire;
  update: <K extends keyof IntakeQuestionnaire>(key: K, value: IntakeQuestionnaire[K]) => void;
  onNext: () => void;
}) {
  const [questionIndex, setQuestionIndex] = useState(0);
  const totalQuestions = 3;

  useIntakeQuestionAmbient(questionIndex, totalQuestions);

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

  const showForward = true;
  const forwardDisabled =
    (questionIndex === 0 && !Boolean(form.incomeBand)) ||
    (questionIndex === 1 && !Boolean(form.expensesCoverage)) ||
    (questionIndex === 2 && !Boolean(form.tracksExpenses));

  return (
    <div className="intake-step animate-intake-in">
      <div className="intake-step-header">
        <span className="intake-step-tag">Ingresos y gastos</span>
        <h2 className="intake-step-title">¿Cómo fluye tu dinero?</h2>
        <p className="intake-step-subtitle">
          Tu flujo mensual es la base de cualquier plan financiero.
          Sin datos reales, los consejos son genéricos. Los tuyos no lo serán.
        </p>
      </div>

      <IntakeQuestionNav
        questionIndex={questionIndex}
        totalQuestions={totalQuestions}
        onBack={onBackQuestion}
        onNext={questionIndex === totalQuestions - 1 ? onNext : onNextQuestion}
        showForward={showForward}
        forwardDisabled={forwardDisabled}
        forwardAriaLabel={questionIndex === totalQuestions - 1 ? 'Siguiente sección' : 'Continuar'}
      />

      <IntakeQuestionTransition questionKey={questionIndex}>
      {questionIndex === 0 && (
        <>
          <label className="intake-question-label">¿Cuánto <span className="kw-sky">ingresas</span> al mes, aproximadamente?</label>
          <div className="intake-chips intake-chips-grid" style={{ '--intake-cols': balancedColumns(INCOME_OPTIONS.length) } as CSSProperties}>
            {INCOME_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`intake-chip intake-chip-wide${form.incomeBand === opt.value ? ' is-selected' : ''}`}
                onClick={() => {
                  update('incomeBand', opt.value);
                  setTimeout(() => setQuestionIndex(1), 120);
                }}
              >
                <span className="intake-chip-main">{opt.label}</span>
                <span className="intake-chip-sub">{opt.sub}</span>
              </button>
            ))}
          </div>
          {form.incomeBand && (
            <input
              className="intake-input intake-input-sm"
              type="number"
              min={0}
              placeholder="Monto exacto (opcional)"
              value={form.exactMonthlyIncome ?? ''}
              onChange={(e) =>
                update('exactMonthlyIncome', e.target.value ? Number(e.target.value) : undefined as any)
              }
            />
          )}
        </>
      )}

      {questionIndex === 1 && (
        <>
          <label className="intake-question-label">¿Tus ingresos <span className="kw-sky">cubren</span> tus gastos mensuales?</label>
          <div className="intake-chips">
            {COVERAGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`intake-chip intake-chip-wide${form.expensesCoverage === opt.value ? ' is-selected' : ''}`}
                onClick={() => {
                  update('expensesCoverage', opt.value);
                  setTimeout(() => setQuestionIndex(2), 120);
                }}
              >
                <span className="intake-chip-main">{opt.label}</span>
                <span className="intake-chip-sub">{opt.sub}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {questionIndex === 2 && (
        <>
          <label className="intake-question-label">¿<span className="kw-sky">Registras</span> o monitoreas tus gastos?</label>
          <div className="intake-chips">
            {TRACKING_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`intake-chip${form.tracksExpenses === opt.value ? ' is-selected' : ''}`}
                onClick={() => {
                  update('tracksExpenses', opt.value);
                  setTimeout(() => onNext(), 120);
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
      </IntakeQuestionTransition>
    </div>
  );
}
