'use client';
import { useState } from 'react';
import type { IntakeQuestionnaire } from '@financial-agent/shared/src/intake/intake-questionnaire.types';

const AGE_OPTIONS = [
  { value: 18, label: 'Menos de 25', range: [0, 24] },
  { value: 27, label: '25 – 34', range: [25, 34] },
  { value: 37, label: '35 – 44', range: [35, 44] },
  { value: 47, label: '45 – 55', range: [45, 55] },
  { value: 60, label: 'Más de 55', range: [56, 100] },
];

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
  const [showExact, setShowExact] = useState(false);

  const selectedAge = AGE_OPTIONS.find(
    (o) => form.age !== undefined && form.age >= o.range[0] && form.age <= o.range[1]
  );

  const ready = !!form.age && !!form.employmentStatus;

  return (
    <div className="intake-step animate-intake-in">
      <div className="intake-step-header">
        <span className="intake-step-tag">Contexto personal</span>
        <h2 className="intake-step-title">Cuéntame sobre ti</h2>
        <p className="intake-step-subtitle">
          Necesito entender tu punto de partida para darte asesoría que realmente se ajuste a tu vida.
        </p>
      </div>

      <div className="intake-question-block">
        <label htmlFor="age-group" className="intake-question-label">¿En qué rango de edad estás?</label>
        <div className="intake-chips" id="age-group" role="group" aria-labelledby="age-group">
          {AGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`intake-chip${selectedAge?.value === opt.value ? ' is-selected' : ''}`}
              onClick={() => {
                update('age', opt.value);
                setShowExact(false);
              }}
              aria-pressed={selectedAge?.value === opt.value}
            >
              {opt.label}
            </button>
          ))}
          <button
            type="button"
            className={`intake-chip intake-chip-exact${showExact ? ' is-selected' : ''}`}
            onClick={() => setShowExact(true)}
            aria-pressed={showExact}
          >
            Exacta
          </button>
        </div>
        {showExact && (
          <input
            id="age-exact"
            className="intake-input"
            type="number"
            min={14}
            max={100}
            placeholder="Tu edad exacta"
            aria-label="Tu edad exacta en años"
            value={form.age ?? ''}
            onChange={(e) => update('age', Number(e.target.value) || undefined as any)}
            autoFocus
          />
        )}
      </div>

      <div className="intake-question-block">
        <label htmlFor="employment-group" className="intake-question-label">¿Cuál es tu situación laboral?</label>
        <div className="intake-chips intake-chips-grid" id="employment-group" role="group" aria-labelledby="employment-group">
          {EMPLOYMENT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`intake-chip intake-chip-wide${form.employmentStatus === opt.value ? ' is-selected' : ''}`}
              onClick={() => update('employmentStatus', opt.value)}
              aria-pressed={form.employmentStatus === opt.value}
              title={opt.sub}
            >
              <span className="intake-chip-main">{opt.label}</span>
              <span className="intake-chip-sub">{opt.sub}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="intake-question-block">
        <label htmlFor="profession" className="intake-question-label">¿A qué te dedicas? <span className="intake-optional">(opcional)</span></label>
        <input
          id="profession"
          className="intake-input"
          placeholder="Ej: Ingeniero comercial, estudiante de medicina, emprendedor"
          value={form.profession ?? ''}
          onChange={(e) => update('profession', e.target.value)}
          aria-label="Tu profesión u ocupación"
        />
      </div>

      <div className="intake-footer">
        {ready && (
          <button
            className="intake-next-btn focus-ring"
            onClick={onNext}
            type="button"
            aria-label="Continuar al siguiente paso"
          >
            Continuar
            <span className="intake-next-arrow">→</span>
          </button>
        )}
      </div>
    </div>
  );
}
