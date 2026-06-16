import {
  applyValidatedBudgetTableAction,
  hasBudgetFieldSignals,
  isBudgetMetaOrHelpQuestion,
  mergeBudgetActionIntoRow,
  parseBudgetCategoryFromAnswer,
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

  it('validates dependent action batches against simulated row state', () => {
    const validated = validateBudgetTableActions(
      [
        {
          kind: 'add',
          id: 'expense-custom-gym',
          category: 'Gym',
          type: 'expense',
          amount: 0,
        },
        {
          kind: 'update',
          id: 'expense-custom-gym',
          category: 'Gym',
          type: 'expense',
          amount: 30000,
        },
      ],
      baseRows,
    );

    expect(validated).toHaveLength(2);
    expect(validated[1]).toMatchObject({ kind: 'update', id: 'expense-custom-gym', amount: 30000 });
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

  it('does not treat help questions as category names', () => {
    expect(isBudgetMetaOrHelpQuestion('¿cómo cuál podría agregar?')).toBe(true);
    expect(parseBudgetCategoryFromAnswer('si, como cual podria agregar')).toBeNull();
    expect(parseBudgetCategoryFromAnswer('supermercado')).toBe('Supermercado');
  });

  it('applies delete actions using canonical row ids even when rows use aliases', () => {
    const rows: BudgetRow[] = [
      { id: 'income-salary', category: 'Sueldo líquido', type: 'income', amount: 0 },
      { id: 'expense-rent', category: 'Arriendo / vivienda', type: 'expense', amount: 0 },
    ];
    const validated = validateBudgetTableActions(
      [
        { kind: 'delete', id: 'income_salary' },
        { kind: 'delete', id: 'expense_rent' },
      ],
      rows,
    );
    expect(validated).toHaveLength(2);

    let next = rows;
    for (const action of validated) {
      next = applyValidatedBudgetTableAction(next, action);
    }
    expect(next).toHaveLength(0);
  });
});
