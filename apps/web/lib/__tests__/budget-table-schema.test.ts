import {
  mergeBudgetActionIntoRow,
  summarizeBudgetActionBatch,
  validateBudgetTableAction,
  validateBudgetTableActions,
  type BudgetRow,
} from '@financial-agent/shared';

const baseRows: BudgetRow[] = [
  { id: 'income_salary', category: 'Sueldo líquido', type: 'income', amount: 850000 },
  { id: 'expense_rent', category: 'Arriendo / vivienda', type: 'expense', amount: 0 },
];

describe('budget-table-schema', () => {
  it('merges partial updates without overwriting untouched fields', () => {
    const merged = mergeBudgetActionIntoRow(baseRows[0]!, {
      kind: 'update',
      id: 'income_salary',
      amount: 900000,
    });
    expect(merged).toMatchObject({
      id: 'income_salary',
      category: 'Sueldo líquido',
      type: 'income',
      amount: 900000,
    });
  });

  it('validates delete actions only for existing rows', () => {
    expect(validateBudgetTableAction({ kind: 'delete', id: 'expense_rent' }, baseRows)).toEqual({
      ok: true,
      action: { kind: 'delete', id: 'expense_rent' },
    });
    expect(validateBudgetTableAction({ kind: 'delete', id: 'missing-row' }, baseRows)).toEqual({
      ok: false,
      reason: 'delete_unknown_row',
    });
  });

  it('normalizes add into update when the row already exists', () => {
    const validated = validateBudgetTableActions(
      [{ kind: 'add', id: 'expense_rent', category: 'Arriendo / vivienda', type: 'expense', amount: 420000 }],
      baseRows,
    );
    expect(validated[0]).toMatchObject({ kind: 'update', id: 'expense_rent', amount: 420000 });
  });

  it('summarizes action batches for confirmation copy', () => {
    const summary = summarizeBudgetActionBatch([
      { kind: 'update', id: 'expense_rent', category: 'Arriendo / vivienda', amount: 420000, cadence: 'fixed' },
      { kind: 'delete', id: 'expense_other' },
    ]);
    expect(summary).toContain('actualizar');
    expect(summary).toContain('eliminar expense_other');
  });
});
