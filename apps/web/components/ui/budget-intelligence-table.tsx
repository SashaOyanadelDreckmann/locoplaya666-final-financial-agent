'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties, type MutableRefObject } from 'react';
import { Trash2 } from 'lucide-react';

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
  compactMobile?: boolean;
  suppressInlineSummary?: boolean;
  suppressRowClickFocus?: boolean;
};

export function BudgetMobileIntelSummary(props: {
  budgetTotals: { income: number; expenses: number; balance: number };
  tableStyle: string;
  formatBudgetAmount: (value: number) => string;
  fillRate?: number;
}) {
  return (
    <div
      className={`budget-mobile-intel-summary budget-mobile-intel-summary--${props.tableStyle}`}
      aria-label="Resumen de presupuesto"
    >
      <div className="budget-mobile-intel-summary-head">
        <div className="budget-mobile-intel-summary-title">
          <h2>Resumen del presupuesto</h2>
        </div>
        {typeof props.fillRate === 'number' ? (
          <span className="budget-mobile-intel-fill-rate">{props.fillRate}% completo</span>
        ) : null}
      </div>
      <div className="budget-mobile-intel-summary-metrics">
        <div>
          <span>Ingreso</span>
          <strong>{props.formatBudgetAmount(props.budgetTotals.income)}</strong>
        </div>
        <div>
          <span>Gasto</span>
          <strong>{props.formatBudgetAmount(props.budgetTotals.expenses)}</strong>
        </div>
        <div>
          <span>Balance</span>
          <strong>{props.formatBudgetAmount(props.budgetTotals.balance)}</strong>
        </div>
      </div>
    </div>
  );
}

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

function getBalanceBase(balance: number): number {
  return Math.max(1, Math.abs(balance));
}

function getSignedMovementAmount(row: BudgetRow): number {
  return row.type === 'income' ? row.amount : -row.amount;
}

function buildImpactPct(row: BudgetRow, balance: number): number {
  return (getSignedMovementAmount(row) / getBalanceBase(balance)) * 100;
}

function getEffectiveBudgetRows(rows: BudgetRow[]): BudgetRow[] {
  const parentIds = new Set(rows.filter((row) => row.parentId).map((row) => row.parentId as string));
  return rows.filter((row) => !parentIds.has(row.id));
}

const IMPACT_SERIES_POINTS = 12;

function smoothstep(u: number): number {
  return u * u * (3 - 2 * u);
}

function impactSeriesNoise(seed: string, index: number): number {
  let hash = 0;
  const key = `${seed}:${index}`;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  return ((hash & 0xffff) / 0x7fff) - 1;
}

/** 0–1: peso del monto en el presupuesto (tamaño relativo + % sobre balance). */
function getBudgetImpactIntensity(
  amount: number,
  signedDelta: number,
  totals: { income: number; expenses: number; balance: number },
): number {
  const { income, expenses, balance } = totals;
  const context = Math.max(income + expenses + Math.abs(balance), 1);
  const sizeWeight = amount / context;
  const balanceWeight = Math.abs(signedDelta) / getBalanceBase(balance);
  return Math.min(1, Math.max(0, sizeWeight * 2.4 + balanceWeight * 0.75));
}

function buildImpactSeries(
  row: BudgetRow,
  totals: { income: number; expenses: number; balance: number },
): number[] {
  const delta = getSignedMovementAmount(row);
  const { balance } = totals;
  const amount = row.amount;

  if (amount === 0) {
    return Array.from({ length: IMPACT_SERIES_POINTS }, () => balance);
  }

  const impactIntensity = getBudgetImpactIntensity(amount, delta, totals);
  const target = balance + delta;

  return Array.from({ length: IMPACT_SERIES_POINTS }, (_, index) => {
    if (index === 0) return balance;
    if (index === IMPACT_SERIES_POINTS - 1) return target;

    // Eje X: fracción del monto aplicada (0% → 100% de la columna Monto).
    const appliedFraction = index / (IMPACT_SERIES_POINTS - 1);
    const base = balance + delta * smoothstep(appliedFraction);

    if (impactIntensity < 0.05) {
      return base;
    }

    const edgeFade = Math.sin(appliedFraction * Math.PI);
    const wobbleAmplitude = Math.abs(delta) * (0.22 + impactIntensity * 0.42);
    const wobble = impactSeriesNoise(row.id, index) * wobbleAmplitude * edgeFade;
    return base + wobble;
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

function ImpactSparkline({
  row,
  totals,
  compact = false,
}: {
  row: BudgetRow;
  totals: { income: number; expenses: number; balance: number };
  compact?: boolean;
}) {
  const series = useMemo(
    () => buildImpactSeries(row, totals),
    [row.amount, row.id, row.type, totals.balance, totals.expenses, totals.income],
  );
  const signedImpactPct = buildImpactPct(row, totals.balance);
  const severity = row.type === 'income'
    ? 'positive'
    : signedImpactPct <= -15
      ? 'high'
      : signedImpactPct <= -6
        ? 'medium'
        : 'low';
  const width = compact ? 280 : 104;
  const height = compact ? 54 : 30;
  const { d, area, zeroY } = toSparkPath(series, width, height, compact ? 3 : 2);

  return (
    <div className={`budget-impact-cell is-${severity}${compact ? ' is-compact' : ''}`}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Impacto del monto: de ${totals.balance.toFixed(0)} a ${(totals.balance + getSignedMovementAmount(row)).toFixed(0)}`}
      >
        <line x1="2" y1={zeroY} x2={width - 2} y2={zeroY} className="budget-impact-zero" />
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
  className?: string;
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
      className={props.className}
      value={draft}
      placeholder={props.placeholder}
      style={props.style}
      onFocus={(event) => {
        isEditingRef.current = true;
        props.onFocus();
        props.onFocusField(event.currentTarget);
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
  className?: string;
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
      className={props.className}
      value={draft}
      placeholder="0"
      onFocus={(event) => {
        isEditingRef.current = true;
        props.onFocus();
        props.onFocusField(event.currentTarget);
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
  const surfaceClassName = [
    'budget-pdf-surface',
    `budget-table-style-${props.budgetTableStyle}`,
    props.compactMobile ? 'is-mobile-compact' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div ref={props.budgetPdfRef} className={surfaceClassName}>
      {!props.suppressInlineSummary ? (
        <div className={`budget-pdf-intel-summary budget-pdf-intel-summary--${props.budgetTableStyle}`}>
          <div className={`budget-pdf-head${props.compactMobile ? ' is-mobile-intel-head' : ''}`}>
            <div>
              <h2>Budget intelligence</h2>
            </div>
            <strong>{props.activeStyleLabel}</strong>
          </div>

          <div className={`budget-pdf-metrics${props.compactMobile ? ' is-mobile-intel-metrics' : ''}`}>
            <div><span>Ingreso</span><strong>{props.formatBudgetAmount(props.budgetTotals.income)}</strong></div>
            <div><span>Gasto</span><strong>{props.formatBudgetAmount(props.budgetTotals.expenses)}</strong></div>
            <div><span>Balance</span><strong>{props.formatBudgetAmount(props.budgetTotals.balance)}</strong></div>
          </div>
        </div>
      ) : null}

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
                    props.compactMobile ? 'is-mobile-row-card' : '',
                  ].join(' ')}
                  style={props.rowStyle(row)}
                  onClick={
                    props.compactMobile && !props.suppressRowClickFocus
                      ? (event) => {
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
                        }
                      : undefined
                  }
                  onPointerDown={
                    props.compactMobile
                      ? undefined
                      : (event) => {
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
                        }
                  }
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
                      <ImpactSparkline row={row} totals={props.budgetTotals} compact={props.compactMobile} />
                      <span className="budget-impact-type-label">{MOVEMENT_TYPE_LABEL.get(movementType) ?? 'Ocio/Otros'}</span>
                    </div>
                  </td>
                  <td data-label="Acciones" className="budget-row-actions-cell">
                    <button
                      type="button"
                      className={`budget-row-delete${props.compactMobile ? ' is-mobile' : ' continue-ghost danger'}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        props.deleteBudgetRow(row.id);
                      }}
                      aria-label={`Eliminar ${row.category}`}
                    >
                      {props.compactMobile ? (
                        <Trash2 size={14} strokeWidth={1.75} aria-hidden="true" />
                      ) : (
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                          <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                      )}
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

function PendingKindTag(props: { kind: 'add' | 'update' | 'delete' }) {
  const label =
    props.kind === 'add' ? 'Nuevo' : props.kind === 'update' ? 'Cambio' : 'Baja';
  return (
    <span
      className={[
        'budget-pending-card__tag',
        props.kind === 'add' ? 'is-add' : '',
        props.kind === 'update' ? 'is-update' : '',
        props.kind === 'delete' ? 'is-delete' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-hidden="true"
    >
      {label}
    </span>
  );
}

function PendingCompactPills<T extends string>(props: {
  options: Array<{ value: T; label: string }>;
  value: T;
  tone: 'income' | 'expense';
  onChange?: (value: T) => void;
  readonly?: boolean;
}) {
  if (props.readonly) {
    const active = props.options.find((option) => option.value === props.value);
    return (
      <span className={`budget-pending-card__pill is-readonly is-${props.tone}`}>{active?.label ?? props.value}</span>
    );
  }

  return (
    <div className={`budget-pending-card__pills is-${props.tone}`} role="group">
      {props.options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`budget-pending-card__pill${props.value === option.value ? ' is-active' : ''}`}
          aria-pressed={props.value === option.value}
          onMouseDown={stopRowCapture}
          onPointerDown={stopRowCapture}
          onClick={() => props.onChange?.(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

const PENDING_TYPE_OPTIONS = [
  { value: 'income' as const, label: 'Ing.' },
  { value: 'expense' as const, label: 'Gasto' },
];

const PENDING_CADENCE_OPTIONS = [
  { value: 'fixed' as const, label: 'Fijo' },
  { value: 'variable' as const, label: 'Var.' },
];

export function BudgetPendingProposalPreview(props: {
  items: Array<{ kind: 'add' | 'update' | 'delete'; row: BudgetRow }>;
  budgetTableStyle: string;
  formatBudgetAmount: (value: number) => string;
  colorForBudgetRow: (rowId: string) => string;
  rowStyle: (row: BudgetRow) => CSSProperties;
  editable?: boolean;
  onUpdateRow?: (rowId: string, field: EditableBudgetField, value: string | number) => void;
  focusBudgetField?: (target: EventTarget | null) => void;
}) {
  if (props.items.length === 0) return null;

  const surfaceClassName = [
    'budget-pending-card-list',
    'budget-pdf-surface',
    `budget-table-style-${props.budgetTableStyle}`,
    props.editable ? 'is-editable' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const focusBudgetField = props.focusBudgetField ?? (() => undefined);

  return (
    <div className="budget-pending-proposal-preview" aria-label="Propuesta de fila del asistente">
      <div className={surfaceClassName}>
        {props.items.map((item) => {
          const row = item.row;
          const cadence = normalizeCadence(row.cadence, row.type);
          const cadenceLabel = CADENCE_OPTIONS.find((option) => option.value === cadence)?.label ?? 'Fijo';
          const typeLabel = row.type === 'income' ? 'Ingreso' : 'Gasto';
          const accentColor = props.colorForBudgetRow(row.id);
          const amountLabel = row.amount > 0 ? props.formatBudgetAmount(row.amount) : '—';
          const isEditableRow = Boolean(props.editable && props.onUpdateRow && item.kind !== 'delete');
          const isDelete = item.kind === 'delete';

          return (
            <article
              key={`${item.kind}-${row.id}`}
              id={`budget-pending-row-${row.id}`}
              className={[
                'budget-pending-card',
                row.type === 'expense' ? 'budget-row-expense' : 'budget-row-income',
                item.kind === 'delete' ? 'is-delete' : '',
                item.kind === 'add' ? 'is-add' : '',
                item.kind === 'update' ? 'is-update' : '',
                isEditableRow ? 'is-editable' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={props.rowStyle(row)}
            >
              <div className="budget-pending-card__head">
                <PendingKindTag kind={item.kind} />
                {isEditableRow ? (
                  <BudgetAmountInput
                    rowId={row.id}
                    amount={row.amount}
                    className="budget-pending-card__amount-input"
                    onFocus={() => undefined}
                    onFocusField={focusBudgetField}
                    onCommit={(value) => props.onUpdateRow?.(row.id, 'amount', value)}
                  />
                ) : (
                  <span className="budget-pending-card__amount" aria-label="Monto mensual">
                    {amountLabel}
                  </span>
                )}
              </div>

              <div className="budget-pending-card__title">
                {isEditableRow ? (
                  <BudgetTextInput
                    rowId={row.id}
                    value={row.category}
                    placeholder="Movimiento"
                    className="budget-pending-card__category-input"
                    style={{
                      borderColor: `${accentColor}55`,
                      boxShadow: `inset 3px 0 0 ${accentColor}88`,
                    }}
                    onFocus={() => undefined}
                    onFocusField={focusBudgetField}
                    onCommit={(value) => props.onUpdateRow?.(row.id, 'category', value)}
                  />
                ) : (
                  <span
                    className="budget-pending-card__category"
                    style={{ boxShadow: `inset 3px 0 0 ${accentColor}88` }}
                    title={row.category}
                  >
                    {row.category}
                  </span>
                )}
              </div>

              {!isDelete ? (
                <div className="budget-pending-card__meta">
                  {isEditableRow ? (
                    <>
                      <PendingCompactPills
                        options={PENDING_TYPE_OPTIONS}
                        value={row.type}
                        tone={row.type}
                        onChange={(value) => props.onUpdateRow?.(row.id, 'type', value)}
                      />
                      <PendingCompactPills
                        options={PENDING_CADENCE_OPTIONS}
                        value={cadence}
                        tone={row.type}
                        onChange={(value) => props.onUpdateRow?.(row.id, 'cadence', value)}
                      />
                    </>
                  ) : (
                    <>
                      <PendingCompactPills
                        options={[{ value: row.type, label: typeLabel }]}
                        value={row.type}
                        tone={row.type}
                        readonly
                      />
                      <PendingCompactPills
                        options={[{ value: cadence, label: cadenceLabel }]}
                        value={cadence}
                        tone={row.type}
                        readonly
                      />
                    </>
                  )}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}
