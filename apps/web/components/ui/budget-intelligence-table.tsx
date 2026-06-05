'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties, type MutableRefObject } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

type BudgetCadence = 'fixed' | 'variable';
type BudgetPaymentMethod = 'transfer' | 'debit' | 'credit' | 'cash' | 'prepaid' | 'other';
type BudgetMovementType =
  | 'income_main'
  | 'income_extra'
  | 'housing'
  | 'home_services'
  | 'food'
  | 'transport'
  | 'health'
  | 'education'
  | 'debt'
  | 'savings_investment'
  | 'taxes_fees'
  | 'leisure_other';

type BudgetRow = {
  id: string;
  category: string;
  type: 'income' | 'expense';
  amount: number;
  parentId?: string;
  product?: string;
  institution?: string;
  note?: string;
  cadence?: 'fixed' | 'variable' | 'oneoff';
  paymentMethod?: BudgetPaymentMethod;
  movementType?: BudgetMovementType;
};

type EditableBudgetField =
  | 'category'
  | 'type'
  | 'amount'
  | 'cadence'
  | 'paymentMethod'
  | 'movementType';

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
  updateBudgetRow: (id: string, field: EditableBudgetField, value: string | number) => void;
  deleteBudgetRow: (id: string) => void;
};

const CADENCE_OPTIONS: Array<{ value: BudgetCadence; label: string }> = [
  { value: 'fixed', label: 'Fijo' },
  { value: 'variable', label: 'Variable' },
];

const PAYMENT_OPTIONS: Array<{ value: BudgetPaymentMethod; label: string }> = [
  { value: 'transfer', label: 'Transferencia' },
  { value: 'debit', label: 'Débito' },
  { value: 'credit', label: 'Crédito' },
  { value: 'cash', label: 'Efectivo' },
  { value: 'prepaid', label: 'Prepago' },
  { value: 'other', label: 'Otro' },
];

const MOVEMENT_TYPE_OPTIONS: Array<{ value: BudgetMovementType; label: string }> = [
  { value: 'income_main', label: 'Ingreso principal' },
  { value: 'income_extra', label: 'Ingreso adicional' },
  { value: 'housing', label: 'Vivienda' },
  { value: 'home_services', label: 'Servicios hogar' },
  { value: 'food', label: 'Alimentación' },
  { value: 'transport', label: 'Transporte' },
  { value: 'health', label: 'Salud' },
  { value: 'education', label: 'Educación' },
  { value: 'debt', label: 'Deudas' },
  { value: 'savings_investment', label: 'Ahorro/Inversión' },
  { value: 'taxes_fees', label: 'Impuestos/Comisiones' },
  { value: 'leisure_other', label: 'Ocio/Otros' },
];

const MOVEMENT_TYPE_LABEL = new Map(MOVEMENT_TYPE_OPTIONS.map((option) => [option.value, option.label]));

function normalizeCadence(value: BudgetRow['cadence'], rowType: BudgetRow['type']): BudgetCadence {
  if (value === 'fixed' || value === 'variable') return value;
  return rowType === 'income' ? 'fixed' : 'variable';
}

function normalizePaymentMethod(value: BudgetRow['paymentMethod'], rowType: BudgetRow['type']): BudgetPaymentMethod {
  if (value === 'transfer' || value === 'debit' || value === 'credit' || value === 'cash' || value === 'prepaid' || value === 'other') {
    return value;
  }
  return rowType === 'income' ? 'transfer' : 'debit';
}

function normalizeMovementType(value: BudgetRow['movementType'], rowType: BudgetRow['type']): BudgetMovementType {
  if (
    value === 'income_main' ||
    value === 'income_extra' ||
    value === 'housing' ||
    value === 'home_services' ||
    value === 'food' ||
    value === 'transport' ||
    value === 'health' ||
    value === 'education' ||
    value === 'debt' ||
    value === 'savings_investment' ||
    value === 'taxes_fees' ||
    value === 'leisure_other'
  ) {
    return value;
  }
  return rowType === 'income' ? 'income_main' : 'leisure_other';
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function seededNoise(seed: number, offset: number): number {
  const n = Math.sin(seed * 12.9898 + offset * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getEffectiveBudgetRows(rows: BudgetRow[]): BudgetRow[] {
  const parentIds = new Set(rows.filter((row) => row.parentId).map((row) => row.parentId as string));
  return rows.filter((row) => !parentIds.has(row.id));
}

function buildImpactSeries(row: BudgetRow, totals: { income: number; expenses: number; balance: number }): number[] {
  const baseIncome = Math.max(1, Math.abs(totals.income), Math.abs(totals.expenses), Math.abs(totals.balance));
  const signedShare = (row.type === 'income' ? 1 : -1) * (Math.abs(row.amount) / baseIncome);
  const target = clamp(signedShare * 1.4, -0.95, 0.95);
  const variability = normalizeCadence(row.cadence, row.type) === 'fixed' ? 0.1 : 0.32;
  const seed = hashString(row.id || `${row.category}-${row.amount}`);
  const phase = (seed % 360) * (Math.PI / 180);

  return Array.from({ length: 12 }, (_, month) => {
    const progress = month / 11;
    const seasonal = Math.sin(progress * Math.PI * 2 + phase) * variability * (0.7 - progress * 0.2);
    const noise = (seededNoise(seed, month + 3) - 0.5) * variability * 0.34;
    const trend = target * (0.52 + progress * 0.48);
    return clamp(trend + seasonal + noise, -1, 1);
  });
}

function toSparkPath(values: number[], width: number, height: number, padding: number): { d: string; area: string; zeroY: number } {
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const min = Math.min(...values, -0.001);
  const max = Math.max(...values, 0.001);
  const range = Math.max(0.01, max - min);

  const points = values.map((value, index) => {
    const x = padding + (index / (values.length - 1 || 1)) * innerWidth;
    const y = padding + ((max - value) / range) * innerHeight;
    return { x, y };
  });

  const d = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ');

  const first = points[0] ?? { x: padding, y: padding + innerHeight / 2 };
  const last = points[points.length - 1] ?? first;
  const area = `${d} L${last.x.toFixed(2)} ${(height - padding).toFixed(2)} L${first.x.toFixed(2)} ${(height - padding).toFixed(2)} Z`;
  const zeroY = padding + ((max - 0) / range) * innerHeight;

  return { d, area, zeroY };
}

function ImpactSparkline({ row, totals }: { row: BudgetRow; totals: { income: number; expenses: number; balance: number } }) {
  const series = useMemo(() => buildImpactSeries(row, totals), [row, totals]);
  const baseIncome = Math.max(1, Math.abs(totals.income), Math.abs(totals.expenses), Math.abs(totals.balance));
  const signedImpactPct = ((row.type === 'income' ? row.amount : -row.amount) / baseIncome) * 100;
  const severity = row.type === 'income'
    ? 'positive'
    : signedImpactPct <= -15
      ? 'high'
      : signedImpactPct <= -6
        ? 'medium'
        : 'low';
  const { d, area, zeroY } = toSparkPath(series, 104, 30, 2);

  return (
    <div className={`budget-impact-cell is-${severity}`}>
      <svg width="104" height="30" viewBox="0 0 104 30" role="img" aria-label="Curva de impacto del movimiento">
        <line x1="2" y1={zeroY} x2="102" y2={zeroY} className="budget-impact-zero" />
        <path d={area} className="budget-impact-area" />
        <path d={d} className="budget-impact-line" />
      </svg>
      <small>{`${signedImpactPct >= 0 ? '+' : ''}${signedImpactPct.toFixed(1)}%`}</small>
    </div>
  );
}

function stopRowCapture(event: React.SyntheticEvent) {
  event.stopPropagation();
}

function BudgetTextInput(props: {
  rowId: string;
  value: string;
  placeholder: string;
  style?: CSSProperties;
  onFocus: () => void;
  onFocusField: (target: EventTarget | null) => void;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(props.value);
  const isEditingRef = useRef(false);

  useEffect(() => {
    if (!isEditingRef.current) {
      setDraft(props.value);
    }
  }, [props.value, props.rowId]);

  return (
    <input
      value={draft}
      placeholder={props.placeholder}
      style={props.style}
      onFocus={() => {
        isEditingRef.current = true;
        props.onFocus();
        props.onFocusField(null);
      }}
      onMouseDownCapture={(event) => props.onFocusField(event.currentTarget)}
      onPointerDownCapture={(event) => props.onFocusField(event.currentTarget)}
      onMouseDown={stopRowCapture}
      onPointerDown={stopRowCapture}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        isEditingRef.current = false;
        props.onCommit(draft.trim() || props.value);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur();
        }
      }}
    />
  );
}

function BudgetAmountInput(props: {
  rowId: string;
  amount: number;
  onFocus: () => void;
  onFocusField: (target: EventTarget | null) => void;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(() => (props.amount > 0 ? String(props.amount) : ''));
  const isEditingRef = useRef(false);

  useEffect(() => {
    if (!isEditingRef.current) {
      setDraft(props.amount > 0 ? String(props.amount) : '');
    }
  }, [props.amount, props.rowId]);

  function commit(nextDraft: string) {
    const digits = nextDraft.replace(/\D/g, '');
    const parsed = digits ? Math.max(0, Math.round(Number(digits))) : 0;
    setDraft(parsed > 0 ? String(parsed) : '');
    props.onCommit(parsed);
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={draft}
      placeholder="0"
      onFocus={() => {
        isEditingRef.current = true;
        props.onFocus();
        props.onFocusField(null);
      }}
      onMouseDownCapture={(event) => props.onFocusField(event.currentTarget)}
      onPointerDownCapture={(event) => props.onFocusField(event.currentTarget)}
      onMouseDown={stopRowCapture}
      onPointerDown={stopRowCapture}
      onChange={(e) => setDraft(e.target.value.replace(/\D/g, ''))}
      onBlur={() => {
        isEditingRef.current = false;
        commit(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur();
        }
      }}
    />
  );
}

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
          aria-pressed={props.value === option.value}
          onClick={() => props.onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function BudgetIntelligenceTable(props: Props) {
  const effectiveRows = useMemo(() => getEffectiveBudgetRows(props.budgetRows), [props.budgetRows]);
  const parentIdsWithChildren = useMemo(
    () => new Set(props.budgetRows.filter((row) => row.parentId).map((row) => row.parentId as string)),
    [props.budgetRows],
  );
  const savingsPct =
    props.budgetTotals.income > 0
      ? Math.round((props.budgetTotals.balance / props.budgetTotals.income) * 100)
      : 0;
  const nonZeroRows = effectiveRows.filter((row) => row.amount > 0);
  const fixedFlow = nonZeroRows
    .filter((row) => normalizeCadence(row.cadence, row.type) === 'fixed')
    .reduce((sum, row) => sum + row.amount, 0);
  const variableRows = nonZeroRows.filter((row) => normalizeCadence(row.cadence, row.type) === 'variable');
  const highImpactRows = nonZeroRows.filter((row) => {
    if (row.type !== 'expense') return false;
    const incomeBase = Math.max(1, Math.abs(props.budgetTotals.income), Math.abs(props.budgetTotals.expenses));
    return row.amount / incomeBase >= 0.15;
  });
  const typedRows = nonZeroRows.filter((row) => normalizeMovementType(row.movementType, row.type) !== 'leisure_other').length;

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
      meta: `${highImpactRows.length} focos de alto impacto`,
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
      meta: `${variableRows.length} movimientos variables`,
      icon: <Activity size={16} />,
    },
    {
      label: 'Clasificación',
      value: `${typedRows}/${nonZeroRows.length || 0}`,
      meta: 'Movimientos etiquetados',
      icon: <Sparkles size={16} />,
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
              <th>Movimiento</th>
              <th>Tipo</th>
              <th>Monto mensual</th>
              <th>Recurrencia</th>
              <th>Medio de pago</th>
              <th>Tipo de movimiento</th>
              <th>Impacto</th>
              <th aria-label="Acciones"></th>
            </tr>
          </thead>
          <tbody>
            {props.orderedBudgetRows.map((row) => {
              const cadence = normalizeCadence(row.cadence, row.type);
              const paymentMethod = normalizePaymentMethod(row.paymentMethod, row.type);
              const movementType = normalizeMovementType(row.movementType, row.type);
              const isRollupParent = parentIdsWithChildren.has(row.id);

              return (
                <tr
                  key={row.id}
                  id={`budget-row-${row.id}`}
                  className={[
                    row.type === 'expense' ? 'budget-row-expense' : 'budget-row-income',
                    props.focusedBudgetRowId === row.id ? 'is-active-row' : '',
                  ].join(' ')}
                  style={props.rowStyle(row)}
                  onPointerDown={(event) => {
                    const target = event.target;
                    if (
                      target instanceof HTMLInputElement ||
                      target instanceof HTMLSelectElement ||
                      target instanceof HTMLTextAreaElement ||
                      target instanceof HTMLButtonElement
                    ) {
                      return;
                    }
                    props.focusBudgetRow(row.id);
                  }}
                >
                  <td data-label="Movimiento">
                    <div className="budget-movement-cell">
                      <BudgetTextInput
                        rowId={row.id}
                        value={row.category}
                        placeholder="Movimiento"
                        style={{
                          backgroundColor: `${props.colorForBudgetRow(row.id)}2E`,
                          borderColor: `${props.colorForBudgetRow(row.id)}90`,
                        }}
                        onFocus={() => props.focusBudgetRow(row.id)}
                        onFocusField={props.focusBudgetField}
                        onCommit={(value) => props.updateBudgetRow(row.id, 'category', value)}
                      />
                    </div>
                  </td>
                  <td data-label="Tipo">
                    <select
                      value={row.type}
                      onFocus={() => props.focusBudgetRow(row.id)}
                      onMouseDownCapture={(event) => props.focusBudgetField(event.currentTarget)}
                      onPointerDownCapture={(event) => props.focusBudgetField(event.currentTarget)}
                      onMouseDown={stopRowCapture}
                      onPointerDown={stopRowCapture}
                      onChange={(e) => props.updateBudgetRow(row.id, 'type', e.target.value as 'income' | 'expense')}
                    >
                      <option value="income">Ingreso</option>
                      <option value="expense">Gasto</option>
                    </select>
                  </td>
                  <td data-label="Monto">
                    {isRollupParent ? (
                      <input
                        value={row.amount > 0 ? String(row.amount) : ''}
                        readOnly
                        tabIndex={-1}
                        aria-readonly="true"
                        title="Monto calculado desde subcategorías"
                        className="is-readonly-amount"
                      />
                    ) : (
                      <BudgetAmountInput
                        rowId={row.id}
                        amount={row.amount}
                        onFocus={() => props.focusBudgetRow(row.id)}
                        onFocusField={props.focusBudgetField}
                        onCommit={(value) => props.updateBudgetRow(row.id, 'amount', value)}
                      />
                    )}
                  </td>
                  <td data-label="Recurrencia">
                    <SegmentedPills
                      options={CADENCE_OPTIONS}
                      value={cadence}
                      tone={row.type}
                      onChange={(value) => props.updateBudgetRow(row.id, 'cadence', value)}
                    />
                  </td>
                  <td data-label="Medio de pago">
                    <select
                      value={paymentMethod}
                      onFocus={() => props.focusBudgetRow(row.id)}
                      onMouseDownCapture={(event) => props.focusBudgetField(event.currentTarget)}
                      onPointerDownCapture={(event) => props.focusBudgetField(event.currentTarget)}
                      onMouseDown={stopRowCapture}
                      onPointerDown={stopRowCapture}
                      onChange={(e) => props.updateBudgetRow(row.id, 'paymentMethod', e.target.value)}
                    >
                      {PAYMENT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </td>
                  <td data-label="Tipo de movimiento">
                    <select
                      value={movementType}
                      onFocus={() => props.focusBudgetRow(row.id)}
                      onMouseDownCapture={(event) => props.focusBudgetField(event.currentTarget)}
                      onPointerDownCapture={(event) => props.focusBudgetField(event.currentTarget)}
                      onMouseDown={stopRowCapture}
                      onPointerDown={stopRowCapture}
                      onChange={(e) => props.updateBudgetRow(row.id, 'movementType', e.target.value)}
                    >
                      {MOVEMENT_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </td>
                  <td data-label="Impacto">
                    <div className="budget-impact-shell">
                      <ImpactSparkline row={row} totals={props.budgetTotals} />
                      <span className="budget-impact-type-label">{MOVEMENT_TYPE_LABEL.get(movementType) ?? 'Ocio/Otros'}</span>
                    </div>
                  </td>
                  <td data-label="Acciones">
                    <button
                      type="button"
                      className="continue-ghost danger"
                      onClick={() => props.deleteBudgetRow(row.id)}
                      aria-label={`Eliminar ${row.category}`}
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                        <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
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
