'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  buildPersistableBudgetContext,
  computeBudgetCompletion,
  computeBudgetInsights,
  computeBudgetSignals,
  computeBudgetTotals,
  createBudgetStarterRows,
  MAX_BUDGET_ROWS,
  mergeBudgetTemplate,
  reconcileBudgetRows,
  type BudgetRow,
} from '@/lib/budget-rows.helpers';
import {
  mergeBudgetActionIntoRow,
  normalizeBudgetActionRowId,
  type BudgetTableAction,
} from '@financial-agent/shared';

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
        row.id === id
          ? {
              ...row,
              [field]: field === 'amount' ? Number(value) || 0 : value,
            }
          : row,
      );
      const propagated =
        field === 'type'
          ? updated.map((row) => {
              const parent = updated.find((candidate) => candidate.id === row.parentId);
              if (!parent) return row;
              if (row.type === parent.type) return row;
              return { ...row, type: parent.type };
            })
          : updated;
      return reconcileBudgetRows(propagated);
    });
  }, []);

  const applyBudgetTemplate = useCallback(() => {
    setBudgetRows((rows) => mergeBudgetTemplate(rows));
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
      const parent = rows.find((row) => row.id === parentId);
      if (!parent) return rows;
      const siblings = rows.filter((row) => row.parentId === parentId);
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
      const deleteSet = new Set([id]);
      let changed = true;
      while (changed) {
        changed = false;
        rows.forEach((row) => {
          if (row.parentId && deleteSet.has(row.parentId) && !deleteSet.has(row.id)) {
            deleteSet.add(row.id);
            changed = true;
          }
        });
      }
      return reconcileBudgetRows(rows.filter((row) => !deleteSet.has(row.id)));
    });
  }, []);

  const upsertBudgetRow = useCallback((row: BudgetRow) => {
    setBudgetRows((rows) => {
      const idx = rows.findIndex((item) => item.id === row.id);
      if (idx >= 0) {
        return reconcileBudgetRows(rows.map((item) => (item.id === row.id ? { ...item, ...row } : item)));
      }
      if (rows.length >= MAX_BUDGET_ROWS) return rows;
      return reconcileBudgetRows([...rows, row]);
    });
  }, []);

  const applyBudgetTableActions = useCallback((actions: BudgetTableAction[]) => {
    if (!Array.isArray(actions) || actions.length === 0) return;
    setBudgetRows((rows) => {
      let next = [...rows];
      for (const action of actions) {
        const rowId = normalizeBudgetActionRowId(action.id);
        if (!rowId) continue;
        if (action.kind === 'delete') {
          const deleteSet = new Set([rowId]);
          let changed = true;
          while (changed) {
            changed = false;
            next.forEach((row) => {
              if (row.parentId && deleteSet.has(row.parentId) && !deleteSet.has(row.id)) {
                deleteSet.add(row.id);
                changed = true;
              }
            });
          }
          next = next.filter((row) => !deleteSet.has(row.id));
          continue;
        }
        const existing =
          next.find((row) => normalizeBudgetActionRowId(row.id) === rowId) ?? null;
        const merged = mergeBudgetActionIntoRow(existing, { ...action, id: rowId });
        if (!merged) continue;
        const idx = next.findIndex((row) => normalizeBudgetActionRowId(row.id) === rowId);
        if (idx >= 0) {
          next[idx] = { ...next[idx], ...merged };
        } else if (next.length < MAX_BUDGET_ROWS) {
          next.push(merged);
        }
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
