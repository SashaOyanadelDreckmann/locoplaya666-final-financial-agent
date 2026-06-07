import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseTransactionFileDetailed } from '../services/transactionParser.service';
import { extractMovements } from './documents';

const VISA_SIGNATURE_FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  '__fixtures__/visa-signature/Movimientos Nacionales de Tarjeta de Crédito_ (2).xlsx',
);

describe('visa signature credit card movements', () => {
  it('splits cargos and abonos for Movimientos Nacionales de Tarjeta de Crédito', async () => {
    if (!existsSync(VISA_SIGNATURE_FIXTURE)) {
      return;
    }

    const buffer = readFileSync(VISA_SIGNATURE_FIXTURE);
    const parsed = await parseTransactionFileDetailed(
      buffer,
      'Movimientos Nacionales de Tarjeta de Crédito_ (2).xlsx',
    );
    const doc = {
      name: 'Movimientos Nacionales de Tarjeta de Crédito_ (2).xlsx',
      text: parsed.text,
      structuredData: {
        rowCount: parsed.tables.reduce((acc, table) => acc + table.rows.length, 0),
        possibleTransactionCount: parsed.tables.reduce((acc, table) => acc + table.rows.length, 0),
        tables: parsed.tables,
        parserMeta: parsed.parserMeta,
      },
      summary: {},
    };

    const movements = extractMovements([doc], 'credit_card');
    const expenses = movements.filter((movement) => movement.direction === 'expense');
    const incomes = movements.filter((movement) => movement.direction === 'income');
    const outflows = expenses.reduce((acc, movement) => acc + movement.amount, 0);
    const inflows = incomes.reduce((acc, movement) => acc + movement.amount, 0);

    expect(movements).toHaveLength(48);
    expect(expenses).toHaveLength(42);
    expect(incomes).toHaveLength(6);
    expect(outflows).toBe(504_876);
    expect(inflows).toBe(114_254);
    expect(inflows - outflows).toBe(-390_622);
    expect(
      incomes.every(
        (movement) =>
          movement.description.includes('MONTO CANCELADO') ||
          movement.description.includes('DEV INTERESES'),
      ),
    ).toBe(true);
  });
});
