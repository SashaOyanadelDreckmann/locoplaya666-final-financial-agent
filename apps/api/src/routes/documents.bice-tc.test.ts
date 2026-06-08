import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseTransactionFileDetailed } from '../services/transactionParser.service';
import { extractMovements } from './documents';

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__/bice-tc');

function loadFixture(name: string) {
  const path = join(FIXTURES_DIR, name);
  if (!existsSync(path)) return null;
  const buffer = readFileSync(path);
  return { name, buffer };
}

function extractFromFixture(name: string, buffer: Buffer) {
  return parseTransactionFileDetailed(buffer, name).then((parsed) => {
    const doc = {
      name,
      text: parsed.text,
      structuredData: {
        rowCount: parsed.tables.reduce((acc, table) => acc + table.rows.length, 0),
        possibleTransactionCount: parsed.tables.reduce((acc, table) => acc + table.rows.length, 0),
        tables: parsed.tables,
        parserMeta: parsed.parserMeta,
      },
      summary: {},
    };
    return extractMovements([doc], 'credit_card');
  });
}

describe('BICE credit card excel exports', () => {
  it('treats Pago Pesos TEF as abonos in Mov_Facturado.xls', async () => {
    const fixture = loadFixture('Mov_Facturado.xls');
    if (!fixture) return;

    const movements = await extractFromFixture(fixture.name, fixture.buffer);
    const payments = movements.filter((movement) => /pago pesos/i.test(movement.description));
    const expenses = movements.filter((movement) => movement.direction === 'expense');
    const incomes = movements.filter((movement) => movement.direction === 'income');

    expect(movements).toHaveLength(15);
    expect(payments).toHaveLength(3);
    expect(payments.every((movement) => movement.direction === 'income')).toBe(true);
    expect(payments.reduce((acc, movement) => acc + movement.amount, 0)).toBe(336_446);
    expect(
      movements.find((movement) => movement.description.includes('COMISION MENSUAL'))?.direction,
    ).toBe('expense');
    expect(
      movements.find((movement) => movement.description.includes('IMPUESTO DECRETO'))?.direction,
    ).toBe('expense');
    expect(expenses.reduce((acc, movement) => acc + movement.amount, 0)).toBe(397_765);
    expect(incomes.reduce((acc, movement) => acc + movement.amount, 0)).toBe(336_446);
  });

  it('reads real amounts from Saldo_y_Mov_No_Facturado.xls', async () => {
    const fixture = loadFixture('Saldo_y_Mov_No_Facturado.xls');
    if (!fixture) return;

    const movements = await extractFromFixture(fixture.name, fixture.buffer);
    const payments = movements.filter((movement) => /pago pesos/i.test(movement.description));
    const purchases = movements.filter(
      (movement) => movement.direction === 'expense' && !/pago pesos/i.test(movement.description),
    );

    expect(movements).toHaveLength(15);
    expect(payments.length).toBeGreaterThanOrEqual(4);
    expect(payments.every((movement) => movement.direction === 'income')).toBe(true);
    expect(payments.reduce((acc, movement) => acc + movement.amount, 0)).toBe(159_000);
    expect(purchases.reduce((acc, movement) => acc + movement.amount, 0)).toBe(210_813);
    expect(movements.every((movement) => movement.amount >= 100)).toBe(true);
  });

  it('combines facturado and no facturado without misclassifying payments', async () => {
    const facturado = loadFixture('Mov_Facturado.xls');
    const noFacturado = loadFixture('Saldo_y_Mov_No_Facturado.xls');
    if (!facturado || !noFacturado) return;

    const docs = await Promise.all([
      parseTransactionFileDetailed(facturado.buffer, facturado.name),
      parseTransactionFileDetailed(noFacturado.buffer, noFacturado.name),
    ]);

    const movements = extractMovements(
      docs.map((parsed, index) => ({
        name: index === 0 ? facturado.name : noFacturado.name,
        text: parsed.text,
        structuredData: {
          rowCount: parsed.tables.reduce((acc, table) => acc + table.rows.length, 0),
          possibleTransactionCount: parsed.tables.reduce((acc, table) => acc + table.rows.length, 0),
          tables: parsed.tables,
          parserMeta: parsed.parserMeta,
        },
        summary: {},
      })),
      'credit_card',
    );

    const expenses = movements.filter((movement) => movement.direction === 'expense');
    const incomes = movements.filter((movement) => movement.direction === 'income');
    const paymentRows = movements.filter((movement) => /pago pesos/i.test(movement.description));

    expect(movements).toHaveLength(30);
    expect(paymentRows).toHaveLength(7);
    expect(paymentRows.every((movement) => movement.direction === 'income')).toBe(true);
    expect(expenses.reduce((acc, movement) => acc + movement.amount, 0)).toBe(608_578);
    expect(incomes.reduce((acc, movement) => acc + movement.amount, 0)).toBe(495_446);
    expect(incomes.reduce((acc, movement) => acc + movement.amount, 0) - expenses.reduce((acc, movement) => acc + movement.amount, 0)).toBe(-113_132);
  });
});
