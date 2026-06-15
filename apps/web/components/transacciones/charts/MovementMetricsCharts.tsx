'use client';

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TransactionCategoryBarPoint, TransactionFlowBarPoint } from '@financial-agent/shared';

import {
  TX_CHART_CATEGORY_Y_AXIS_WIDTH,
  TX_CHART_MARGIN,
  TX_CHART_VIEWPORT_HEIGHT,
  TX_CHART_X_AXIS_PADDING,
  TX_CHART_Y_AXIS_WIDTH,
} from './transaction-chart-layout';

const INCOME_COLOR = '#5b8cc0';
const EXPENSE_COLOR = '#b4534b';
const NET_POSITIVE = '#4f7f63';
const NET_NEGATIVE = '#b4534b';
const CATEGORY_COLORS = ['#5b8cc0', '#b4534b', '#7a6b58', '#4f7f63', '#8b6bb8', '#c58b45'];

function formatCurrencyValue(value: number, formatCurrency: (amount: number) => string): string {
  return formatCurrency(Number(value) || 0);
}

function compactAxisLabel(value: number): string {
  const abs = Math.abs(Number(value) || 0);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${Math.round(value / 1_000)}k`;
  return `$${Math.round(value)}`;
}

export function MovementFlowBarChart(props: {
  data: TransactionFlowBarPoint[];
  formatCurrency: (value: number) => string;
  title?: string;
  subtitle?: string;
}) {
  const colors = props.data.map((point) => {
    if (point.metric.toLowerCase().includes('neto')) {
      return point.value >= 0 ? NET_POSITIVE : NET_NEGATIVE;
    }
    if (point.metric.toLowerCase().includes('egreso')) return EXPENSE_COLOR;
    return INCOME_COLOR;
  });

  return (
    <section className="tx-minimal-cashflow-card agent-tx-chart-card" aria-label={props.title ?? 'Flujo financiero'}>
      <div className="tx-minimal-cashflow-head">
        <div>
          <span className="tx-minimal-cashflow-kicker">Resumen transacciones</span>
          <h3 className="tx-minimal-cashflow-title">{props.title ?? 'Flujo financiero'}</h3>
          {props.subtitle ? <p className="tx-minimal-cashflow-meta">{props.subtitle}</p> : null}
        </div>
      </div>
      <div className="tx-minimal-cashflow-chart agent-tx-bar-chart">
        <ResponsiveContainer width="100%" height={TX_CHART_VIEWPORT_HEIGHT} debounce={50}>
          <BarChart data={props.data} margin={TX_CHART_MARGIN}>
            <CartesianGrid strokeDasharray="4 4" stroke="rgba(206, 194, 176, 0.55)" vertical={false} />
            <XAxis
              dataKey="metric"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#6f6558', fontSize: 11 }}
              padding={TX_CHART_X_AXIS_PADDING}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#6f6558', fontSize: 11 }}
              width={TX_CHART_Y_AXIS_WIDTH}
              tickFormatter={(value) => compactAxisLabel(Number(value))}
            />
            <Tooltip
              cursor={{ fill: 'rgba(91, 140, 192, 0.08)' }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const point = payload[0]?.payload as TransactionFlowBarPoint | undefined;
                if (!point) return null;
                return (
                  <div className="tx-minimal-cashflow-tooltip" role="status">
                    <div className="tx-minimal-cashflow-tooltip-label">{point.metric}</div>
                    <strong>{formatCurrencyValue(point.value, props.formatCurrency)}</strong>
                  </div>
                );
              }}
            />
            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
              {props.data.map((point, index) => (
                <Cell key={`${point.metric}-${index}`} fill={colors[index] ?? INCOME_COLOR} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

export function MovementCategoryBarChart(props: {
  data: TransactionCategoryBarPoint[];
  formatCurrency: (value: number) => string;
  title?: string;
  subtitle?: string;
}) {
  return (
    <section className="tx-minimal-cashflow-card agent-tx-chart-card" aria-label={props.title ?? 'Gastos por categoría'}>
      <div className="tx-minimal-cashflow-head">
        <div>
          <span className="tx-minimal-cashflow-kicker">Resumen transacciones</span>
          <h3 className="tx-minimal-cashflow-title">{props.title ?? 'Gastos por categoría'}</h3>
          {props.subtitle ? <p className="tx-minimal-cashflow-meta">{props.subtitle}</p> : null}
        </div>
      </div>
      <div className="tx-minimal-cashflow-chart agent-tx-bar-chart">
        <ResponsiveContainer width="100%" height={TX_CHART_VIEWPORT_HEIGHT} debounce={50}>
          <BarChart data={props.data} layout="vertical" margin={TX_CHART_MARGIN}>
            <CartesianGrid strokeDasharray="4 4" stroke="rgba(206, 194, 176, 0.55)" horizontal={false} />
            <XAxis
              type="number"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#6f6558', fontSize: 11 }}
              tickFormatter={(value) => compactAxisLabel(Number(value))}
              padding={TX_CHART_X_AXIS_PADDING}
            />
            <YAxis
              type="category"
              dataKey="category"
              width={TX_CHART_CATEGORY_Y_AXIS_WIDTH}
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#6f6558', fontSize: 11 }}
            />
            <Tooltip
              cursor={{ fill: 'rgba(91, 140, 192, 0.08)' }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const point = payload[0]?.payload as TransactionCategoryBarPoint | undefined;
                if (!point) return null;
                return (
                  <div className="tx-minimal-cashflow-tooltip" role="status">
                    <div className="tx-minimal-cashflow-tooltip-label">{point.category}</div>
                    <strong>{formatCurrencyValue(point.amount, props.formatCurrency)}</strong>
                    <div className="tx-minimal-cashflow-tooltip-day-kicker">{point.share}% del gasto mostrado</div>
                  </div>
                );
              }}
            />
            <Bar dataKey="amount" radius={[0, 6, 6, 0]}>
              {props.data.map((point, index) => (
                <Cell key={`${point.category}-${index}`} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
