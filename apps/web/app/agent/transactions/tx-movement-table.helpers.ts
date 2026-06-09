import type { CSSProperties } from 'react';
import {
  maxMovementHeatAmount,
  movementRowHeatClass,
  movementTableRowHeatStyle,
  type MovementHeatKind,
} from './transactions-modal.helpers';
import type { useMovementAnalytics } from './use-movement-analytics';

type MovementRow = ReturnType<typeof useMovementAnalytics>['dedupedMovementRows'][number];

export function buildMovementHeatProps(
  incomeRows: MovementRow[],
  expenseRows: MovementRow[],
) {
  const maxIncomeHeat = maxMovementHeatAmount(incomeRows.map((movement) => movement.amount));
  const maxExpenseHeat = maxMovementHeatAmount(expenseRows.map((movement) => movement.amount));

  return (amount: number, kind: MovementHeatKind) => {
    const style = movementTableRowHeatStyle(
      amount,
      kind,
      kind === 'income' ? maxIncomeHeat : maxExpenseHeat,
    );
    return {
      className: movementRowHeatClass(kind),
      style: style as CSSProperties,
    };
  };
}

export function movementTypeLabel(
  movement: MovementRow,
  isCreditCardProduct: boolean,
): string {
  if (movement.movementKind === 'abono') return 'Abono';
  if (movement.directionForTotals === 'income') {
    return isCreditCardProduct ? 'Abono' : 'Ingreso';
  }
  return 'Egreso';
}
