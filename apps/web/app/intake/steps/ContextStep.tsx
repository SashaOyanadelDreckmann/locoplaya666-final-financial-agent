'use client';
import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { IntakeQuestionnaire } from '@financial-agent/shared/src/intake/intake-questionnaire.types';
import { balancedColumns } from './grid';
import { CityMapQuestion } from './CityMapQuestion';
import { useIntakeQuestionAmbient } from '../useIntakeQuestionAmbient';
import { IntakeQuestionNav } from './IntakeQuestionNav';
import { IntakeQuestionTransition } from './IntakeQuestionTransition';

const EMPLOYMENT_OPTIONS: { value: IntakeQuestionnaire['employmentStatus']; label: string; sub: string }[] = [
  { value: 'employed', label: 'Dependiente', sub: 'Empleado con contrato' },
  { value: 'freelance', label: 'Independiente', sub: 'Freelance o emprendedor' },
  { value: 'employed_freelance', label: 'Ambos', sub: 'Dependiente + independiente' },
  { value: 'student', label: 'Estudiante', sub: 'Sin ingresos laborales' },
  { value: 'employed_student', label: 'Estudiante + trabajo', sub: 'Estudio y trabajo' },
  { value: 'freelance_student', label: 'Independiente + estudiante', sub: 'Freelance y estudio' },
  { value: 'employed_freelance_student', label: 'Dependiente + independiente + estudiante', sub: 'Tres roles a la vez' },
  { value: 'unemployed', label: 'Sin trabajo', sub: 'Cesante actualmente' },
];

export function ContextStep({
  form,
  update,
  onNext,
}: {
  form: IntakeQuestionnaire;
  update: <K extends keyof IntakeQuestionnaire>(key: K, value: IntakeQuestionnaire[K]) => void;
  onNext: () => void;
}) {
  const [questionIndex, setQuestionIndex] = useState(0);
  const [cityGeocoded, setCityGeocoded] = useState(false);

  const canContinueAge = typeof form.age === 'number' && form.age > 0;
  const canContinueCity =
    (typeof form.city === 'string' && form.city.trim().length > 1) || cityGeocoded;
  const totalQuestions = 4;
  const isLast = questionIndex === totalQuestions - 1;

  useIntakeQuestionAmbient(questionIndex, totalQuestions);

  const onNextQuestion = () => {
    if (isLast) {
      onNext();
      return;
    }
    setQuestionIndex((prev) => Math.min(prev + 1, totalQuestions - 1));
  };

  const onBackQuestion = () => {
    setQuestionIndex((prev) => Math.max(prev - 1, 0));
  };

  const showForward = questionIndex !== 2;
  const forwardDisabled =
    (questionIndex === 0 && !canContinueAge) ||
    (questionIndex === 1 && !canContinueCity);

  return (
    <div className="intake-step intake-step-context animate-intake-in">
      <div className="intake-step-header">
        <span className="intake-step-tag">Contexto personal</span>
        <h2 className="intake-step-title">Cuéntame sobre ti</h2>
        <p className="intake-step-subtitle">
          Necesito entender tu punto de partida para darte asesoría que realmente se ajuste a tu vida.
        </p>
      </div>

      <IntakeQuestionNav
        questionIndex={questionIndex}
        totalQuestions={totalQuestions}
        onBack={onBackQuestion}
        onNext={onNextQuestion}
        showForward={showForward}
        forwardDisabled={forwardDisabled}
        forwardAriaLabel={isLast ? 'Siguiente sección' : 'Continuar'}
      />

      <IntakeQuestionTransition questionKey={questionIndex}>
      {questionIndex === 0 && (
        <>
          <label htmlFor="age-exact" className="intake-question-label">¿Cuál es tu <span className="kw-blue">edad exacta</span>?</label>
          <input
            id="age-exact"
            className="intake-input"
            type="number"
            min={14}
            max={100}
            placeholder="Escribe tu edad exacta"
            aria-label="Tu edad exacta en años"
            value={form.age ?? ''}
            onChange={(e) => update('age', Number(e.target.value) || undefined as any)}
            autoFocus
          />
        </>
      )}

      {questionIndex === 1 && (
        <>
          <label htmlFor="city" className="intake-question-label">¿De qué <span className="kw-blue">ciudad</span> eres?</label>
          <CityMapQuestion
            city={form.city ?? ''}
            onCityChange={(value) => update('city', value)}
            onGeocodeResolved={setCityGeocoded}
          />
        </>
      )}

      {questionIndex === 2 && (
        <>
          <label htmlFor="employment-group" className="intake-question-label">¿Cuál es tu <span className="kw-blue">situación laboral</span>?</label>
          <div className="intake-chips intake-chips-grid" id="employment-group" role="group" aria-labelledby="employment-group" style={{ '--intake-cols': balancedColumns(EMPLOYMENT_OPTIONS.length) } as CSSProperties}>
            {EMPLOYMENT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`intake-chip intake-chip-wide${form.employmentStatus === opt.value ? ' is-selected' : ''}`}
                onClick={() => {
                  update('employmentStatus', opt.value);
                  setTimeout(() => onNextQuestion(), 120);
                }}
                aria-pressed={form.employmentStatus === opt.value}
                title={opt.sub}
              >
                <span className="intake-chip-main">{opt.label}</span>
                <span className="intake-chip-sub">{opt.sub}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {questionIndex === 3 && (
        <>
          <label htmlFor="profession" className="intake-question-label">¿A qué te <span className="kw-blue">dedicas</span>? <span className="intake-optional">(opcional)</span></label>
          <input
            id="profession"
            className="intake-input"
            placeholder="Ej: Ingeniero comercial, estudiante de medicina, emprendedor"
            value={form.profession ?? ''}
            onChange={(e) => update('profession', e.target.value)}
            aria-label="Tu profesión u ocupación"
          />
        </>
      )}
      </IntakeQuestionTransition>
    </div>
  );
}
