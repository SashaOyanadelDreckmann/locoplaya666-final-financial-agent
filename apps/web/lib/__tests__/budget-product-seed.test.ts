/** @jest-environment node */

import {
  buildBudgetRowsFromProducts,
  createBudgetStarterRows,
  hasBudgetProductSeedInput,
  inferBudgetRowGroupsFromLedgers,
  isBudgetProductSeededRows,
  mergeBudgetInitialRows,
  buildBudgetMovementLedgers,
} from '@financial-agent/shared';

describe('budget-product-seed', () => {
  it('falls back to starter template when there are no products', () => {
    expect(hasBudgetProductSeedInput([])).toBe(false);
    const rows = mergeBudgetInitialRows([], []);
    expect(rows.map((row) => row.id)).toEqual(createBudgetStarterRows().map((row) => row.id));
  });

  it('creates one grouped row per inferred transaction category', () => {
    const products = [
      {
        productId: 'acct-1',
        label: 'Cuenta corriente',
        bank: 'BCI',
        productType: 'checking_account',
        movements: [
          { description: 'Abono sueldo', amount: 950_000, direction: 'income' as const, category: 'Sueldo' },
          { description: 'Supermercado Lider', amount: 120_000, direction: 'expense' as const, category: 'Alimentación' },
          { description: 'Jumbo', amount: 80_000, direction: 'expense' as const, category: 'Supermercado' },
        ],
      },
    ];

    const rows = buildBudgetRowsFromProducts(products);
    expect(rows).toHaveLength(3);
    expect(rows.find((row) => row.category === 'Sueldo')).toMatchObject({
      type: 'income',
      amount: 950_000,
    });
    expect(rows.find((row) => row.category === 'Alimentación')).toMatchObject({
      type: 'expense',
      amount: 120_000,
    });
    expect(rows.find((row) => row.category === 'Supermercado')).toMatchObject({
      type: 'expense',
      amount: 80_000,
    });
    expect(isBudgetProductSeededRows(rows)).toBe(true);
  });

  it('does not collapse distinct categories into the three-row starter template', () => {
    const rows = buildBudgetRowsFromProducts([
      {
        productId: 'card-1',
        label: 'Tarjeta',
        bank: 'BCI',
        movements: [
          { description: 'Arriendo', amount: 450_000, direction: 'expense', category: 'Arriendo departamento' },
          { description: 'Luz', amount: 45_000, direction: 'expense', category: 'Cuenta de luz' },
          { description: 'Metro', amount: 35_000, direction: 'expense', category: 'Transporte urbano' },
          { description: 'Colegio', amount: 210_000, direction: 'expense', category: 'Colegio San Patricio' },
          { description: 'Sueldo', amount: 1_200_000, direction: 'income', category: 'Sueldo líquido' },
        ],
      },
    ]);

    expect(rows.length).toBeGreaterThanOrEqual(5);
    expect(rows.some((row) => row.id === 'income_salary')).toBe(false);
    expect(rows.some((row) => row.id === 'expense_rent')).toBe(false);
    expect(rows.some((row) => row.id === 'expense_other')).toBe(false);
  });

  it('merges the same category name across multiple products', () => {
    const ledgers = buildBudgetMovementLedgers([
      {
        productId: 'card-1',
        label: 'Tarjeta BCI',
        bank: 'BCI',
        movements: [
          { description: 'Uber', amount: 25_000, direction: 'expense', category: 'Transporte' },
        ],
      },
      {
        productId: 'card-2',
        label: 'Tarjeta Santander',
        bank: 'Santander',
        movements: [
          { description: 'Cabify', amount: 15_000, direction: 'expense', category: 'Transporte' },
        ],
      },
    ]);

    const { groups } = inferBudgetRowGroupsFromLedgers(ledgers);
    expect(Array.from(groups.values())).toHaveLength(1);
    expect(Array.from(groups.values())[0]).toMatchObject({
      name: 'Transporte',
      amount: 40_000,
    });

    const rows = buildBudgetRowsFromProducts([
      {
        productId: 'card-1',
        label: 'Tarjeta BCI',
        bank: 'BCI',
        movements: [{ description: 'Uber', amount: 25_000, direction: 'expense', category: 'Transporte' }],
      },
      {
        productId: 'card-2',
        label: 'Tarjeta Santander',
        bank: 'Santander',
        movements: [{ description: 'Cabify', amount: 15_000, direction: 'expense', category: 'Transporte' }],
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      category: 'Transporte',
      amount: 40_000,
      product: 'Varios productos',
    });
  });

  it('creates a placeholder row per product when there are no movements yet', () => {
    const rows = buildBudgetRowsFromProducts([
      {
        productId: 'card-1',
        label: 'Tarjeta Visa',
        bank: 'Santander',
        productType: 'credit_card',
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'product-card-1',
      category: 'Tarjeta Visa',
      amount: 0,
      product: 'Tarjeta Visa',
      institution: 'Santander',
    });
  });

  it('uses grouped category totals when movements are missing but aggregates exist', () => {
    const rows = buildBudgetRowsFromProducts([
      {
        productId: 'card-2',
        label: 'Tarjeta crédito',
        bank: 'BCI',
        topCategories: [{ name: 'Restaurantes', amount: 85_000 }],
        keyMetrics: { outflows_total: 85_000, movement_count: 3 },
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      category: 'Restaurantes',
      amount: 85_000,
      type: 'expense',
    });
  });

  it('keeps starter rows when product seed input is absent', () => {
    expect(mergeBudgetInitialRows(undefined, [])).toEqual(createBudgetStarterRows());
  });
});
