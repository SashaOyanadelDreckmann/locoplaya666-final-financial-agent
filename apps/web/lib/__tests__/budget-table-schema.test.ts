import {
  hasBudgetFieldSignals,
  mergeBudgetActionIntoRow,
  parseBudgetFieldPatchFromAnswer,
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

  it('parses cadence, payment and movement patches from natural chat answers', () => {
    expect(parseBudgetFieldPatchFromAnswer('alimentación es variable, pago con tarjeta de crédito')).toMatchObject({
      cadence: 'variable',
      payment_method: 'credit',
    });
    expect(hasBudgetFieldSignals('250 mil fijo con débito')).toBe(true);
    expect(parseBudgetFieldPatchFromAnswer('pon categoría transporte')).toMatchObject({
      movement_type: 'transport',
    });
    expect(parseBudgetFieldPatchFromAnswer('alimentación es variable')).toMatchObject({
      cadence: 'variable',
    });
    expect(parseBudgetFieldPatchFromAnswer('alimentación es variable').movement_type).toBeUndefined();
  });

  it('summarizes action batches for confirmation copy', () => {
    const summary = summarizeBudgetActionBatch([
      { kind: 'update', id: 'expense_rent', category: 'Arriendo / vivienda', amount: 420000, cadence: 'fixed' },
      { kind: 'delete', id: 'expense_other' },
    ]);
    expect(summary.toLowerCase()).toContain('actualizar');
    expect(summary.toLowerCase()).toContain('eliminar');
  });
});
