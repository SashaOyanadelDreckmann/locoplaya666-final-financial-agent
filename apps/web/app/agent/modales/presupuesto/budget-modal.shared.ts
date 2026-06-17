import type { BudgetRow } from '@/lib/presupuesto/filas.helpers';
import type { CSSProperties } from 'react';

export const MATTE_GRAY_PALETTE = [
  '#8b949d',
  '#7f8992',
  '#9098a0',
  '#76818b',
  '#9aa2a9',
  '#868f98',
  '#727d88',
  '#9ea5ac',
] as const;

export type BudgetTopExpense = { id: string; label: string; amount: number; pct: number };

export type BudgetInsights = {
  savingsRate: number;
  healthScore: number;
  fixedTotal: number;
  variableTotal: number;
  topExpenses: BudgetTopExpense[];
  nonZeroRows: unknown[];
  risingExpenseCount?: number;
  optimizePotential?: number;
};

export type BudgetSignals = {
  balanceTone: 'surplus' | 'deficit' | 'balanced';
  balanceLabel: string;
  balanceHint: string;
  coreFilledCount: number;
  coreTotal: number;
  coreFillRate: number;
  readinessScore: number;
  nextAction: string;
  risingExpenseCount: number;
  optimizePotential: number;
};

export type BudgetCompletion = {
  fillRate: number;
  totalRows: number;
  filledRows: BudgetRow[];
};

export function colorForBudgetRow(rowId: string) {
  let hash = 0;
  for (let i = 0; i < rowId.length; i += 1) {
    hash = (hash << 5) - hash + rowId.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % MATTE_GRAY_PALETTE.length;
  return MATTE_GRAY_PALETTE[idx];
}

export function rowStyleForBudgetRow(
  row: BudgetRow,
  rows: BudgetRow[],
): CSSProperties {
  const maxExpense = Math.max(
    1,
    ...rows.filter((item) => item.type === 'expense').map((item) => item.amount),
  );
  const maxIncome = Math.max(
    1,
    ...rows.filter((item) => item.type === 'income').map((item) => item.amount),
  );
  const t = Math.max(0, Math.min(1, row.amount / (row.type === 'expense' ? maxExpense : maxIncome)));
  const alpha = row.type === 'expense' ? 0.16 + t * 0.6 : 0.14 + t * 0.56;
  const bg =
    row.type === 'expense'
      ? `rgba(118, 26, 36, ${alpha.toFixed(2)})`
      : `rgba(62, 84, 22, ${alpha.toFixed(2)})`;
  return { '--row-bg': bg } as CSSProperties;
}
