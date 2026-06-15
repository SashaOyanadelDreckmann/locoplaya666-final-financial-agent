import type { NormalizedMovementRow } from './compute-movement-analytics';
import {
  buildCumulativeCashflowSeries,
  shouldBuildCumulativeCashflowChart,
  type TransactionCashflowMovement,
  type TransactionCashflowPoint,
  type TransactionCashflowSeries,
  type TransactionMovementInput,
} from '@financial-agent/shared';

export const MINIMAL_CASHFLOW_MIN_DISTINCT_DAYS = 3;
export const MINIMAL_CASHFLOW_MIN_DATED_MOVEMENTS = 3;

export type ParsedMovementDate = {
  year: number;
  month: number;
  day: number;
};

export type MinimalCashflowMovement = TransactionCashflowMovement;
export type MinimalCashflowPoint = TransactionCashflowPoint;
export type MinimalCashflowSeries = TransactionCashflowSeries;

export { parseTransactionMovementDate as parseMovementDateToken } from '@financial-agent/shared';

function mapRowToMovementInput(row: NormalizedMovementRow): TransactionMovementInput {
  return {
    label: row.label,
    merchant: row.merchant,
    amount: row.amount,
    direction: row.directionForTotals,
    date: row.date,
    category: row.category,
  };
}

export function buildMinimalCashflowSeries(rows: NormalizedMovementRow[]): MinimalCashflowSeries | null {
  return buildCumulativeCashflowSeries(rows.map(mapRowToMovementInput));
}

export function shouldShowMinimalCashflowChart(rows: NormalizedMovementRow[]): boolean {
  return shouldBuildCumulativeCashflowChart(rows.map(mapRowToMovementInput));
}
