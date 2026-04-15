'use client';
import type { IntakeQuestionnaire } from '@financial-agent/shared/src/intake/intake-questionnaire.types';

type FinancialKnowledgeKey = keyof IntakeQuestionnaire['financialKnowledge'];

const KNOWLEDGE_GROUPS: { title: string; keys: { key: FinancialKnowledgeKey; label: string }[] }[] = [
  {
    title: 'Créditos y deudas',
    keys: [
      { key: 'interest', label: 'Cómo se calculan los intereses' },
      { key: 'CAE', label: 'Carga Anual Equivalente (CAE)' },
      { key: 'creditCard', label: 'Funcionamiento tarjeta de crédito' },
      { key: 'creditLine', label: 'Línea de crédito' },
      { key: 'loanComponents', label: 'Componentes de un crédito' },
      { key: 'interestRate', label: 'Tasa nominal vs real' },
    ],
  },
  {
    title: 'Economía personal',
    keys: [
      { key: 'inflation', label: 'Inflación y UF' },
      { key: 'liquidity', label: 'Liquidez' },
      { key: 'assetVsLiability', label: 'Activos vs pasivos' },
      { key: 'financialRisk', label: 'Riesgo financiero' },
    ],
  },
  {
    title: 'Inversión y mercado',
    keys: [
      { key: 'returnConcept', label: 'Riesgo y retorno' },
      { key: 'diversification', label: 'Diversificación' },
      { key: 'capitalMarkets', label: 'Mercados de capitales' },
      { key: 'alternativeInvestments', label: 'Inversiones alternativas' },
      { key: 'fintech', label: 'Fintech y Open Finance' },
    ],
  },
];

const RISK_OPTIONS: { value: IntakeQuestionnaire['riskReaction']; label: string; sub: string }[] = [
  { value: 'sell', label: 'Vendo todo', sub: 'Evito seguir perdiendo' },
  { value: 'hold', label: 'Espero', sub: 'No hago nada por ahora' },
  { value: 'buy_more', label: 'Compro más', sub: 'Es una oportunidad' },
  { value: 'never_invest', label: 'No invierto', sub: 'No es para mí' },
];

export function KnowledgeStep({
  form,
  update,
  onSubmit,
  loading,
  onBack,
}: {
  form: IntakeQuestionnaire;
  update: <K extends keyof IntakeQuestionnaire>(key: K, value: IntakeQuestionnaire[K]) => void;
  onSubmit: () => void;
  loading: boolean;
  onBack: () => void;
}) {
  const knowledge = form.financialKnowledge ?? ({} as IntakeQuestionnaire['financialKnowledge']);

  const toggle = (key: FinancialKnowledgeKey) => {
    update('financialKnowledge', { ...knowledge, [key]: !knowledge[key] });
  };

  const totalSelected = Object.values(knowledge).filter(Boolean).length;

  return (
    <div className="intake-step animate-intake-in">
      <div className="intake-step-header">
        <span className="intake-step-tag">Conocimiento y perfil de riesgo</span>
        <h2 className="intake-step-title">Lo último: cómo piensas</h2>
        <p className="intake-step-subtitle">
          Tu nivel de conocimiento y tu relación con el riesgo permiten
          al asesor calibrar el lenguaje y las recomendaciones.
          No hay respuestas correctas o incorrectas.
        </p>
      </div>

      <div className="intake-question-block">
        <label className="intake-question-label">
          ¿Qué conceptos financieros manejas?
          {totalSelected > 0 && <span className="intake-badge">{totalSelected} seleccionados</span>}
        </label>
        {KNOWLEDGE_GROUPS.map((group) => (
          <div key={group.title} className="intake-knowledge-group">
            <div className="intake-knowledge-group-title">{group.title}</div>
            <div className="intake-chips intake-chips-wrap">
              {group.keys.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  className={`intake-chip intake-chip-sm${knowledge[key] ? ' is-selected' : ''}`}
                  onClick={() => toggle(key)}
                >
                  {knowledge[key] ? '✓ ' : ''}{label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="intake-question-block">
        <label className="intake-question-label">Tu inversión cae 30% en un mes. ¿Qué haces?</label>
        <div className="intake-chips intake-chips-grid">
          {RISK_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`intake-chip intake-chip-wide${form.riskReaction === opt.value ? ' is-selected' : ''}`}
              onClick={() => update('riskReaction', opt.value)}
            >
              <span className="intake-chip-main">{opt.label}</span>
              <span className="intake-chip-sub">{opt.sub}</span>
            </button>
          ))}
        </div>
        {form.riskReaction === 'never_invest' && (
          <div className="animate-intake-in">
            <input
              className="intake-input intake-input-sm"
              placeholder="¿Qué te genera ese rechazo a invertir? (opcional)"
              value={form.riskReactionOther ?? ''}
              onChange={(e) => update('riskReactionOther', e.target.value)}
            />
          </div>
        )}
      </div>

      <div className="intake-question-block intake-sliders-block">
        <div className="intake-slider-row">
          <div className="intake-slider-labels">
            <label className="intake-question-label-sm">¿Qué tan sólida sientes que es tu comprensión financiera?</label>
            <span className="intake-slider-value">{form.selfRatedUnderstanding}<span className="intake-slider-max">/10</span></span>
          </div>
          <input
            type="range"
            min={0}
            max={10}
            value={form.selfRatedUnderstanding}
            onChange={(e) => update('selfRatedUnderstanding', Number(e.target.value))}
            className="intake-range"
          />
          <div className="intake-range-labels">
            <span>Básica</span>
            <span>Experto</span>
          </div>
        </div>

        <div className="intake-slider-row">
          <div className="intake-slider-labels">
            <label className="intake-question-label-sm">¿Cuánto estrés te genera tu situación financiera hoy?</label>
            <span className="intake-slider-value">{form.moneyStressLevel}<span className="intake-slider-max">/10</span></span>
          </div>
          <input
            type="range"
            min={0}
            max={10}
            value={form.moneyStressLevel}
            onChange={(e) => update('moneyStressLevel', Number(e.target.value))}
            className="intake-range intake-range-stress"
          />
          <div className="intake-range-labels">
            <span>Sin estrés</span>
            <span>Muy estresado</span>
          </div>
        </div>
      </div>

      <div className="intake-footer">
        <button className="intake-back-btn" onClick={onBack}>← Volver</button>
        <button
          className="intake-submit-btn"
          type="button"
          onClick={onSubmit}
          disabled={loading}
        >
          {loading ? (
            <span className="intake-loading">
              <span className="intake-dot" /><span className="intake-dot" /><span className="intake-dot" />
              Preparando tu perfil
            </span>
          ) : (
            <>Comenzar mi asesoría personalizada →</>
          )}
        </button>
      </div>
    </div>
  );
}
