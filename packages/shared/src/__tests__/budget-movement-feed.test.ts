/** @jest-environment node */

import {
  buildBudgetMovementLedgers,
  buildBudgetProductMovementLedger,
  budgetProductTypeLabel,
} from '@financial-agent/shared';

describe('budget-movement-feed', () => {
  it('groups movements by financial product with chronological order and derived totals', () => {
    const ledger = buildBudgetProductMovementLedger({
      productId: 'prod-1',
      label: 'Cuenta Corriente BCI',
      bank: 'BCI',
      productType: 'checking_account',
      movements: [
        { date: '2026-02-10', description: 'Supermercado Lider', amount: 80_000, direction: 'expense', category: 'Supermercado' },
        { date: '2026-02-05', description: 'Abono sueldo', amount: 1_200_000, direction: 'income', category: 'Sueldo' },
      ],
    });

    expect(budgetProductTypeLabel('checking_account')).toBe('Cuenta corriente');
    expect(ledger.totals.inflows).toBe(1_200_000);
    expect(ledger.totals.outflows).toBe(80_000);
    expect(ledger.totals.movementCount).toBe(2);
    expect(ledger.movements[0]?.description).toBe('Abono sueldo');
    expect(ledger.categoryTotals.some((item) => item.name === 'Sueldo')).toBe(true);
  });

  it('builds one ledger per product without mixing banks', () => {
    const ledgers = buildBudgetMovementLedgers([
      {
        productId: 'a',
        label: 'Visa Falabella',
        bank: 'Falabella',
        productType: 'credit_card',
        movements: [{ description: 'Cuota crédito', amount: 120_000, direction: 'expense', category: 'Deuda' }],
      },
      {
        productId: 'b',
        label: 'Cuenta Vista',
        bank: 'BancoEstado',
        productType: 'debit_account',
        movements: [{ description: 'Transferencia arriendo', amount: 350_000, direction: 'expense', category: 'Arriendo' }],
      },
    ]);

    expect(ledgers).toHaveLength(2);
    expect(ledgers[0]?.productId).toBe('a');
    expect(ledgers[1]?.bank).toBe('BancoEstado');
  });
});
