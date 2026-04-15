'use client';
import type { IntakeQuestionnaire } from '@financial-agent/shared/src/intake/intake-questionnaire.types';

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

export function CashflowStep({
  form,
  update,
  onNext,
  onBack,
}: {
  form: IntakeQuestionnaire;
  update: <K extends keyof IntakeQuestionnaire>(key: K, value: IntakeQuestionnaire[K]) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const ready = !!form.incomeBand && !!form.expensesCoverage && !!form.tracksExpenses;

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

      <div className="intake-question-block">
        <label className="intake-question-label">¿Cuánto ingresas al mes, aproximadamente?</label>
        <div className="intake-chips intake-chips-grid">
          {INCOME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`intake-chip intake-chip-wide${form.incomeBand === opt.value ? ' is-selected' : ''}`}
              onClick={() => update('incomeBand', opt.value)}
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
      </div>

      <div className="intake-question-block">
        <label className="intake-question-label">¿Tus ingresos cubren tus gastos mensuales?</label>
        <div className="intake-chips">
          {COVERAGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`intake-chip intake-chip-wide${form.expensesCoverage === opt.value ? ' is-selected' : ''}`}
              onClick={() => update('expensesCoverage', opt.value)}
            >
              <span className="intake-chip-main">{opt.label}</span>
              <span className="intake-chip-sub">{opt.sub}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="intake-question-block">
        <label className="intake-question-label">¿Registras o monitoreas tus gastos?</label>
        <div className="intake-chips">
          {TRACKING_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`intake-chip${form.tracksExpenses === opt.value ? ' is-selected' : ''}`}
              onClick={() => update('tracksExpenses', opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="intake-footer">
        <button className="intake-back-btn" onClick={onBack}>← Volver</button>
        {ready && (
          <button className="intake-next-btn" onClick={onNext}>
            Continuar <span className="intake-next-arrow">→</span>
          </button>
        )}
      </div>
    </div>
  );
}
