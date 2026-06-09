'use client';

import {
  RETRO_CHART_COLORS,
  RETRO_CHART_NEGATIVE,
  RETRO_GRID,
  RETRO_TICK,
  RETRO_TOOLTIP_STYLE,
  RetroBarShape,
  RetroDot,
} from '@/components/ui/retro-chart';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts';
import { buildCategoryAskQuestion } from './tx-click-to-ask.helpers';
import type { useMovementAnalytics } from './use-movement-analytics';

type MovementAnalytics = ReturnType<typeof useMovementAnalytics>;

export interface TxMetricsChartsProps {
  formatCurrency: (value: number) => string;
  inflowSectionLabel: string;
  tableDerivedMetrics: MovementAnalytics['tableDerivedMetrics'];
  netFlowFromTable: number;
  categoryChartData: MovementAnalytics['categoryChartData'];
  qualityRowsChart: MovementAnalytics['qualityRowsChart'];
  chatBusy: boolean;
  onAskSuggestedQuestion: (question: string) => void;
}

export function TxMetricsCharts({
  formatCurrency,
  inflowSectionLabel,
  tableDerivedMetrics,
  netFlowFromTable,
  categoryChartData,
  qualityRowsChart,
  chatBusy,
  onAskSuggestedQuestion,
}: TxMetricsChartsProps) {
  const flowChartData = [
    { metric: inflowSectionLabel, value: tableDerivedMetrics.inflowsTotal },
    { metric: 'Egresos', value: tableDerivedMetrics.outflowsTotal },
    { metric: 'Flujo neto', value: netFlowFromTable },
  ];

  return (
    <div className="tx-ap-charts-section">
      <div className="tx-ap-section-header">
        <span className="tx-ap-section-label">Gráficos clave</span>
      </div>
      <div className="tx-ap-chart-grid">
        <article className="tx-ap-chart-card">
          <h5 className="tx-ap-chart-title">Flujo financiero</h5>
          <div style={{ width: '100%', height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={flowChartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="8 8" stroke={RETRO_GRID} />
                <XAxis dataKey="metric" interval={0} tick={RETRO_TICK} axisLine={false} tickLine={false} />
                <YAxis
                  tickFormatter={(value) => formatCurrency(Number(value))}
                  tick={RETRO_TICK}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(value) => formatCurrency(Number(value))}
                  contentStyle={RETRO_TOOLTIP_STYLE}
                  labelStyle={{ color: '#ffffff' }}
                  itemStyle={{ color: '#ffffff' }}
                />
                <Bar dataKey="value" shape={<RetroBarShape />}>
                  {flowChartData.map((entry, idx) => (
                    <Cell
                      key={`flow-bar-${entry.metric}`}
                      fill={entry.value >= 0 ? RETRO_CHART_COLORS[idx % RETRO_CHART_COLORS.length] : RETRO_CHART_NEGATIVE}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>
        <article className="tx-ap-chart-card">
          <h5 className="tx-ap-chart-title">Categorías por monto</h5>
          <div style={{ width: '100%', height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryChartData} layout="vertical" margin={{ top: 8, right: 8, left: 20, bottom: 8 }}>
                <CartesianGrid strokeDasharray="8 8" stroke={RETRO_GRID} />
                <XAxis
                  type="number"
                  tickFormatter={(value) => formatCurrency(Number(value))}
                  tick={RETRO_TICK}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis dataKey="category" type="category" width={120} tick={RETRO_TICK} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(value) => formatCurrency(Number(value))}
                  contentStyle={RETRO_TOOLTIP_STYLE}
                  labelStyle={{ color: '#ffffff' }}
                  itemStyle={{ color: '#ffffff' }}
                />
                <Bar dataKey="amount" shape={<RetroBarShape />}>
                  {categoryChartData.map((entry, idx) => (
                    <Cell
                      key={`cat-bar-${entry.category}`}
                      fill={RETRO_CHART_COLORS[idx % RETRO_CHART_COLORS.length]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          {categoryChartData.length > 0 ? (
            <div className="tx-category-ask-rail" role="group" aria-label="Preguntar por categoría">
              {categoryChartData.slice(0, 5).map((entry) => (
                <button
                  key={`cat-ask-${entry.category}`}
                  type="button"
                  className="tx-category-ask-chip"
                  disabled={chatBusy}
                  onClick={() => onAskSuggestedQuestion(buildCategoryAskQuestion(entry.category))}
                >
                  <span>{entry.category}</span>
                  <span className="tx-category-ask-chip-action">Preguntar</span>
                </button>
              ))}
            </div>
          ) : null}
        </article>
        <article className="tx-ap-chart-card tx-ap-chart-card--wide">
          <h5 className="tx-ap-chart-title">Calidad vs filas extraídas</h5>
          <div className="tx-ap-chart-note-layout">
            <div style={{ width: '100%', height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={qualityRowsChart} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="8 8" stroke={RETRO_GRID} />
                  <XAxis
                    dataKey="document"
                    interval={0}
                    tick={{ ...RETRO_TICK, fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="left"
                    tickFormatter={(value) => `${Number(value)}%`}
                    tick={RETRO_TICK}
                    domain={[0, 100]}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tickFormatter={(value) => new Intl.NumberFormat('es-CL').format(Number(value))}
                    tick={RETRO_TICK}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={RETRO_TOOLTIP_STYLE}
                    labelStyle={{ color: '#ffffff' }}
                    itemStyle={{ color: '#ffffff' }}
                  />
                  <Legend />
                  <Line
                    yAxisId="left"
                    type="stepAfter"
                    dataKey="reliability"
                    stroke={RETRO_CHART_COLORS[3]}
                    strokeWidth={4}
                    dot={<RetroDot stroke={RETRO_CHART_COLORS[3]} />}
                    activeDot={<RetroDot stroke={RETRO_CHART_COLORS[0]} />}
                    name="Confiabilidad %"
                  />
                  <Line
                    yAxisId="right"
                    type="stepAfter"
                    dataKey="rows"
                    stroke={RETRO_CHART_COLORS[1]}
                    strokeWidth={4}
                    dot={<RetroDot stroke={RETRO_CHART_COLORS[1]} />}
                    activeDot={<RetroDot stroke={RETRO_CHART_COLORS[2]} />}
                    name="Filas extraídas"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <aside className="tx-ap-chart-note" aria-label="Cómo leer este gráfico">
              <strong>Qué muestra</strong>
              <p>Confiabilidad indica la calidad de extracción por respaldo. Filas extraídas mide el volumen detectado.</p>
              <strong>Cómo leerlo</strong>
              <p>Ideal: confiabilidad alta y filas suficientes. Si baja confiabilidad, mejorar nitidez o formato del respaldo.</p>
            </aside>
          </div>
        </article>
      </div>
    </div>
  );
}
