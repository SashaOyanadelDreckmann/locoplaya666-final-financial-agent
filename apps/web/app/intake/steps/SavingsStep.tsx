'use client';
import type { IntakeQuestionnaire } from '@financial-agent/shared/src/intake/intake-questionnaire.types';

const SAVINGS_BAND_OPTIONS: { value: IntakeQuestionnaire['savingsBand']; label: string }[] = [
  { value: '<300k', label: 'Menos de $300k' },
  { value: '300k-1M', label: '$300k – $1M' },
  { value: '1M-3M', label: '$1M – $3M' },
  { value: '3M-10M', label: '$3M – $10M' },
  { value: '>10M', label: 'Más de $10M' },
];

export function SavingsStep({
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
  const ready =
    form.hasSavingsOrInvestments === false ||
    (form.hasSavingsOrInvestments === true && !!form.savingsBand);

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

      <div className="intake-question-block">
        <label className="intake-question-label">¿Tienes ahorros o dinero invertido?</label>
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
                  onClick={() => update('savingsBand', opt.value)}
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

      <div className="intake-question-block">
        <label className="intake-question-label">¿Tienes deudas o compromisos financieros activos?</label>
        <p className="intake-question-hint">Tarjeta de crédito, crédito de consumo, hipotecario, cuotas, etc.</p>
        <div className="intake-chips">
          <button
            type="button"
            className={`intake-chip intake-chip-yesno${form.hasDebt === true ? ' is-selected is-caution' : ''}`}
            onClick={() => update('hasDebt', true)}
          >
            Sí, tengo deudas
          </button>
          <button
            type="button"
            className={`intake-chip intake-chip-yesno${form.hasDebt === false ? ' is-selected' : ''}`}
            onClick={() => update('hasDebt', false)}
          >
            Sin deudas activas
          </button>
        </div>
        {form.hasDebt && (
          <p className="intake-debt-note animate-intake-in">
            En el siguiente paso agregarás el detalle de tus productos financieros.
          </p>
        )}
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
