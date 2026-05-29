'use client';
import { useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { IntakeQuestionnaire } from '@financial-agent/shared/src/intake/intake-questionnaire.types';
import { balancedColumns } from './layout';

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

function getStressFillColor(v: number): string {
  if (v <= 3) return '124, 160, 170';
  if (v <= 6) return '182, 162, 116';
  return '172, 118, 130';
}

function PremiumSlider({
  value,
  onChange,
  fillColor,
  label,
  id,
}: {
  value: number;
  onChange: (v: number) => void;
  fillColor: string;
  label: string;
  id: string;
}) {
  const pct = (value / 10) * 100;
  const wrapRef = useRef<HTMLDivElement>(null);

  const setFromClientX = (clientX: number) => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    onChange(Math.round(ratio * 10));
  };

  return (
    <div
      ref={wrapRef}
      className="intake-track-slider-wrapper"
      role="slider"
      tabIndex={0}
      aria-labelledby={id}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={10}
      aria-valuenow={value}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setFromClientX(e.clientX);
      }}
      onPointerMove={(e) => {
        if (e.buttons === 1) setFromClientX(e.clientX);
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); onChange(Math.min(10, value + 1)); }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); onChange(Math.max(0, value - 1)); }
      }}
    >
      <div className="intake-track-rail" aria-hidden>
        <div
          className="intake-track-fill"
          style={{
            width: `${pct}%`,
            background: `rgba(${fillColor}, 0.85)`,
            boxShadow: `0 0 10px rgba(${fillColor}, 0.40)`,
          }}
        />
        <div
          className="intake-track-dot"
          style={{
            left: `${pct}%`,
            boxShadow: `0 0 0 5px rgba(${fillColor}, 0.18), 0 2px 14px rgba(0,0,0,0.40)`,
          }}
        />
      </div>
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

  const GROUP_COUNT = KNOWLEDGE_GROUPS.length;
  const totalQuestions = GROUP_COUNT + 3;
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
      <div className="intake-qnav">
        <p className="intake-question-progress">Pregunta {questionIndex + 1} de {totalQuestions}</p>
        <button
          className="intake-nav-arrow intake-qnav-back"
          onClick={onBackQuestion}
          type="button"
          aria-label="Anterior"
        >
          ←
        </button>
        <button
          className="intake-nav-arrow intake-qnav-next"
          onClick={onNextQuestion}
          type="button"
          aria-label={isLast ? 'Comenzar mi asesoría' : 'Siguiente'}
          disabled={loading}
        >
          {loading ? (
            <span className="intake-loading">
              <span className="intake-dot" /><span className="intake-dot" /><span className="intake-dot" />
            </span>
          ) : (
            '→'
          )}
        </button>
      </div>

      {questionIndex < GROUP_COUNT && (() => {
        const group = KNOWLEDGE_GROUPS[questionIndex];
        const groupSelected = group.keys.filter(({ key }) => knowledge[key]).length;
        return (
          <div className="intake-question-block intake-question-screen animate-intake-in">
            <label className="intake-question-label">
              ¿Qué manejas sobre <span className="kw-wine">{group.title.toLowerCase()}</span>?
              {groupSelected > 0 && <span className="intake-badge">{groupSelected} seleccionados</span>}
            </label>
            <p className="intake-question-hint">Marca los que conozcas. Si no manejas ninguno, continúa sin seleccionar.</p>
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
        );
      })()}

      {questionIndex === GROUP_COUNT && (
        <div className="intake-question-block intake-question-screen animate-intake-in">
          <label className="intake-question-label">
            Tu inversión <span className="kw-wine">cae 30%</span> en un mes. ¿Qué haces?
          </label>
          <div className="intake-chips intake-chips-grid" style={{ '--intake-cols': balancedColumns(RISK_OPTIONS.length) } as CSSProperties}>
            {RISK_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`intake-chip intake-chip-wide${form.riskReaction === opt.value ? ' is-selected' : ''}`}
                onClick={() => {
                  update('riskReaction', opt.value);
                  if (opt.value !== 'never_invest') {
                    setTimeout(() => onNextQuestion(), 120);
                  }
                }}
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

      {questionIndex === GROUP_COUNT + 1 && (
        <div className="intake-question-block intake-question-screen animate-intake-in">
          <label id="understanding-slider" className="intake-question-label-sm">
            ¿Qué tan sólida sientes que es tu <span className="kw-blue">comprensión financiera</span>?
          </label>
          <div className="intake-premium-slider-block">
            <div className="intake-slider-meta">
              <div className="intake-slider-number-group">
                <span className="intake-slider-number intake-slider-number--blue">{form.selfRatedUnderstanding}</span>
                <span className="intake-slider-denom">/10</span>
              </div>
              <span className="intake-slider-dynamic-label">{getKnowledgeLabel(form.selfRatedUnderstanding)}</span>
            </div>
            <PremiumSlider
              value={form.selfRatedUnderstanding}
              onChange={(v) => update('selfRatedUnderstanding', v)}
              fillColor="116, 146, 180"
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

      {questionIndex === GROUP_COUNT + 2 && (
        <div className="intake-question-block intake-question-screen animate-intake-in">
          <label id="stress-slider" className="intake-question-label-sm">
            ¿Cuánto <span className="kw-wine">estrés</span> te genera tu situación financiera hoy?
          </label>
          <div className="intake-premium-slider-block">
            <div className="intake-slider-meta">
              <div className="intake-slider-number-group">
                <span
                  className="intake-slider-number intake-slider-number--stress"
                  style={{
                    color: form.moneyStressLevel <= 3
                      ? 'rgb(124,160,170)'
                      : form.moneyStressLevel <= 6
                        ? 'rgb(182,162,116)'
                        : 'rgb(172,118,130)',
                  }}
                >
                  {form.moneyStressLevel}
                </span>
                <span className="intake-slider-denom">/10</span>
              </div>
              <span className="intake-slider-dynamic-label">{getStressLabel(form.moneyStressLevel)}</span>
            </div>
            <PremiumSlider
              value={form.moneyStressLevel}
              onChange={(v) => update('moneyStressLevel', v)}
              fillColor={getStressFillColor(form.moneyStressLevel)}
              label="Nivel de estrés financiero"
              id="stress-slider"
            />
            <div className="intake-range-labels">
              <span>Sin estrés</span>
              <span>Muy alto</span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
