import type { BudgetRow } from '@/lib/presupuesto/filas.helpers';

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
