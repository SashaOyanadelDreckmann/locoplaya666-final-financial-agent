/** @jest-environment node */

import {
  canonicalBudgetRowId,
  computeBudgetInsights,
  computeBudgetSignals,
  computeBudgetTotals,
  createBudgetStarterRows,
  DEFAULT_BUDGET_ROWS,
  buildPersistableBudgetContext,
  collectBudgetDescendantIds,
  getEffectiveBudgetRows,
  normalizeBudgetRow,
  reconcileBudgetRows,
} from '../presupuesto/filas.helpers';

describe('budget-rows helpers', () => {
  it('maps legacy hyphen ids to canonical snake_case ids', () => {
    expect(canonicalBudgetRowId('income-salary')).toBe('income_salary');
    expect(canonicalBudgetRowId('custom_row')).toBe('custom_row');
  });

  it('normalizes row ids on ingest', () => {
    const row = normalizeBudgetRow({
      id: 'expense-food',
      category: 'Comida',
      type: 'expense',
      amount: 100,
    });
    expect(row.id).toBe('expense_food');
    expect(row.amount).toBe(100);
  });

  it('provides eight starter rows with expected income/expense mix', () => {
    const rows = createBudgetStarterRows();
    expect(rows).toHaveLength(8);
    expect(rows.filter((r) => r.type === 'income')).toHaveLength(1);
    expect(DEFAULT_BUDGET_ROWS[0]?.id).toBe('income_salary');
  });

  it('computes totals and insights from hierarchical rows', () => {
    const rows = reconcileBudgetRows([
      { id: 'income_salary', category: 'Sueldo', type: 'income', amount: 1000 },
      { id: 'expense_rent', category: 'Arriendo', type: 'expense', amount: 400 },
    ]);
    const totals = computeBudgetTotals(rows);
    expect(totals.income).toBe(1000);
    expect(totals.balance).toBe(600);
    const insights = computeBudgetInsights(rows, totals);
    expect(insights.healthScore).toBeGreaterThan(0);
    expect(computeBudgetSignals(rows, totals, insights.healthScore).balanceTone).toBe('surplus');
  });

  it('rolls child rows into parents without double counting', () => {
    const rows = reconcileBudgetRows([
      { id: 'income_salary', category: 'Sueldo', type: 'income', amount: 1000 },
      { id: 'expense_rent', category: 'Arriendo', type: 'expense', amount: 400 },
      { id: 'expense_rent_sub', category: 'Dividendo', type: 'expense', amount: 100, parentId: 'expense_rent' },
    ]);

    expect(rows.find((row) => row.id === 'expense_rent')?.amount).toBe(100);
    expect(getEffectiveBudgetRows(rows).some((row) => row.id === 'expense_rent')).toBe(false);
    expect(getEffectiveBudgetRows(rows).some((row) => row.id === 'expense_rent_sub')).toBe(true);

    const totals = computeBudgetTotals(rows);
    expect(totals.expenses).toBe(100);

    const persistable = buildPersistableBudgetContext(rows, totals);
    expect(persistable.rows.find((row) => row.id === 'expense_rent_sub')?.parentId).toBe('expense_rent');
  });

  it('collects cascade delete ids for parent rows', () => {
    const rows = reconcileBudgetRows([
      { id: 'income_salary', category: 'Sueldo', type: 'income', amount: 1000 },
      { id: 'expense_rent', category: 'Arriendo', type: 'expense', amount: 400 },
      { id: 'expense_rent_sub', category: 'Dividendo', type: 'expense', amount: 100, parentId: 'expense_rent' },
    ]);

    expect(Array.from(collectBudgetDescendantIds(rows, 'expense_rent'))).toEqual(
      expect.arrayContaining(['expense_rent', 'expense_rent_sub']),
    );
  });
});
