'use client';

import { useEffect, useState } from 'react';
import type { IntakeQuestionnaire } from '@financial-agent/shared/src/intake/intake-questionnaire.types';
import { localizeDisplayValue } from '@/lib/display/localized-display';

const INCOME_OPTIONS: Array<{ value: IntakeQuestionnaire['incomeBand']; label: string }> = [
  { value: 'no_income', label: 'Sin ingresos' },
  { value: '<300k', label: 'Hasta $300 mil' },
  { value: '300k-600k', label: '$300k – $600k' },
  { value: '600k-1M', label: '$600k – $1M' },
  { value: '1M-2M', label: '$1M – $2M' },
  { value: '2M-4M', label: '$2M – $4M' },
  { value: '>4M', label: 'Más de $4M' },
  { value: 'variable', label: 'Variable' },
];

const EMPLOYMENT_OPTIONS: Array<{ value: IntakeQuestionnaire['employmentStatus']; label: string }> = [
  { value: 'employed', label: 'Dependiente' },
  { value: 'freelance', label: 'Independiente' },
  { value: 'employed_freelance', label: 'Dependiente + independiente' },
  { value: 'student', label: 'Estudiante' },
  { value: 'employed_student', label: 'Estudiante + trabajo' },
  { value: 'freelance_student', label: 'Independiente + estudiante' },
  { value: 'employed_freelance_student', label: 'Tres roles' },
  { value: 'unemployed', label: 'Sin trabajo' },
];

const COVERAGE_OPTIONS: Array<{ value: IntakeQuestionnaire['expensesCoverage']; label: string }> = [
  { value: 'surplus', label: 'Me sobra' },
  { value: 'tight', label: 'Llego justo' },
  { value: 'sometimes', label: 'A veces no alcanza' },
  { value: 'no', label: 'No alcanza' },
];

const TRACKING_OPTIONS: Array<{ value: IntakeQuestionnaire['tracksExpenses']; label: string }> = [
  { value: 'yes', label: 'Sí, siempre' },
  { value: 'sometimes', label: 'A veces' },
  { value: 'no', label: 'No registro' },
];

type QuestionnaireEditFormProps = {
  intake: IntakeQuestionnaire;
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onSave: (next: IntakeQuestionnaire) => void;
};

export function QuestionnaireEditForm(props: QuestionnaireEditFormProps) {
  const [form, setForm] = useState<IntakeQuestionnaire>(props.intake);

  useEffect(() => {
    setForm(props.intake);
  }, [props.intake]);

  const update = <K extends keyof IntakeQuestionnaire>(key: K, value: IntakeQuestionnaire[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  return (
    <div className="questionnaire-edit-form">
      <p className="questionnaire-edit-note">
        Actualizar tu cuestionario es gratuito y no consume Fincoins. Los cambios alinean el contexto
        del agente con tus respuestas más recientes.
      </p>

      <div className="questionnaire-edit-grid">
        <label className="questionnaire-edit-field">
          <span>Situación laboral</span>
          <select
            value={form.employmentStatus}
            onChange={(event) =>
              update('employmentStatus', event.target.value as IntakeQuestionnaire['employmentStatus'])
            }
          >
            {EMPLOYMENT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="questionnaire-edit-field">
          <span>Profesión</span>
          <input
            type="text"
            value={form.profession ?? ''}
            onChange={(event) => update('profession', event.target.value)}
            placeholder="Ej. Ingeniera comercial"
          />
        </label>

        <label className="questionnaire-edit-field">
          <span>Ingreso mensual (rango)</span>
          <select
            value={form.incomeBand}
            onChange={(event) =>
              update('incomeBand', event.target.value as IntakeQuestionnaire['incomeBand'])
            }
          >
            {INCOME_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="questionnaire-edit-field">
          <span>Ingreso exacto (opcional)</span>
          <input
            type="number"
            min={0}
            value={form.exactMonthlyIncome ?? ''}
            onChange={(event) =>
              update(
                'exactMonthlyIncome',
                event.target.value ? Number(event.target.value) : undefined,
              )
            }
            placeholder="Monto en CLP"
          />
        </label>

        <label className="questionnaire-edit-field">
          <span>Cobertura de gastos</span>
          <select
            value={form.expensesCoverage}
            onChange={(event) =>
              update('expensesCoverage', event.target.value as IntakeQuestionnaire['expensesCoverage'])
            }
          >
            {COVERAGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="questionnaire-edit-field">
          <span>Control de gastos</span>
          <select
            value={form.tracksExpenses}
            onChange={(event) =>
              update('tracksExpenses', event.target.value as IntakeQuestionnaire['tracksExpenses'])
            }
          >
            {TRACKING_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="questionnaire-edit-field questionnaire-edit-field--inline">
          <span>¿Tienes deuda activa?</span>
          <div className="questionnaire-edit-toggle-row">
            <button
              type="button"
              className={`questionnaire-edit-toggle${form.hasDebt ? ' is-active' : ''}`}
              onClick={() => update('hasDebt', true)}
            >
              Sí
            </button>
            <button
              type="button"
              className={`questionnaire-edit-toggle${!form.hasDebt ? ' is-active' : ''}`}
              onClick={() => update('hasDebt', false)}
            >
              No
            </button>
          </div>
        </fieldset>

        <fieldset className="questionnaire-edit-field questionnaire-edit-field--inline">
          <span>¿Tienes ahorro o inversión?</span>
          <div className="questionnaire-edit-toggle-row">
            <button
              type="button"
              className={`questionnaire-edit-toggle${form.hasSavingsOrInvestments ? ' is-active' : ''}`}
              onClick={() => update('hasSavingsOrInvestments', true)}
            >
              Sí
            </button>
            <button
              type="button"
              className={`questionnaire-edit-toggle${!form.hasSavingsOrInvestments ? ' is-active' : ''}`}
              onClick={() => update('hasSavingsOrInvestments', false)}
            >
              No
            </button>
          </div>
        </fieldset>

        <label className="questionnaire-edit-field">
          <span>Comprensión financiera ({form.selfRatedUnderstanding}/10)</span>
          <input
            type="range"
            min={0}
            max={10}
            value={form.selfRatedUnderstanding}
            onChange={(event) => update('selfRatedUnderstanding', Number(event.target.value))}
          />
        </label>

        <label className="questionnaire-edit-field">
          <span>Estrés financiero ({form.moneyStressLevel}/10)</span>
          <input
            type="range"
            min={0}
            max={10}
            value={form.moneyStressLevel}
            onChange={(event) => update('moneyStressLevel', Number(event.target.value))}
          />
        </label>
      </div>

      <div className="questionnaire-edit-preview">
        <span className="questionnaire-kpi-label">Vista previa</span>
        <p>
          Ingreso: {localizeDisplayValue(form.incomeBand, 'incomeBand')} · Deuda:{' '}
          {form.hasDebt ? 'Sí' : 'No'} · Cobertura:{' '}
          {localizeDisplayValue(form.expensesCoverage, 'expensesCoverage')}
        </p>
      </div>

      {props.error ? (
        <p className="questionnaire-edit-error" role="alert">
          {props.error}
        </p>
      ) : null}

      <div className="questionnaire-edit-actions">
        <button type="button" className="questionnaire-edit-btn is-secondary" onClick={props.onCancel}>
          Cancelar
        </button>
        <button
          type="button"
          className="questionnaire-edit-btn is-primary"
          disabled={props.saving}
          onClick={() => props.onSave(form)}
        >
          {props.saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  );
}

export function coerceIntakeQuestionnaire(raw: Record<string, unknown> | null): IntakeQuestionnaire | null {
  if (!raw || typeof raw !== 'object') return null;
  const knowledge = raw.financialKnowledge;
  if (!knowledge || typeof knowledge !== 'object' || Array.isArray(knowledge)) return null;
  if (typeof raw.employmentStatus !== 'string' || typeof raw.incomeBand !== 'string') return null;
  if (typeof raw.expensesCoverage !== 'string' || typeof raw.tracksExpenses !== 'string') return null;
  if (typeof raw.hasDebt !== 'boolean' || typeof raw.hasSavingsOrInvestments !== 'boolean') return null;
  if (typeof raw.riskReaction !== 'string') return null;
  if (typeof raw.selfRatedUnderstanding !== 'number' || typeof raw.moneyStressLevel !== 'number') {
    return null;
  }

  return {
    age: typeof raw.age === 'number' ? raw.age : undefined,
    city: typeof raw.city === 'string' ? raw.city : undefined,
    employmentStatus: raw.employmentStatus as IntakeQuestionnaire['employmentStatus'],
    profession: typeof raw.profession === 'string' ? raw.profession : undefined,
    incomeBand: raw.incomeBand as IntakeQuestionnaire['incomeBand'],
    exactMonthlyIncome:
      typeof raw.exactMonthlyIncome === 'number' ? raw.exactMonthlyIncome : undefined,
    expensesCoverage: raw.expensesCoverage as IntakeQuestionnaire['expensesCoverage'],
    tracksExpenses: raw.tracksExpenses as IntakeQuestionnaire['tracksExpenses'],
    hasSavingsOrInvestments: raw.hasSavingsOrInvestments,
    savingsBand:
      typeof raw.savingsBand === 'string'
        ? (raw.savingsBand as IntakeQuestionnaire['savingsBand'])
        : undefined,
    exactSavingsAmount:
      typeof raw.exactSavingsAmount === 'number' ? raw.exactSavingsAmount : undefined,
    hasDebt: raw.hasDebt,
    financialKnowledge: knowledge as IntakeQuestionnaire['financialKnowledge'],
    riskReaction: raw.riskReaction as IntakeQuestionnaire['riskReaction'],
    riskReactionOther:
      typeof raw.riskReactionOther === 'string' ? raw.riskReactionOther : undefined,
    selfRatedUnderstanding: raw.selfRatedUnderstanding,
    moneyStressLevel: raw.moneyStressLevel,
  };
}
