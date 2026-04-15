'use client';

import { useMemo, useState } from 'react';
import type { AgentBlock } from '@/lib/types/chat';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  AreaChart,
  Area,
} from 'recharts';

type AgentBlocksRendererProps = {
  blocks?: AgentBlock[];
  onQuestionnaireSubmit?: (payload: {
    questionnaireId: string;
    message: string;
    answers: Array<{ questionId: string; question: string; answer: string }>;
  }) => void;
};

type QuestionnaireQuestion = {
  id: string;
  question: string;
  choices: string[];
  allow_free_text?: boolean;
  free_text_placeholder?: string;
  required?: boolean;
};

function QuestionnaireBlockView(props: {
  questionnaire: {
    id: string;
    title?: string;
    submit_label?: string;
    questions: QuestionnaireQuestion[];
  };
  onSubmit?: AgentBlocksRendererProps['onQuestionnaireSubmit'];
}) {
  const { questionnaire, onSubmit } = props;
  const [selectedChoices, setSelectedChoices] = useState<Record<string, string>>({});
  const [freeTexts, setFreeTexts] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const answers = useMemo(() => {
    return questionnaire.questions.map((q) => {
      const choice = selectedChoices[q.id]?.trim() ?? '';
      const custom = freeTexts[q.id]?.trim() ?? '';
      const answer = choice || custom;
      return { questionId: q.id, question: q.question, answer, required: q.required !== false };
    });
  }, [questionnaire.questions, selectedChoices, freeTexts]);

  const readyToSubmit = answers.every((a) => (a.required ? a.answer.length > 0 : true));

  const buildMessage = () => {
    const lines = [
      `Respuestas al formulario: ${questionnaire.title ?? questionnaire.id}`,
      ...answers.map((a, idx) => `${idx + 1}) ${a.question}: ${a.answer || 'Sin respuesta'}`),
    ];
    return lines.join('\n');
  };

  const submit = () => {
    if (submitted || !readyToSubmit) return;
    const payloadAnswers = answers.map((a) => ({
      questionId: a.questionId,
      question: a.question,
      answer: a.answer,
    }));
    onSubmit?.({
      questionnaireId: questionnaire.id,
      message: buildMessage(),
      answers: payloadAnswers,
    });
    setSubmitted(true);
  };

  return (
    <section className="agent-block agent-questionnaire-block">
      <h4>{questionnaire.title ?? 'Responde para continuar'}</h4>
      <div className="agent-questionnaire-list">
        {questionnaire.questions.map((q, idx) => (
          <div key={q.id} className="agent-question-item">
            <p className="agent-question-text">
              {idx + 1}. {q.question}
            </p>
            <div className="agent-question-choices">
              {q.choices.slice(0, 4).map((choice) => (
                <button
                  key={choice}
                  type="button"
                  className={`agent-question-choice${
                    selectedChoices[q.id] === choice ? ' is-selected' : ''
                  }`}
                  onClick={() =>
                    setSelectedChoices((prev) => ({
                      ...prev,
                      [q.id]: choice,
                    }))
                  }
                  disabled={submitted}
                >
                  {choice}
                </button>
              ))}
            </div>
            {(q.allow_free_text ?? true) && (
              <input
                className="agent-question-input"
                placeholder={q.free_text_placeholder ?? 'Otro (escribe aquí)'}
                value={freeTexts[q.id] ?? ''}
                onChange={(e) =>
                  setFreeTexts((prev) => ({
                    ...prev,
                    [q.id]: e.target.value,
                  }))
                }
                disabled={submitted}
              />
            )}
          </div>
        ))}
      </div>
      <div className="agent-questionnaire-actions">
        <button
          type="button"
          className="agent-questionnaire-submit"
          onClick={submit}
          disabled={!readyToSubmit || submitted}
        >
          {submitted
            ? 'Enviado'
            : questionnaire.submit_label ?? 'Enviar respuestas'}
        </button>
      </div>
    </section>
  );
}

export function AgentBlocksRenderer({ blocks = [], onQuestionnaireSubmit }: AgentBlocksRendererProps) {
  if (!blocks.length) return null;

  const formatValue = (value: number | string, format?: 'currency' | 'percentage' | 'number', currency?: string) => {
    if (typeof value !== 'number') return String(value);
    if (format === 'currency') {
      return new Intl.NumberFormat('es-CL', {
        style: 'currency',
        currency: currency || 'CLP',
        maximumFractionDigits: 0,
      }).format(value);
    }
    if (format === 'percentage') {
      return `${value.toFixed(2)}%`;
    }
    return new Intl.NumberFormat('es-CL').format(value);
  };

  const generateChartLabel = (chart: any): string => {
    return `Gráfico: ${chart.title}${chart.subtitle ? ' — ' + chart.subtitle : ''}`;
  };

  const generateChartDescription = (chart: any): string => {
    if (!chart.data || chart.data.length === 0) {
      return `Este gráfico muestra ${chart.title}.`;
    }
    const points = chart.data
      .slice(0, 3)
      .map((d: any) => `${d[chart.xKey]}: ${formatValue(d[chart.yKey], chart.format, chart.currency)}`)
      .join(', ');
    return `Este gráfico muestra ${chart.title}. Valores principales: ${points}${chart.data.length > 3 ? '...' : ''}.`;
  };

  return (
    <div className="agent-blocks-renderer">
      {blocks.map((block, idx) => {
        if (block.type === 'document') {
          return (
            <section key={idx} className="agent-block" role="region" aria-label={`Documento: ${block.title ?? 'Documento'}`}>
              <h4>{block.title ?? 'Documento'}</h4>
              {(block.sections ?? []).map((s, i) => (
                <div key={i}>
                  <strong>{s.heading}</strong>
                  <p>{s.content}</p>
                </div>
              ))}
            </section>
          );
        }

        if (block.type === 'chart') {
          const { chart } = block;
          const chartDescId = `chart-desc-${idx}`;
          return (
            <section key={idx} className="agent-block agent-chart-block">
              <h4>{chart.title}</h4>
              {chart.subtitle ? <p>{chart.subtitle}</p> : null}
              <div
                className="agent-chart-canvas"
                role="img"
                aria-label={generateChartLabel(chart)}
                aria-describedby={chartDescId}
              >
                <ResponsiveContainer width="100%" height={220}>
                  {chart.kind === 'bar' ? (
                    <BarChart data={chart.data}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                      <XAxis dataKey={chart.xKey} tick={{ fill: '#93a0b3', fontSize: 11 }} />
                      <YAxis tick={{ fill: '#93a0b3', fontSize: 11 }} />
                      <Tooltip
                        formatter={(value) => formatValue(value as number | string, chart.format, chart.currency)}
                        contentStyle={{
                          background: '#0f1420',
                          border: '1px solid rgba(148,163,184,0.25)',
                          borderRadius: 10,
                        }}
                      />
                      <Bar dataKey={chart.yKey} fill="#3b82f6" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  ) : chart.kind === 'area' ? (
                    <AreaChart data={chart.data}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                      <XAxis dataKey={chart.xKey} tick={{ fill: '#93a0b3', fontSize: 11 }} />
                      <YAxis tick={{ fill: '#93a0b3', fontSize: 11 }} />
                      <Tooltip
                        formatter={(value) => formatValue(value as number | string, chart.format, chart.currency)}
                        contentStyle={{
                          background: '#0f1420',
                          border: '1px solid rgba(148,163,184,0.25)',
                          borderRadius: 10,
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey={chart.yKey}
                        stroke="#22c55e"
                        fill="rgba(34,197,94,0.2)"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  ) : (
                    <LineChart data={chart.data}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                      <XAxis dataKey={chart.xKey} tick={{ fill: '#93a0b3', fontSize: 11 }} />
                      <YAxis tick={{ fill: '#93a0b3', fontSize: 11 }} />
                      <Tooltip
                        formatter={(value) => formatValue(value as number | string, chart.format, chart.currency)}
                        contentStyle={{
                          background: '#0f1420',
                          border: '1px solid rgba(148,163,184,0.25)',
                          borderRadius: 10,
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey={chart.yKey}
                        stroke="#60a5fa"
                        strokeWidth={2.5}
                        dot={{ r: 3, fill: '#60a5fa' }}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  )}
                </ResponsiveContainer>
              </div>
              <p className="agent-chart-footnote">
                Eje X: <strong>{chart.xKey}</strong> · Eje Y: <strong>{chart.yKey}</strong>
              </p>
              <div id={chartDescId} className="sr-only">
                {generateChartDescription(chart)}
              </div>
            </section>
          );
        }

        if (block.type === 'table') {
          const tableId = `table-${idx}`;
          return (
            <section key={idx} className="agent-block agent-table-block" role="region" aria-label={`Tabla: ${block.table.title}`}>
              <h4 id={`table-title-${idx}`}>{block.table.title}</h4>
              <div className="agent-table-wrap">
              <table className="agent-table" aria-labelledby={`table-title-${idx}`}>
                <thead>
                  <tr>
                    {block.table.headers.map((h, i) => (
                      <th key={i} scope="col">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.table.rows.map((r, i) => (
                    <tr key={i}>
                      {r.map((c, j) => (
                        <td key={j}>{c}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              {block.table.note ? <p className="agent-table-note">{block.table.note}</p> : null}
            </section>
          );
        }

        if (block.type === 'questionnaire') {
          return (
            <QuestionnaireBlockView
              key={idx}
              questionnaire={block.questionnaire}
              onSubmit={onQuestionnaireSubmit}
            />
          );
        }

        return null;
      })}
    </div>
  );
}
