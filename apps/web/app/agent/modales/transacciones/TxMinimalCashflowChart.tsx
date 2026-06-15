'use client';

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { MinimalCashflowMovement, MinimalCashflowPoint, MinimalCashflowSeries } from './tx-minimal-cashflow.helpers';

const INCOME_COLOR = '#5b8cc0';
const EXPENSE_COLOR = '#b4534b';

type CashflowTooltipProps = {
  active?: boolean;
  payload?: Array<{ payload?: MinimalCashflowPoint }>;
  label?: string;
  formatCurrency: (value: number) => string;
};

function ChartLegendSwatch(props: { label: string; variant: 'income' | 'expense' }) {
  return (
    <span className={`tx-minimal-cashflow-legend-item is-${props.variant}`}>
      <span className={`tx-minimal-cashflow-legend-swatch is-${props.variant}`} aria-hidden="true" />
      <span>{props.label}</span>
    </span>
  );
}

function truncateLabel(value: string, max = 42): string {
  const text = value.trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function CashflowTooltip(props: CashflowTooltipProps) {
  if (!props.active) return null;

  const point = props.payload?.[0]?.payload;
  if (!point) return null;

  const movements = point.movements ?? [];
  const cumulativeIncome = Number(point.cumulativeIncome) || 0;
  const cumulativeExpense = Number(point.cumulativeExpense) || 0;
  const dayIncome = Number(point.dayIncome) || 0;
  const dayExpense = Number(point.dayExpense) || 0;

  return (
    <div className="tx-minimal-cashflow-tooltip" role="status">
      <div className="tx-minimal-cashflow-tooltip-label">Día {props.label ?? point.dayLabel}</div>

      <div className="tx-minimal-cashflow-tooltip-totals">
        <div className="tx-minimal-cashflow-tooltip-row">
          <ChartLegendSwatch label="Ingresos acum." variant="income" />
          <strong>{props.formatCurrency(cumulativeIncome)}</strong>
        </div>
        <div className="tx-minimal-cashflow-tooltip-row">
          <ChartLegendSwatch label="Egresos acum." variant="expense" />
          <strong>{props.formatCurrency(cumulativeExpense)}</strong>
        </div>
      </div>

      {(dayIncome > 0 || dayExpense > 0) && movements.length > 0 ? (
        <p className="tx-minimal-cashflow-tooltip-day-kicker">
          En este día:
          {dayIncome > 0 ? ` +${props.formatCurrency(dayIncome)} ingresos` : ''}
          {dayExpense > 0 ? ` −${props.formatCurrency(dayExpense)} egresos` : ''}
        </p>
      ) : null}

      {movements.length > 0 ? (
        <ul className="tx-minimal-cashflow-tooltip-movements" aria-label="Movimientos del día">
          {movements.map((movement, index) => (
            <MovementRow key={`${movement.label}-${movement.amount}-${index}`} movement={movement} formatCurrency={props.formatCurrency} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function MovementRow(props: { movement: MinimalCashflowMovement; formatCurrency: (value: number) => string }) {
  const isIncome = props.movement.direction === 'income';
  return (
    <li className={`tx-minimal-cashflow-tooltip-movement is-${props.movement.direction}`}>
      <span className="tx-minimal-cashflow-tooltip-movement-label" title={props.movement.label}>
        {truncateLabel(props.movement.label)}
      </span>
      <span className="tx-minimal-cashflow-tooltip-movement-amount">
        {isIncome ? '+' : '−'}
        {props.formatCurrency(props.movement.amount)}
      </span>
    </li>
  );
}

function compactAxisLabel(value: number): string {
  const abs = Math.abs(Number(value) || 0);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${Math.round(value / 1_000)}k`;
  return `$${Math.round(value)}`;
}

export function TxMinimalCashflowChart(props: {
  series: MinimalCashflowSeries;
  formatCurrency: (value: number) => string;
}) {
  const { series, formatCurrency } = props;

  return (
    <section className="tx-minimal-cashflow-card" aria-label={`Evolución acumulada de ingresos y egresos en ${series.monthLabel}`}>
      <div className="tx-minimal-cashflow-head">
        <div>
          <span className="tx-minimal-cashflow-kicker">Evolución acumulada</span>
          <h3 className="tx-minimal-cashflow-title">{series.monthLabel}</h3>
          <p className="tx-minimal-cashflow-meta">
            Ingresos y egresos acumulados · {series.datedMovementCount} movimientos · {series.distinctDays} días
          </p>
        </div>
        <div className="tx-minimal-cashflow-legend" aria-hidden="true">
          <ChartLegendSwatch label="Ingresos acum." variant="income" />
          <ChartLegendSwatch label="Egresos acum." variant="expense" />
        </div>
      </div>

      <div className="tx-minimal-cashflow-chart">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={series.points}
            margin={{ top: 8, right: 8, left: 0, bottom: 4 }}
          >
            <defs>
              <linearGradient id="txMinimalIncomeGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={INCOME_COLOR} stopOpacity={0.28} />
                <stop offset="100%" stopColor={INCOME_COLOR} stopOpacity={0.04} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="4 4" stroke="rgba(206, 194, 176, 0.55)" vertical={false} />

            <XAxis
              dataKey="dayLabel"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#6f6558', fontSize: 11 }}
              dy={6}
            />

            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#6f6558', fontSize: 11 }}
              width={56}
              tickFormatter={(value) => compactAxisLabel(Number(value))}
            />

            <Tooltip
              cursor={{ stroke: 'rgba(206, 194, 176, 0.9)', strokeWidth: 1 }}
              content={(tooltipProps) => <CashflowTooltip {...tooltipProps} formatCurrency={formatCurrency} />}
            />

            <Area
              type="monotone"
              dataKey="incomeArea"
              stroke="transparent"
              fill="url(#txMinimalIncomeGradient)"
              dot={false}
              isAnimationActive={false}
            />

            <Line
              type="monotone"
              dataKey="cumulativeIncome"
              stroke={INCOME_COLOR}
              strokeWidth={2}
              dot={{ r: 4, strokeWidth: 2, fill: '#ffffff', stroke: INCOME_COLOR }}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />

            <Line
              type="monotone"
              dataKey="cumulativeExpense"
              stroke={EXPENSE_COLOR}
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={{ r: 4, strokeWidth: 2, fill: '#ffffff', stroke: EXPENSE_COLOR }}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
