'use client';

import type { CSSProperties, MutableRefObject } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';

type BudgetCadence = 'fixed' | 'variable' | 'oneoff';
type BudgetMomentum = 'up' | 'steady' | 'down';
type BudgetStrategy = 'shield' | 'review' | 'optimize';

type BudgetRow = {
  id: string;
  category: string;
  type: 'income' | 'expense';
  amount: number;
  parentId?: string;
  product?: string;
  institution?: string;
  note?: string;
  cadence?: BudgetCadence;
  momentum?: BudgetMomentum;
  strategy?: BudgetStrategy;
};

type Props = {
  orderedBudgetRows: BudgetRow[];
  budgetRows: BudgetRow[];
  focusedBudgetRowId: string | null;
  budgetTotals: { income: number; expenses: number; balance: number };
  activeStyleLabel: string;
  budgetTableStyle: string;
  budgetPdfRef: MutableRefObject<HTMLDivElement | null>;
  formatBudgetAmount: (value: number) => string;
  rowStyle: (row: BudgetRow) => CSSProperties;
  colorForBudgetRow: (rowId: string) => string;
  focusBudgetRow: (rowId: string) => void;
  focusBudgetField: (target: EventTarget | null) => void;
  updateBudgetRow: (id: string, field: keyof BudgetRow, value: string | number) => void;
  addBudgetSubcategory: (parentId: string) => void;
  deleteBudgetRow: (id: string) => void;
};

const CADENCE_OPTIONS: Array<{ value: BudgetCadence; label: string }> = [
  { value: 'fixed', label: 'Fijo' },
  { value: 'variable', label: 'Variable' },
  { value: 'oneoff', label: 'Puntual' },
];

const MOMENTUM_OPTIONS: Array<{ value: BudgetMomentum; label: string }> = [
  { value: 'up', label: 'Sube' },
  { value: 'steady', label: 'Estable' },
  { value: 'down', label: 'Baja' },
];

const STRATEGY_OPTIONS: Array<{ value: BudgetStrategy; label: string }> = [
  { value: 'shield', label: 'Blindar' },
  { value: 'review', label: 'Revisar' },
  { value: 'optimize', label: 'Optimizar' },
];

function SegmentedPills<T extends string>(props: {
  options: Array<{ value: T; label: string }>;
  value: T;
  tone: 'income' | 'expense';
  onChange: (value: T) => void;
}) {
  return (
    <div className={`budget-pill-group is-${props.tone}`}>
      {props.options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`budget-pill-button${props.value === option.value ? ' is-active' : ''}`}
          onClick={() => props.onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function BudgetIntelligenceTable(props: Props) {
  const savingsPct =
    props.budgetTotals.income > 0
      ? Math.round((props.budgetTotals.balance / props.budgetTotals.income) * 100)
      : 0;
  const nonZeroRows = props.budgetRows.filter((row) => row.amount > 0);
  const fixedFlow = nonZeroRows
    .filter((row) => row.cadence === 'fixed')
    .reduce((sum, row) => sum + row.amount, 0);
  const risingRows = nonZeroRows.filter((row) => row.type === 'expense' && row.momentum === 'up');
  const optimizeRows = nonZeroRows.filter(
    (row) => row.type === 'expense' && (row.strategy === 'review' || row.strategy === 'optimize')
  );
  const optimizePotential = optimizeRows.reduce((sum, row) => sum + row.amount, 0);
  const metricCards = [
    {
      label: 'Ingresos',
      value: props.formatBudgetAmount(props.budgetTotals.income),
      meta: 'Flujo de entrada',
      icon: <ArrowUpRight size={16} />,
    },
    {
      label: 'Gastos',
      value: props.formatBudgetAmount(props.budgetTotals.expenses),
      meta: `${risingRows.length} rubros al alza`,
      icon: <ArrowDownRight size={16} />,
    },
    {
      label: 'Balance',
      value: props.formatBudgetAmount(props.budgetTotals.balance),
      meta: `${savingsPct}% de margen`,
      icon: <ShieldCheck size={16} />,
    },
    {
      label: 'Flujo fijo',
      value: props.formatBudgetAmount(fixedFlow),
      meta: 'Base mensual',
      icon: <Activity size={16} />,
    },
    {
      label: 'Optimizable',
      value: props.formatBudgetAmount(optimizePotential),
      meta: `${optimizeRows.length} focos accionables`,
      icon: <TrendingUp size={16} />,
    },
  ];

  return (
    <div ref={props.budgetPdfRef} className={`budget-pdf-surface budget-table-style-${props.budgetTableStyle}`}>
      <div className="budget-intel-kpis">
        {metricCards.map((metric, index) => (
          <motion.article
            key={metric.label}
            className="budget-intel-kpi"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, delay: index * 0.04 }}
          >
            <span className="budget-intel-kpi-icon">{metric.icon}</span>
            <span className="budget-intel-kpi-label">{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.meta}</small>
          </motion.article>
        ))}
      </div>

      <div className="budget-pdf-head">
        <div>
          <span>Financieramente</span>
          <h2>Budget intelligence</h2>
        </div>
        <strong>{props.activeStyleLabel}</strong>
      </div>

      <div className="budget-pdf-metrics">
        <div><span>Ingreso</span><strong>{props.formatBudgetAmount(props.budgetTotals.income)}</strong></div>
        <div><span>Gasto</span><strong>{props.formatBudgetAmount(props.budgetTotals.expenses)}</strong></div>
        <div><span>Balance</span><strong>{props.formatBudgetAmount(props.budgetTotals.balance)}</strong></div>
      </div>

      <div className="budget-table-wrap budget-table-wrap-pro">
        <table className="budget-table budget-table-pro">
          <thead>
            <tr>
              <th>Categoría</th>
              <th>Tipo</th>
              <th>Monto mensual</th>
              <th>Constancia</th>
              <th>Señal</th>
              <th>Palanca</th>
              <th aria-label="Acciones"></th>
            </tr>
          </thead>
          <tbody>
            {props.orderedBudgetRows.map((row) => {
              const hasChildren = props.budgetRows.some((item) => item.parentId === row.id);
              const isSub = Boolean(row.parentId);
              const cadence = row.cadence ?? 'variable';
              const momentum = row.momentum ?? 'steady';
              const strategy = row.strategy ?? 'review';
              return (
                <tr
                  key={row.id}
                  id={`budget-row-${row.id}`}
                  className={[
                    row.type === 'expense' ? 'budget-row-expense' : 'budget-row-income',
                    row.parentId ? 'is-budget-subrow' : 'is-budget-parent-row',
                    props.focusedBudgetRowId === row.id ? 'is-active-row' : '',
                  ].join(' ')}
                  style={props.rowStyle(row)}
                  onMouseDownCapture={() => props.focusBudgetRow(row.id)}
                  onPointerDownCapture={() => props.focusBudgetRow(row.id)}
                >
                  <td data-label="Categoría">
                    <input
                      className={isSub ? 'budget-subcategory-input' : undefined}
                      value={row.category}
                      placeholder={isSub ? 'Subcategoría' : 'Categoría'}
                      style={{
                        backgroundColor: `${props.colorForBudgetRow(row.id)}2E`,
                        borderColor: `${props.colorForBudgetRow(row.id)}90`,
                        paddingLeft: isSub ? '18px' : undefined,
                      }}
                      onMouseDownCapture={(e) => props.focusBudgetField(e.currentTarget)}
                      onPointerDownCapture={(e) => props.focusBudgetField(e.currentTarget)}
                      onFocus={() => props.focusBudgetRow(row.id)}
                      onChange={(e) => props.updateBudgetRow(row.id, 'category', e.target.value)}
                    />
                  </td>
                  <td data-label="Tipo">
                    <select
                      className={isSub ? 'budget-subcategory-select' : undefined}
                      value={row.type}
                      onMouseDownCapture={(e) => props.focusBudgetField(e.currentTarget)}
                      onPointerDownCapture={(e) => props.focusBudgetField(e.currentTarget)}
                      onFocus={() => props.focusBudgetRow(row.id)}
                      onChange={(e) => props.updateBudgetRow(row.id, 'type', e.target.value as 'income' | 'expense')}
                    >
                      <option value="income">Ingreso</option>
                      <option value="expense">Gasto</option>
                    </select>
                  </td>
                  <td data-label="Monto">
                    <input
                      className={isSub ? 'budget-subcategory-amount' : undefined}
                      type="number"
                      value={row.amount}
                      min={0}
                      step={1000}
                      placeholder="0"
                      disabled={hasChildren}
                      onMouseDownCapture={(e) => props.focusBudgetField(e.currentTarget)}
                      onPointerDownCapture={(e) => props.focusBudgetField(e.currentTarget)}
                      onFocus={() => props.focusBudgetRow(row.id)}
                      onChange={(e) => props.updateBudgetRow(row.id, 'amount', Number(e.target.value))}
                    />
                  </td>
                  <td data-label="Constancia">
                    <SegmentedPills
                      options={CADENCE_OPTIONS}
                      value={cadence}
                      tone={row.type}
                      onChange={(value) => props.updateBudgetRow(row.id, 'cadence', value)}
                    />
                  </td>
                  <td data-label="Señal">
                    <div className="budget-pill-group-shell">
                      <SegmentedPills
                        options={MOMENTUM_OPTIONS}
                        value={momentum}
                        tone={row.type}
                        onChange={(value) => props.updateBudgetRow(row.id, 'momentum', value)}
                      />
                      <span className={`budget-trend-indicator is-${momentum}`}>
                        {momentum === 'up' ? <TrendingUp size={14} /> : momentum === 'down' ? <TrendingDown size={14} /> : <Activity size={14} />}
                      </span>
                    </div>
                  </td>
                  <td data-label="Palanca">
                    <SegmentedPills
                      options={STRATEGY_OPTIONS}
                      value={strategy}
                      tone={row.type}
                      onChange={(value) => props.updateBudgetRow(row.id, 'strategy', value)}
                    />
                  </td>
                  <td data-label="Acciones">
                    {!isSub && (
                      <button
                        type="button"
                        className="continue-ghost"
                        onClick={() => props.addBudgetSubcategory(row.id)}
                        title="Agregar subcategoría"
                      >
                        + Sub
                      </button>
                    )}
                    <button
                      type="button"
                      className="continue-ghost danger"
                      onClick={() => props.deleteBudgetRow(row.id)}
                      title="Eliminar fila"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
