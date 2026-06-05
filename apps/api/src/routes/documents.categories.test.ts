import { describe, expect, it } from 'vitest';
import { categorizeTransactionDescription } from './documents';
import XLSX from 'xlsx';
import { inferTransactionTaxonomy } from '../services/transactionTaxonomy.service';
import {
  isPdfExtractionWeak,
  parseCsvBufferDetailed,
  parseTransactionFileDetailed,
} from '../services/transactionParser.service';

describe('transaction categorization', () => {
  it('classifies Chilean merchants into the expected senior categories', () => {
    expect(categorizeTransactionDescription('PEDIDOSYA CL 12345')).toBe('Delivery');
    expect(categorizeTransactionDescription('Uber Eats Santiago')).toBe('Delivery');
    expect(categorizeTransactionDescription('EKONO LA FLORIDA')).toBe('Supermercado');
    expect(categorizeTransactionDescription('SANTA ISABEL LAS CONDES')).toBe('Supermercado');
    expect(categorizeTransactionDescription('LIDER EXPRESS VITACURA')).toBe('Supermercado');
    expect(categorizeTransactionDescription('SODIMAC HOMECENTER')).toBe('Hogar y Mejoramiento');
    expect(categorizeTransactionDescription('FALABELLA RETAIL CHILE')).toBe('Retail y Marketplace');
    expect(categorizeTransactionDescription('MOVISTAR CHILE')).toBe('Telecomunicaciones');
    expect(categorizeTransactionDescription('AGUAS ANDINAS')).toBe('Servicios Basicos');
    expect(categorizeTransactionDescription("MCDONALD'S PROVIDENCIA")).toBe('Comida rapida');
    expect(categorizeTransactionDescription('AUTOPISTA CENTRAL TAG')).toBe('Autopistas y Peajes');
    expect(categorizeTransactionDescription('LATAM AIRLINES')).toBe('Viajes y Turismo');
  });

  it('keeps generic purchases from collapsing into Otros', () => {
    expect(categorizeTransactionDescription('Compra nacional TIENDA ONLINE SHEIN')).toBe('Retail y Marketplace');
    expect(categorizeTransactionDescription('Pago tarjeta cuota 3')).toBe('Servicios Financieros');
    expect(categorizeTransactionDescription('Transferencia TEF recibida')).toBe('Transferencias');
  });

  it('normalizes merchant and category confidence for known Chilean merchants', () => {
    expect(inferTransactionTaxonomy('COMPRA PEDIDOSYA CL 12345')).toMatchObject({
      category: 'Delivery',
      merchant: 'PedidosYa',
    });
    expect(inferTransactionTaxonomy('COMPRA EKONO MAIPU')).toMatchObject({
      category: 'Supermercado',
      merchant: 'Ekono',
    });
    expect(inferTransactionTaxonomy('COMPRA AGUAS ANDINAS').categoryConfidence).toBeGreaterThan(0.94);
    expect(inferTransactionTaxonomy('PAGO TIENDA ONLINE MARKETPLACE').merchant).toBe('TIENDA ONLINE MARKETPLACE');
  });
});

describe('transaction parser', () => {
  it('parses csv transaction tables with exact rows', async () => {
    const csv = [
      'Fecha;Detalle;Cargo;Abono;Saldo',
      '2026-05-01;PEDIDOSYA CL 12345;12900;;150000',
      '2026-05-02;SUELDO MAYO;;950000;1100000',
    ].join('\n');

    const parsed = await parseCsvBufferDetailed(Buffer.from(csv, 'utf-8'), 'cartola.csv');
    expect(parsed.tables).toHaveLength(1);
    expect(parsed.tables[0].headers).toContain('Fecha');
    expect(parsed.tables[0].rows).toHaveLength(2);
    expect(parsed.parserMeta?.confidence).toBeGreaterThan(0.9);
    expect(parsed.text).toContain('PEDIDOSYA CL 12345');
  });

  it('skips csv metadata rows and starts from canonical banking headers', async () => {
    const csv = [
      'Banco Demo',
      'Cartola cuenta corriente',
      'Periodo;2026-05',
      'Cliente;Ada Lovelace',
      'Fecha;Detalle;Cargo;Abono;Saldo',
      '2026-05-01;SUPERMERCADO;12900;;150000',
      '2026-05-02;SUELDO;;950000;1100000',
    ].join('\n');

    const parsed = await parseCsvBufferDetailed(Buffer.from(csv, 'utf-8'), 'cartola.csv');
    expect(parsed.tables).toHaveLength(1);
    expect(parsed.tables[0].headers).toEqual(['Fecha', 'Detalle', 'Cargo', 'Abono', 'Saldo']);
    expect(parsed.tables[0].rows).toHaveLength(2);
    expect(parsed.tables[0].rows[0][1]).toBe('SUPERMERCADO');
  });

  it('parses xls workbooks as transaction tables', async () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ['Fecha', 'Detalle', 'Cargo', 'Abono', 'Saldo'],
      ['2026-05-03', 'SODIMAC HOMECENTER', 45990, '', 154010],
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, 'Movimientos');
    const xlsBuffer = XLSX.write(workbook, { bookType: 'biff8', type: 'buffer' }) as Buffer;

    const parsed = await parseTransactionFileDetailed(xlsBuffer, 'cartola.xls');
    expect(parsed.tables).toHaveLength(1);
    expect(parsed.tables[0].rows).toHaveLength(1);
    expect(parsed.text).toContain('SODIMAC HOMECENTER');
  });

  it('flags sparse pdf text as a weak extraction candidate for OCR fallback', () => {
    expect(isPdfExtractionWeak('', [])).toBe(true);
    expect(isPdfExtractionWeak('SALDO FINAL 100000', [])).toBe(true);
    expect(
      isPdfExtractionWeak(
        'Fecha Detalle Cargo Abono Saldo\n2026-05-03 SODIMAC HOMECENTER 45990 154010',
        [],
      ),
    ).toBe(true);
    expect(
      isPdfExtractionWeak(
        [
          'Fecha Detalle Cargo Abono Saldo',
          '2026-05-03 SODIMAC HOMECENTER 45990 154010',
          '2026-05-04 SUPERMERCADO LIDER 21500 132510',
          '2026-05-05 MOVISTAR 18990 113520',
          '2026-05-06 AGUAS ANDINAS 24500 89020',
        ].join('\n'),
        [
          {
            name: 'P1',
            headers: ['Fecha', 'Detalle', 'Cargo', 'Saldo'],
            rows: [
              ['2026-05-03', 'SODIMAC HOMECENTER', '45990', '154010'],
              ['2026-05-04', 'SUPERMERCADO LIDER', '21500', '132510'],
            ],
            source: 'pdf',
          },
        ],
      ),
    ).toBe(false);
  });
});
