'use client';
import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { IntakeQuestionnaire } from '@financial-agent/shared/src/intake/intake-questionnaire.types';
import { balancedColumns } from './layout';

const EMPLOYMENT_OPTIONS: { value: IntakeQuestionnaire['employmentStatus']; label: string; sub: string }[] = [
  { value: 'employed', label: 'Dependiente', sub: 'Empleado con contrato' },
  { value: 'freelance', label: 'Independiente', sub: 'Freelance o emprendedor' },
  { value: 'employed_freelance', label: 'Ambos', sub: 'Dependiente + independiente' },
  { value: 'student', label: 'Estudiante', sub: 'Sin ingresos laborales' },
  { value: 'employed_student', label: 'Estudiante + trabajo', sub: 'Estudio y trabajo' },
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

  const canContinueAge = typeof form.age === 'number' && form.age > 0;
  const totalQuestions = 3;
  const isLast = questionIndex === totalQuestions - 1;

  const onNextQuestion = () => {
    if (isLast) {
      onNext();
      return;
    }
    setQuestionIndex((prev) => Math.min(prev + 1, totalQuestions - 1));
  };

  return (
    <div className="intake-step intake-step-context animate-intake-in">
      <div className="intake-step-header">
        <span className="intake-step-tag">Contexto personal</span>
        <h2 className="intake-step-title">Cuéntame sobre ti</h2>
        <p className="intake-step-subtitle">
          Necesito entender tu punto de partida para darte asesoría que realmente se ajuste a tu vida.
        </p>
      </div>
      <p className="intake-question-progress">Pregunta {questionIndex + 1} de {totalQuestions}</p>

      {questionIndex === 0 && (
        <div className="intake-question-block intake-question-screen animate-intake-in">
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
        </div>
      )}

      {questionIndex === 1 && (
        <div className="intake-question-block intake-question-screen animate-intake-in">
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
        </div>
      )}

      {questionIndex === 2 && (
        <div className="intake-question-block intake-question-screen animate-intake-in">
          <label htmlFor="profession" className="intake-question-label">¿A qué te <span className="kw-blue">dedicas</span>? <span className="intake-optional">(opcional)</span></label>
          <input
            id="profession"
            className="intake-input"
            placeholder="Ej: Ingeniero comercial, estudiante de medicina, emprendedor"
            value={form.profession ?? ''}
            onChange={(e) => update('profession', e.target.value)}
            aria-label="Tu profesión u ocupación"
          />
        </div>
      )}

      <div className="intake-footer">
        {((questionIndex === 0 && canContinueAge) || questionIndex === 2) && (
          <button
            className="intake-nav-arrow focus-ring"
            onClick={onNextQuestion}
            type="button"
            aria-label="Continuar"
          >
            →
          </button>
        )}
      </div>
    </div>
  );
}
