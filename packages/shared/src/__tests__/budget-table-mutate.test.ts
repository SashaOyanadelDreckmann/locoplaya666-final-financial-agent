/** @jest-environment node */

import { createBudgetStarterRows } from '../presupuesto/budget-rows';
import {
  buildBudgetTablePatch,
  inferBudgetTableConfirmationRequired,
  legacyBudgetUpdatesToActions,
  resolveBudgetRowIdForMutation,
} from '../presupuesto/budget-table-mutate';

describe('budget-table-mutate', () => {
  it('maps legacy budget updates to validated actions', () => {
    const rows = createBudgetStarterRows();
    const actions = legacyBudgetUpdatesToActions(rows, [
      { label: 'Ingreso principal', type: 'income', amount: 1_500_000 },
      { label: 'Arriendo', type: 'expense', amount: 450_000, category: 'Vivienda' },
    ]);
    expect(actions).toHaveLength(2);
    expect(actions[0]?.id).toBe('income_salary');
    expect(actions[0]?.amount).toBe(1_500_000);
  });

  it('requires confirmation for deletes', () => {
    const rows = createBudgetStarterRows();
    const patch = buildBudgetTablePatch(rows, [{ kind: 'delete', id: 'expense_other' }]);
    expect(patch.requires_confirmation).toBe(true);
    expect(patch.pending_confirmation?.actions).toHaveLength(1);
    expect(patch.actions).toHaveLength(0);
  });

  it('applies small updates without confirmation', () => {
    const rows = createBudgetStarterRows();
    const patch = buildBudgetTablePatch(rows, [
      { kind: 'update', id: 'income_salary', type: 'income', category: 'Ingreso principal', amount: 900_000 },
    ]);
    expect(patch.requires_confirmation).toBe(false);
    expect(patch.actions).toHaveLength(1);
  });

  it('resolves row ids from labels', () => {
    const rows = createBudgetStarterRows();
    const id = resolveBudgetRowIdForMutation(rows, {
      label: 'Gasto principal',
      type: 'expense',
    });
    expect(id).toBe('expense_rent');
  });

  it('infers confirmation for bulk adds', () => {
    const actions = [
      { kind: 'add' as const, id: 'expense_a', type: 'expense' as const, category: 'A', amount: 1 },
      { kind: 'add' as const, id: 'expense_b', type: 'expense' as const, category: 'B', amount: 2 },
      { kind: 'add' as const, id: 'expense_c', type: 'expense' as const, category: 'C', amount: 3 },
    ];
    expect(inferBudgetTableConfirmationRequired(actions)).toBe(true);
  });
});
