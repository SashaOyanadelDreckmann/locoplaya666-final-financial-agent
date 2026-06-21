'use client';

import { useMemo, useState } from 'react';
import {
  resolveQuestionnaireResponseMode,
  type QuestionnaireChatTheme,
} from '@financial-agent/shared';
import type { AgentBlock } from '@/lib/tipos/chat';
import { ChatTableScrollHost } from '@/components/agente/ChatTableScrollHost';
import { TransactionChartBlockRenderer } from '@/components/transacciones/charts/TransactionChartBlockRenderer';
import {
  TX_CHART_MARGIN,
  TX_CHART_X_AXIS_PADDING,
  TX_CHART_Y_AXIS_WIDTH,
} from '@/components/transacciones/charts/transaction-chart-layout';
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
  Cell,
} from 'recharts';
import {
  RETRO_CHART_COLORS,
  RETRO_GRID,
  RETRO_TICK,
  AGENT_CHAT_TOOLTIP_STYLE,
  RetroBarShape,
  RetroDot,
} from '@/components/ui/retro-chart';

type AgentBlocksRendererProps = {
  blocks?: AgentBlock[];
  questionnaireChatTheme?: QuestionnaireChatTheme | null;
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
  response_mode?: 'open_text' | 'choices';
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
  chatTheme?: QuestionnaireChatTheme | null;
  onSubmit?: AgentBlocksRendererProps['onQuestionnaireSubmit'];
}) {
  const { questionnaire, onSubmit, chatTheme = null } = props;
  const [selectedChoices, setSelectedChoices] = useState<Record<string, string>>({});
  const [freeTexts, setFreeTexts] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const questionModes = useMemo(
    () =>
      questionnaire.questions.map((q) =>
        resolveQuestionnaireResponseMode(q.question, q.choices, chatTheme, q.response_mode ?? null),
      ),
    [chatTheme, questionnaire.questions],
  );

  const answers = useMemo(() => {
    return questionnaire.questions.map((q, index) => {
      const openText = questionModes[index] === 'open-text';
      const choice = openText ? '' : (selectedChoices[q.id]?.trim() ?? '');
      const custom = freeTexts[q.id]?.trim() ?? '';
      const answer = choice || custom;
      return { questionId: q.id, question: q.question, answer, required: q.required !== false };
    });
  }, [questionnaire.questions, questionModes, selectedChoices, freeTexts]);

  const readyToSubmit = answers.every((a) => (a.required ? a.answer.length > 0 : true));

  const buildMessage = () => {
    const compactAnswers = answers.map((a, idx) => {
      const safeAnswer = (a.answer || 'Sin respuesta').replace(/\s+/g, ' ').trim().slice(0, 120);
      return `q${idx + 1}=${safeAnswer}`;
    });

    // Keep this payload compact and deterministic to reduce downstream parser failures.
    return [
      'Formulario respondido.',
      `id=${questionnaire.id}`,
      `titulo=${(questionnaire.title ?? 'sin_titulo').replace(/\s+/g, ' ').trim().slice(0, 80)}`,
      `respuestas=${compactAnswers.join('; ')}`,
      'Siguiente paso: entrega diagnóstico y 3 acciones concretas.',
    ].join(' ');
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
    <section
      className={`agent-block agent-questionnaire-block${
        chatTheme ? ` is-chat-${chatTheme}` : ''
      }`}
    >
      <h4>{questionnaire.title ?? 'Responde para continuar'}</h4>
      <div className="agent-questionnaire-list">
        {questionnaire.questions.map((q, idx) => {
          const openText = questionModes[idx] === 'open-text';
          return (
          <div
            key={q.id}
            className={`agent-question-item${openText ? ' is-open-text-question' : ''}`}
          >
            <p className="agent-question-text">
              {idx + 1}. {q.question}
            </p>
            <div className="agent-question-choices">
              {openText ? (
                <input
                  className="agent-question-input-pill"
                  placeholder="(escribir respuesta...)"
                  value={freeTexts[q.id] ?? ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    setFreeTexts((prev) => ({
                      ...prev,
                      [q.id]: value,
                    }));
                  }}
                  disabled={submitted}
                  aria-label={`Respuesta para: ${q.question}`}
                />
              ) : (
                <>
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
                  {(q.allow_free_text ?? true) && (
                    <input
                      className="agent-question-input-inline"
                      placeholder={q.free_text_placeholder ?? 'Otro (escribe aquí)'}
                      value={freeTexts[q.id] ?? ''}
                      onChange={(e) => {
                        const value = e.target.value;
                        setFreeTexts((prev) => ({
                          ...prev,
                          [q.id]: value,
                        }));
                        if (value.trim()) {
                          setSelectedChoices((prev) => {
                            const next = { ...prev };
                            delete next[q.id];
                            return next;
                          });
                        }
                      }}
                      disabled={submitted}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        );
        })}
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

export function AgentBlocksRenderer({
  blocks = [],
  questionnaireChatTheme = null,
  onQuestionnaireSubmit,
}: AgentBlocksRendererProps) {
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

  const getSeriesColor = (index: number) => RETRO_CHART_COLORS[index % RETRO_CHART_COLORS.length];

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

        if (block.type === 'tx_chart') {
          return (
            <section key={idx} className="agent-block agent-tx-chart-block" role="region" aria-label={block.tx_chart.title ?? 'Gráfico de transacciones'}>
              <TransactionChartBlockRenderer block={block} />
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
                    <BarChart data={chart.data} margin={TX_CHART_MARGIN}>
                      <CartesianGrid strokeDasharray="8 8" stroke={RETRO_GRID} />
                      <XAxis
                        dataKey={chart.xKey}
                        tick={RETRO_TICK}
                        axisLine={false}
                        tickLine={false}
                        padding={TX_CHART_X_AXIS_PADDING}
                      />
                      <YAxis tick={RETRO_TICK} axisLine={false} tickLine={false} width={TX_CHART_Y_AXIS_WIDTH} />
                      <Tooltip
                        formatter={(value) => formatValue(value as number | string, chart.format, chart.currency)}
                        contentStyle={AGENT_CHAT_TOOLTIP_STYLE}
                      />
                      <Bar dataKey={chart.yKey} shape={<RetroBarShape />}>
                        {chart.data.map((_: unknown, pointIdx: number) => (
                          <Cell key={`retro-bar-${idx}-${pointIdx}`} fill={getSeriesColor(pointIdx)} />
                        ))}
                      </Bar>
                    </BarChart>
                  ) : chart.kind === 'area' ? (
                    <AreaChart data={chart.data} margin={TX_CHART_MARGIN}>
                      <CartesianGrid strokeDasharray="8 8" stroke={RETRO_GRID} />
                      <XAxis
                        dataKey={chart.xKey}
                        tick={RETRO_TICK}
                        axisLine={false}
                        tickLine={false}
                        padding={TX_CHART_X_AXIS_PADDING}
                      />
                      <YAxis tick={RETRO_TICK} axisLine={false} tickLine={false} width={TX_CHART_Y_AXIS_WIDTH} />
                      <Tooltip
                        formatter={(value) => formatValue(value as number | string, chart.format, chart.currency)}
                        contentStyle={AGENT_CHAT_TOOLTIP_STYLE}
                      />
                      <Area
                        type="stepAfter"
                        dataKey={chart.yKey}
                        stroke={RETRO_CHART_COLORS[2]}
                        fill="rgba(110, 159, 122, 0.26)"
                        strokeWidth={4}
                      />
                    </AreaChart>
                  ) : (
                    <LineChart data={chart.data} margin={TX_CHART_MARGIN}>
                      <CartesianGrid strokeDasharray="8 8" stroke={RETRO_GRID} />
                      <XAxis
                        dataKey={chart.xKey}
                        tick={RETRO_TICK}
                        axisLine={false}
                        tickLine={false}
                        padding={TX_CHART_X_AXIS_PADDING}
                      />
                      <YAxis tick={RETRO_TICK} axisLine={false} tickLine={false} width={TX_CHART_Y_AXIS_WIDTH} />
                      <Tooltip
                        formatter={(value) => formatValue(value as number | string, chart.format, chart.currency)}
                        contentStyle={AGENT_CHAT_TOOLTIP_STYLE}
                      />
                      <Line
                        type="stepAfter"
                        dataKey={chart.yKey}
                        stroke={RETRO_CHART_COLORS[3]}
                        strokeWidth={4}
                        dot={<RetroDot stroke={RETRO_CHART_COLORS[3]} />}
                        activeDot={<RetroDot stroke={RETRO_CHART_COLORS[0]} />}
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
              <ChatTableScrollHost wrapClassName="agent-table-wrap">
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
              </ChatTableScrollHost>
              {block.table.note ? <p className="agent-table-note">{block.table.note}</p> : null}
            </section>
          );
        }

        if (block.type === 'questionnaire') {
          return (
            <QuestionnaireBlockView
              key={idx}
              questionnaire={block.questionnaire}
              chatTheme={questionnaireChatTheme}
              onSubmit={onQuestionnaireSubmit}
            />
          );
        }

        return null;
      })}
    </div>
  );
}
