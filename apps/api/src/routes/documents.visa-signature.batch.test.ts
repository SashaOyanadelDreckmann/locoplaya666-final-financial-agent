import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseTransactionFileDetailed } from '../services/transactionParser.service';
import { extractMovements } from './documents';

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__/visa-signature');
const DOWNLOADS_DIR = '/Users/locoplaya666/Downloads';

function listVisaFixtureFiles(): string[] {
  const dirs = [FIXTURES_DIR, DOWNLOADS_DIR].filter((dir) => existsSync(dir));
  const names = new Set<string>();
  for (const dir of dirs) {
    for (const name of readdirSync(dir)) {
      if (name.toLowerCase().includes('movimientos nacionales de tarjeta') && name.toLowerCase().endsWith('.xlsx')) {
        names.add(name);
      }
    }
  }
  return [...names].sort();
}

function resolveFixturePath(filename: string): string {
  const fixturePath = join(FIXTURES_DIR, filename);
  if (existsSync(fixturePath)) return fixturePath;
  return join(DOWNLOADS_DIR, filename);
}

function parseChileanAmount(raw: string): number | null {
  let s = String(raw ?? '').replace(/CLP/gi, '').trim();
  if (!s) return null;
  const hasDot = s.includes('.');
  const hasComma = s.includes(',');
  if (hasDot && hasComma) {
    const lastDot = s.lastIndexOf('.');
    const lastComma = s.lastIndexOf(',');
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (hasComma) {
    const parts = s.split(',');
    if (parts.length === 2 && parts[1].length === 3) s = parts.join('');
    else s = s.replace(',', '.');
  } else if (hasDot) {
    const parts = s.split('.');
    if (parts.length === 2 && parts[1].length === 3) s = parts.join('');
  }
  const n = Number(s.replace(/\s/g, ''));
  return Number.isFinite(n) ? n : null;
}

function readBankTotals(matrix: string[][]) {
  for (const row of matrix) {
    const joined = row.join(' ').toLowerCase();
    if (!joined.includes('total cargos') && !joined.includes('total abonos')) continue;
    const abonoIdx = row.findIndex((cell) => /total abonos/i.test(cell));
    const cargoIdx = row.findIndex((cell) => /total cargos/i.test(cell));
    let totalAbonos: number | null = null;
    let totalCargos: number | null = null;
    if (abonoIdx >= 0) {
      for (let i = abonoIdx + 1; i < row.length; i++) {
        const v = parseChileanAmount(row[i] ?? '');
        if (v !== null) {
          totalAbonos = Math.abs(v);
          break;
        }
      }
    }
    if (cargoIdx >= 0) {
      for (let i = cargoIdx + 1; i < row.length; i++) {
        const v = parseChileanAmount(row[i] ?? '');
        if (v !== null && v > 0) {
          totalCargos = v;
          break;
        }
      }
    }
    if (totalAbonos !== null || totalCargos !== null) return { totalAbonos, totalCargos };
  }
  return { totalAbonos: null, totalCargos: null };
}

type RawRow = { category: string; description: string; amount: number; signedAmount: number };

function readRawRows(matrix: string[][]): RawRow[] {
  const rows: RawRow[] = [];
  let headerIdx = -1;
  let amountCol = -1;
  let categoryCol = -1;
  let descCol = -1;
  for (let i = 0; i < matrix.length; i++) {
    const headers = matrix[i].map((c) => String(c).toLowerCase());
    if (headers.some((h) => h.includes('fecha')) && headers.some((h) => h.includes('monto'))) {
      headerIdx = i;
      amountCol = headers.findIndex((h) => h.includes('monto'));
      categoryCol = headers.findIndex((h) => h.includes('categoria'));
      descCol = headers.findIndex((h) => h.includes('detalle'));
      break;
    }
  }
  if (headerIdx < 0 || amountCol < 0) return rows;
  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const row = matrix[i];
    const fecha = String(row[0] ?? '').trim();
    if (!fecha || fecha.startsWith('*') || /infórmate/i.test(fecha)) continue;
    const signedAmount = parseChileanAmount(row[amountCol] ?? '');
    if (signedAmount === null || signedAmount === 0) continue;
    rows.push({
      category: String(row[categoryCol] ?? ''),
      description: String(row[descCol] ?? ''),
      amount: Math.abs(signedAmount),
      signedAmount,
    });
  }
  return rows;
}

function isSourceAbono(row: RawRow): boolean {
  return row.signedAmount < 0 || /\babonos?\b/i.test(row.category);
}

const VISA_FILES = listVisaFixtureFiles();

describe('visa signature batch fixtures', () => {
  if (VISA_FILES.length === 0) {
    it.skip('no visa signature fixtures available', () => undefined);
    return;
  }

  it.each(VISA_FILES)('never misclassifies abonos/ingresos as expenses: %s', async (filename) => {
    const buffer = readFileSync(resolveFixturePath(filename));
    const parsed = await parseTransactionFileDetailed(buffer, filename);
    const matrix = (parsed.tables[0]?.rows ?? []) as string[][];
    const rawRows = readRawRows(matrix);
    const bank = readBankTotals(matrix);

    const doc = {
      name: filename,
      text: parsed.text,
      structuredData: {
        tables: parsed.tables,
        possibleTransactionCount: rawRows.length,
        rowCount: matrix.length,
      },
      summary: {},
    };
    const movements = extractMovements([doc], 'credit_card');
    const expenses = movements.filter((movement) => movement.direction === 'expense');
    const incomes = movements.filter((movement) => movement.direction === 'income');
    const outflows = expenses.reduce((acc, movement) => acc + movement.amount, 0);
    const inflows = incomes.reduce((acc, movement) => acc + movement.amount, 0);
    const sourceAbonos = rawRows.filter(isSourceAbono);

    const misclassifiedAbonos = movements.filter((movement) => {
      if (movement.direction !== 'expense') return false;
      if (/cancelado|dev intereses|\babono\b/i.test(`${movement.description} ${movement.source_line ?? ''}`)) {
        return true;
      }
      return sourceAbonos.some(
        (raw) =>
          raw.amount === movement.amount &&
          movement.description.toUpperCase().includes(raw.description.replace(/^\*\s*/, '').slice(0, 8).toUpperCase()),
      );
    });

    const misclassifiedCargos = movements.filter(
      (movement) =>
        movement.direction === 'income' &&
        movement.movement_kind !== 'abono' &&
        rawRows.some(
          (raw) =>
            raw.signedAmount > 0 &&
            !isSourceAbono(raw) &&
            raw.amount === movement.amount &&
            movement.description.toUpperCase().includes(raw.description.replace(/^\*\s*/, '').slice(0, 8).toUpperCase()),
        ),
    );

    expect(misclassifiedAbonos, `abono→expense in ${filename}`).toHaveLength(0);
    expect(misclassifiedCargos, `cargo→income in ${filename}`).toHaveLength(0);
    expect(outflows).toBeGreaterThan(0);
    expect(outflows).toBeLessThanOrEqual(bank.totalCargos ?? Number.MAX_SAFE_INTEGER);
    expect(inflows).toBeLessThanOrEqual(bank.totalAbonos ?? Number.MAX_SAFE_INTEGER);
    if ((bank.totalAbonos ?? 0) > 0) {
      expect(inflows).toBeGreaterThan(0);
    }
    expect(inflows - outflows).toBe((bank.totalAbonos ?? inflows) - (bank.totalCargos ?? outflows));
  });
});
