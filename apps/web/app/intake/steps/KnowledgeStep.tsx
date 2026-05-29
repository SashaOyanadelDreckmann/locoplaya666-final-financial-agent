'use client';
import { useState } from 'react';
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

function getKnowledgeLabel(v: number): string {
  if (v <= 2) return 'En desarrollo';
  if (v <= 4) return 'Básico';
  if (v <= 6) return 'Intermedio';
  if (v <= 8) return 'Avanzado';
  return 'Experto';
}

function getStressLabel(v: number): string {
  if (v <= 2) return 'Sin estrés';
  if (v <= 4) return 'Algo presente';
  if (v <= 6) return 'Moderado';
  if (v <= 8) return 'Significativo';
  return 'Muy alto';
}

function getKnowledgeSegColor(i: number, value: number): string {
  if (i > value) return 'rgba(255,255,255,0.07)';
  const intensity = 0.45 + (i / 10) * 0.55;
  return `rgba(44, 111, 172, ${intensity.toFixed(2)})`;
}

function getStressSegColor(i: number, value: number): string {
  if (i > value) return 'rgba(255,255,255,0.07)';
  if (i <= 3) return 'rgba(89, 176, 196, 0.88)';
  if (i <= 6) return 'rgba(201, 168, 64, 0.88)';
  return 'rgba(139, 26, 43, 0.92)';
}

function SegmentedSlider({
  value,
  onChange,
  colorFn,
  label,
  id,
}: {
  value: number;
  onChange: (v: number) => void;
  colorFn: (i: number, value: number) => string;
  label: string;
  id: string;
}) {
  return (
    <div className="intake-seg-slider-wrapper" role="group" aria-labelledby={id}>
      <div className="intake-seg-bar" aria-hidden>
        {Array.from({ length: 11 }, (_, i) => {
          const height = 35 + (i / 10) * 65;
          return (
            <div
              key={i}
              className="intake-seg-bar-item"
              style={{
                height: `${height}%`,
                backgroundColor: colorFn(i, value),
                transition: 'background-color 0.18s ease',
              }}
            />
          );
        })}
      </div>
      <input
        type="range"
        min={0}
        max={10}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="intake-range-overlay"
        aria-label={label}
        id={id}
      />
    </div>
  );
}

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
  const [questionIndex, setQuestionIndex] = useState(0);
  const knowledge = form.financialKnowledge ?? ({} as IntakeQuestionnaire['financialKnowledge']);

  const toggle = (key: FinancialKnowledgeKey) => {
    update('financialKnowledge', { ...knowledge, [key]: !knowledge[key] });
  };

  const totalSelected = Object.values(knowledge).filter(Boolean).length;
  const totalQuestions = 4;
  const isLast = questionIndex === totalQuestions - 1;

  const onNextQuestion = () => {
    if (isLast) {
      onSubmit();
      return;
    }
    setQuestionIndex((prev) => Math.min(prev + 1, totalQuestions - 1));
  };

  const onBackQuestion = () => {
    if (questionIndex === 0) {
      onBack();
      return;
    }
    setQuestionIndex((prev) => Math.max(prev - 1, 0));
  };

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
      <p className="intake-question-progress">Pregunta {questionIndex + 1} de {totalQuestions}</p>

      {questionIndex === 0 && (
        <div className="intake-question-block intake-question-screen animate-intake-in">
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
      )}

      {questionIndex === 1 && (
        <div className="intake-question-block intake-question-screen animate-intake-in">
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
      )}

      {questionIndex === 2 && (
        <div className="intake-question-block intake-question-screen animate-intake-in">
          <label className="intake-question-label-sm">¿Qué tan sólida sientes que es tu comprensión financiera?</label>
          <div className="intake-premium-slider-block">
            <div className="intake-slider-meta">
              <div className="intake-slider-number-group">
                <span className="intake-slider-number intake-slider-number--blue">{form.selfRatedUnderstanding}</span>
                <span className="intake-slider-denom">/10</span>
              </div>
              <span className="intake-slider-dynamic-label">{getKnowledgeLabel(form.selfRatedUnderstanding)}</span>
            </div>
            <SegmentedSlider
              value={form.selfRatedUnderstanding}
              onChange={(v) => update('selfRatedUnderstanding', v)}
              colorFn={getKnowledgeSegColor}
              label="Nivel de comprensión financiera"
              id="understanding-slider"
            />
            <div className="intake-range-labels">
              <span>Básica</span>
              <span>Experto</span>
            </div>
          </div>
        </div>
      )}

      {questionIndex === 3 && (
        <div className="intake-question-block intake-question-screen animate-intake-in">
          <label className="intake-question-label-sm">¿Cuánto estrés te genera tu situación financiera hoy?</label>
          <div className="intake-premium-slider-block">
            <div className="intake-slider-meta">
              <div className="intake-slider-number-group">
                <span className="intake-slider-number intake-slider-number--stress"
                  style={{ color: form.moneyStressLevel <= 3 ? 'rgba(89,176,196,0.9)' : form.moneyStressLevel <= 6 ? 'rgba(201,168,64,0.9)' : 'rgba(139,26,43,0.9)' }}>
                  {form.moneyStressLevel}
                </span>
                <span className="intake-slider-denom">/10</span>
              </div>
              <span className="intake-slider-dynamic-label">{getStressLabel(form.moneyStressLevel)}</span>
            </div>
            <SegmentedSlider
              value={form.moneyStressLevel}
              onChange={(v) => update('moneyStressLevel', v)}
              colorFn={getStressSegColor}
              label="Nivel de estrés financiero"
              id="stress-slider"
            />
            <div className="intake-range-labels">
              <span>Sin estrés</span>
              <span>Muy estresado</span>
            </div>
          </div>
        </div>
      )}

      <div className="intake-footer">
        <button className="intake-back-btn" onClick={onBackQuestion}>← Anterior</button>
        <button
          className="intake-submit-btn"
          type="button"
          onClick={onNextQuestion}
          disabled={loading}
        >
          {loading ? (
            <span className="intake-loading">
              <span className="intake-dot" /><span className="intake-dot" /><span className="intake-dot" />
              Preparando tu perfil
            </span>
          ) : (
            <>{isLast ? 'Comenzar mi asesoría personalizada →' : 'Siguiente pregunta →'}</>
          )}
        </button>
      </div>
    </div>
  );
}
