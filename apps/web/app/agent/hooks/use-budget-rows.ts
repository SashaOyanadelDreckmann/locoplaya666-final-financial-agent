'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  buildPersistableBudgetContext,
  canonicalBudgetRowId,
  computeBudgetCompletion,
  computeBudgetInsights,
  computeBudgetSignals,
  computeBudgetTotals,
  createBudgetStarterRows,
  MAX_BUDGET_ROWS,
  mergeBudgetInitialRows,
  reconcileBudgetRows,
  type BudgetRow,
} from '@/lib/presupuesto/filas.helpers';
import {
  applyValidatedBudgetTableAction,
  validateBudgetTableActions,
  type BudgetTableAction,
  type BudgetProductSnapshot,
} from '@financial-agent/shared';

function sameBudgetRowId(left: string, right: string): boolean {
  return canonicalBudgetRowId(left) === canonicalBudgetRowId(right);
}

export function useBudgetRows(initialRows: BudgetRow[] = []) {
  const [budgetRows, setBudgetRows] = useState<BudgetRow[]>(initialRows);

  const budgetTotals = useMemo(() => computeBudgetTotals(budgetRows), [budgetRows]);
  const budgetInsights = useMemo(
    () => computeBudgetInsights(budgetRows, budgetTotals),
    [budgetRows, budgetTotals],
  );
  const budgetCompletion = useMemo(() => computeBudgetCompletion(budgetRows), [budgetRows]);
  const budgetSignals = useMemo(
    () => computeBudgetSignals(budgetRows, budgetTotals, budgetInsights.healthScore),
    [budgetInsights.healthScore, budgetRows, budgetTotals],
  );

  const updateBudgetRow = useCallback((id: string, field: keyof BudgetRow, value: string | number) => {
    setBudgetRows((rows) => {
      const updated = rows.map((row) =>
        sameBudgetRowId(row.id, id)
          ? {
              ...row,
              [field]: field === 'amount' ? Number(value) || 0 : value,
            }
          : row,
      );
      const propagated =
        field === 'type'
          ? updated.map((row) => {
              const parent = updated.find(
                (candidate) => row.parentId && sameBudgetRowId(candidate.id, row.parentId),
              );
              if (!parent) return row;
              if (row.type === parent.type) return row;
              return { ...row, type: parent.type };
            })
          : updated;
      return reconcileBudgetRows(propagated);
    });
  }, []);

  const applyBudgetTemplate = useCallback((products?: BudgetProductSnapshot[]) => {
    setBudgetRows((rows) => mergeBudgetInitialRows(products, rows));
  }, []);

  const addBudgetRow = useCallback((type: 'income' | 'expense') => {
    setBudgetRows((rows) => {
      if (rows.length >= MAX_BUDGET_ROWS) return rows;
      const next = [
        ...rows,
        {
          id: `${type}-${Date.now()}`,
          category: type === 'income' ? 'Nuevo ingreso' : 'Nuevo gasto',
          type,
          amount: 0,
          product: type === 'income' ? 'Producto ingreso' : 'Producto gasto',
          institution: '',
        } as BudgetRow,
      ];
      return reconcileBudgetRows(next);
    });
  }, []);

  const addBudgetSubcategory = useCallback((parentId: string) => {
    setBudgetRows((rows) => {
      if (rows.length >= MAX_BUDGET_ROWS) return rows;
      const parent = rows.find((row) => sameBudgetRowId(row.id, parentId));
      if (!parent) return rows;
      const siblings = rows.filter((row) => row.parentId && sameBudgetRowId(row.parentId, parentId));
      const subRow: BudgetRow = {
        id: `${parentId}-sub-${Date.now()}`,
        parentId,
        category: `${parent.category} · item ${siblings.length + 1}`,
        type: parent.type,
        amount: 0,
      };
      return reconcileBudgetRows([...rows, subRow]);
    });
  }, []);

  const deleteBudgetRow = useCallback((id: string) => {
    setBudgetRows((rows) => {
      const validated = validateBudgetTableActions([{ kind: 'delete', id }], rows);
      if (validated.length === 0) return rows;
      let next = rows;
      for (const action of validated) {
        next = applyValidatedBudgetTableAction(next, action);
      }
      return reconcileBudgetRows(next);
    });
  }, []);

  const upsertBudgetRow = useCallback((row: BudgetRow) => {
    setBudgetRows((rows) => {
      const idx = rows.findIndex((item) => sameBudgetRowId(item.id, row.id));
      if (idx >= 0) {
        return reconcileBudgetRows(
          rows.map((item) => (sameBudgetRowId(item.id, row.id) ? { ...item, ...row } : item)),
        );
      }
      if (rows.length >= MAX_BUDGET_ROWS) return rows;
      return reconcileBudgetRows([...rows, row]);
    });
  }, []);

  const applyBudgetTableActions = useCallback((actions: BudgetTableAction[]) => {
    if (!Array.isArray(actions) || actions.length === 0) return;
    setBudgetRows((rows) => {
      const validated = validateBudgetTableActions(actions, rows);
      if (validated.length === 0) return rows;
      let next = rows;
      for (const action of validated) {
        next = applyValidatedBudgetTableAction(next, action);
      }
      return reconcileBudgetRows(next);
    });
  }, []);

  const buildPersistableBudgetContextFn = useCallback(
    () => buildPersistableBudgetContext(budgetRows, budgetTotals),
    [budgetRows, budgetTotals],
  );

  const resetBudgetRows = useCallback((rows: BudgetRow[]) => {
    setBudgetRows(rows.map((row) => ({ ...row })));
  }, []);

  const applyStarterIfEmpty = useCallback(() => {
    setBudgetRows((rows) => (rows.length === 0 ? createBudgetStarterRows() : rows));
  }, []);

  return {
    budgetRows,
    setBudgetRows,
    resetBudgetRows,
    budgetTotals,
    budgetInsights,
    budgetCompletion,
    budgetSignals,
    updateBudgetRow,
    applyBudgetTemplate,
    addBudgetRow,
    addBudgetSubcategory,
    deleteBudgetRow,
    upsertBudgetRow,
    applyBudgetTableActions,
    buildPersistableBudgetContext: buildPersistableBudgetContextFn,
    applyStarterIfEmpty,
  };
}
