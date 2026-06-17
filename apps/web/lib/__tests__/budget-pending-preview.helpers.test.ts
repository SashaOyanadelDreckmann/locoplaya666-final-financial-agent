import { buildBudgetPendingPreviewItems, updateBudgetPendingActionsFromRowEdit } from '@/lib/presupuesto/budget-pending-preview.helpers';
import type { BudgetRow } from '@/lib/presupuesto/filas.helpers';
import type { BudgetTableAction } from '@financial-agent/shared';

const baseRows: BudgetRow[] = [
  {
    id: 'income_salary',
    category: 'Sueldo',
    type: 'income',
    amount: 1_200_000,
    cadence: 'fixed',
    paymentMethod: 'transfer',
    movementType: 'income_main',
  },
  {
    id: 'expense_rent',
    category: 'Arriendo',
    type: 'expense',
    amount: 450_000,
    cadence: 'fixed',
    paymentMethod: 'transfer',
    movementType: 'housing',
  },
];

describe('buildBudgetPendingPreviewItems', () => {
  it('builds an add preview row from pending actions', () => {
    const actions: BudgetTableAction[] = [
      {
        kind: 'add',
        id: 'expense-custom-1',
        category: 'Gimnasio',
        type: 'expense',
        amount: 35_000,
        cadence: 'fixed',
        payment_method: 'debit',
        movement_type: 'leisure_other',
      },
    ];

    const items = buildBudgetPendingPreviewItems(actions, baseRows);
    expect(items).toHaveLength(1);
    expect(items[0]?.kind).toBe('add');
    expect(items[0]?.row.category).toBe('Gimnasio');
    expect(items[0]?.row.amount).toBe(35_000);
  });

  it('builds an update preview row merged with the existing row', () => {
    const actions: BudgetTableAction[] = [
      {
        kind: 'update',
        id: 'expense_rent',
        amount: 480_000,
      },
    ];

    const items = buildBudgetPendingPreviewItems(actions, baseRows);
    expect(items).toHaveLength(1);
    expect(items[0]?.kind).toBe('update');
    expect(items[0]?.row.category).toBe('Arriendo');
    expect(items[0]?.row.amount).toBe(480_000);
  });

  it('builds a delete preview row from the existing table row', () => {
    const actions: BudgetTableAction[] = [{ kind: 'delete', id: 'expense_rent' }];

    const items = buildBudgetPendingPreviewItems(actions, baseRows);
    expect(items).toHaveLength(1);
    expect(items[0]?.kind).toBe('delete');
    expect(items[0]?.row.id).toBe('expense_rent');
    expect(items[0]?.row.category).toBe('Arriendo');
  });

  it('updates pending actions when the user edits a preview row before confirming', () => {
    const actions: BudgetTableAction[] = [
      {
        kind: 'update',
        id: 'expense_rent',
        amount: 480_000,
      },
    ];

    const next = updateBudgetPendingActionsFromRowEdit(actions, baseRows, 'expense_rent', 'amount', 500_000);
    expect(next).toHaveLength(1);
    expect(next[0]?.amount).toBe(500_000);

    const renamed = updateBudgetPendingActionsFromRowEdit(
      next,
      baseRows,
      'expense_rent',
      'category',
      'Arriendo + gastos comunes',
    );
    expect(renamed[0]?.category).toBe('Arriendo + gastos comunes');

    const preview = buildBudgetPendingPreviewItems(renamed, baseRows);
    expect(preview[0]?.row.amount).toBe(500_000);
    expect(preview[0]?.row.category).toBe('Arriendo + gastos comunes');
  });

  it('ignores edits on delete preview rows', () => {
    const actions: BudgetTableAction[] = [{ kind: 'delete', id: 'expense_rent' }];
    const next = updateBudgetPendingActionsFromRowEdit(actions, baseRows, 'expense_rent', 'amount', 1);
    expect(next[0]?.kind).toBe('delete');
    expect(next[0]?.amount).toBeUndefined();
  });
});
