import { describe, expect, it } from 'vitest';
import { extractMovements, inferMovementDirection, inferMovementKind, toIsoDate } from './documents';

describe('documents movement direction', () => {
  it('keeps credit card abonos semantically separate from income', () => {
    expect(inferMovementKind('Abono tarjeta de crédito', 120000, '', 'credit_card')).toBe('abono');
    expect(inferMovementKind('Pago mínimo tarjeta', 45000, '', 'credit_card')).toBe('abono');
    expect(inferMovementDirection('Abono tarjeta de crédito', 120000, '', 'credit_card')).toBe('income');
  });

  it('keeps credit card purchases as expense', () => {
    expect(inferMovementDirection('Compra supermercado', 58000, '', 'credit_card')).toBe('expense');
    expect(inferMovementDirection('Cargo webpay', 22000, '', 'credit_card')).toBe('expense');
  });

  it('preserves standard banking semantics for other products', () => {
    expect(inferMovementKind('Abono transferencia recibida', 80000, '', 'checking_account')).toBe('abono');
    expect(inferMovementKind('Pago recibido transferencia', 80000, '', 'checking_account')).toBe('abono');
    expect(inferMovementKind('Sueldo mensual', 800000, '', 'checking_account')).toBe('income');
    expect(inferMovementDirection('Abono transferencia recibida', 80000, '', 'checking_account')).toBe('income');
    expect(inferMovementDirection('Cargo por mantención', 4900, '', 'checking_account')).toBe('expense');
  });

  it('accepts wallet rows with date-time and Tipo direction markers', () => {
    const line = '03/04/2026 12:33 | Transferencia recibida | 10.000 | Abono | 25.000';
    expect(inferMovementKind(line, 10000, '10.000', 'debit_account')).toBe('abono');
    expect(inferMovementDirection(line, 10000, '10.000', 'debit_account')).toBe('income');
    expect(toIsoDate('03/04/2026 12:33')).toBe('2026-04-03');
  });

  it('classifies Visa Signature credit card cargos and abonos by sign and category', () => {
    const purchase =
      '05/06/2026 | Autos Y Transporte | * PAYU UBER TRIP COMPRAS | | | | | 1 de 1 | 2,930';
    const abono = '04/06/2026 | Abonos | MONTO CANCELADO | | | | | | -10,000';
    const devolucion = '01/06/2026 | Abonos | DEV INTERESES CAMPANA 3 | | | | | | -19,254';

    expect(inferMovementDirection(purchase, 2930, '2,930', 'credit_card')).toBe('expense');
    expect(inferMovementKind(purchase, 2930, '2,930', 'credit_card')).toBe('expense');
    expect(inferMovementDirection(abono, -10000, '-10,000', 'credit_card')).toBe('income');
    expect(inferMovementKind(abono, -10000, '-10,000', 'credit_card')).toBe('abono');
    expect(inferMovementDirection(devolucion, -19254, '-19,254', 'credit_card')).toBe('income');
    expect(inferMovementKind(devolucion, -19254, '-19,254', 'credit_card')).toBe('abono');
  });

  it('does not treat calendar dates as installment fractions', () => {
    const datedPurchase =
      '05/06/2026 | Hogar | * EKONO COVENTRY COMPRAS | | | | | | 7,100';
    expect(inferMovementDirection(datedPurchase, 7100, '7,100', 'credit_card')).toBe('expense');
  });

  it('uses explicit Cargos category for visa signature rows without abonos', () => {
    const cargoRow =
      '27/05/2026 | Cargos | MERCADOPAGO LOSTRESNUNOLAS CONDES | | | | | 1 de 1 | 1,300';
    expect(inferMovementDirection(cargoRow, 1300, '1,300', 'credit_card')).toBe('expense');
    expect(inferMovementKind(cargoRow, 1300, '1,300', 'credit_card')).toBe('expense');
  });

  it('classifies BICE card payments as abonos', () => {
    expect(inferMovementDirection('Pago Pesos TEF', 186446, '186446', 'credit_card')).toBe('income');
    expect(inferMovementKind('Pago Pesos TEF PAGO NORMAL', -40000, '-40000', 'credit_card')).toBe('abono');
  });

  it('classifies BICE mobile app screenshots by +/- sign convention', () => {
    expect(inferMovementDirection('Pago pesos tef', 186446, '+$186.446', 'credit_card')).toBe('income');
    expect(inferMovementKind('Pago pesos tef', 186446, '+$186.446', 'credit_card')).toBe('abono');
    expect(inferMovementDirection('Pago pesos tar', 40000, '+$40.000', 'credit_card')).toBe('income');
    expect(inferMovementDirection('Copec nunoa santiago compras', -8480, '-$8.480', 'credit_card')).toBe('expense');
    expect(inferMovementKind('Copec nunoa santiago compras', -8480, '-$8.480', 'credit_card')).toBe('expense');
    expect(inferMovementDirection('Sumup * botilleria compras', -2300, '-$2.300', 'credit_card')).toBe('expense');
    expect(inferMovementDirection('Hip lider nunoa compras', -20470, '-$20.470', 'credit_card')).toBe('expense');
    expect(inferMovementDirection('Comision mensual por mantencion', -4851, '-$4.851', 'credit_card')).toBe('expense');
    expect(inferMovementDirection('Monto Cancelado', -10000, '$-10.000', 'credit_card')).toBe('income');
    expect(inferMovementKind('Monto Cancelado', -10000, '$-10.000', 'credit_card')).toBe('abono');
  });

  it('extracts BICE mobile app table rows with explicit +/- amounts', () => {
    const movements = extractMovements(
      [
        {
          name: 'movimientos-tarjeta.png',
          text: [
            'Movimientos de Tarjeta Nacional',
            '06 de mayo del 2026',
            '26 de abril del 2026',
          ].join('\n'),
          summary: null,
          structuredData: {
            tables: [
              {
                headers: ['Descripción', 'Monto'],
                rows: [
                  ['Pago pesos tef', '+$186.446'],
                  ['Copec nunoa santiago compras', '-$8.480'],
                  ['Sumup * botilleria compras', '-$2.300'],
                ],
              },
            ],
            parserMeta: { mode: 'vision_structured', confidence: 0.9 },
          },
        },
      ],
      'credit_card',
    );

    expect(movements).toHaveLength(3);
    const pago = movements.find((m) => m.description.includes('Pago pesos'));
    const copec = movements.find((m) => m.description.includes('Copec'));
    const sumup = movements.find((m) => m.description.includes('Sumup'));
    expect(pago?.direction).toBe('income');
    expect(pago?.movement_kind).toBe('abono');
    expect(copec?.direction).toBe('expense');
    expect(sumup?.direction).toBe('expense');
  });

  it('forces cargo column semantics for checking transfers even when keywords look like income', () => {
    const movements = extractMovements(
      [
        {
          name: 'cartola.csv',
          text: '',
          summary: null,
          structuredData: {
            tables: [
              {
                headers: ['Fecha', 'Descripción', 'Cargo', 'Abono'],
                rows: [['01/06/2026', 'TRASPASO A CUENTA AHORRO', '50000', '']],
              },
            ],
          },
        },
      ],
      'checking_account',
    );

    expect(movements).toHaveLength(1);
    expect(movements[0]?.direction).toBe('expense');
    expect(movements[0]?.direction_basis).toBe('column_cargo');
    expect(movements[0]?.amount).toBe(50000);
  });

  it('parses vision OCR tables without fecha using section dates from screenshot text', () => {
    const movements = extractMovements(
      [
        {
          name: 'movimientos-no-facturados.png',
          text: [
            '--- Documento Imagen: movimientos-no-facturados.png ---',
            'Movimientos no facturados Iniciado el 27 de mayo de 2026',
            '31 de mayo de 2026',
            '--- Fin ---',
          ].join('\n'),
          summary: null,
          structuredData: {
            tables: [
              {
                headers: ['Descripción', 'Monto'],
                rows: [
                  ['Copec Nunoa Compras', '$5.500'],
                  ['Monto Cancelado', '$-10.000'],
                ],
              },
            ],
            parserMeta: { mode: 'vision_structured', confidence: 0.86 },
          },
        },
      ],
      'credit_card',
    );

    expect(movements.length).toBeGreaterThanOrEqual(2);
    expect(movements.some((movement) => movement.description.includes('Copec'))).toBe(true);
    expect(movements.every((movement) => Boolean(movement.date))).toBe(true);
    expect(movements[0]?.date).toBe('2026-05-31');
  });

  it('parses vision OCR tables when fecha appears inline in a single OCR blob', () => {
    const movements = extractMovements(
      [
        {
          name: 'movimientos-no-facturados.png',
          text: 'Movimientos no facturados Iniciado el 27 de mayo de 2026 Copec Nunoa Compras $5.500 31 de mayo de 2026 Pedidosyalocal Burger Compras $6.000',
          summary: null,
          structuredData: {
            tables: [
              {
                headers: ['Descripción', 'Monto'],
                rows: [['Copec Nunoa Compras', '$5.500']],
              },
            ],
            parserMeta: { mode: 'vision_structured', confidence: 0.86 },
          },
        },
      ],
      'credit_card',
    );

    expect(movements.some((movement) => movement.description.includes('Copec'))).toBe(true);
    expect(movements.every((movement) => Boolean(movement.date))).toBe(true);
  });

  it('classifies mixed cargo and abono columns for checking accounts', () => {
    const movements = extractMovements(
      [
        {
          name: 'cartola.png',
          text: '',
          summary: null,
          structuredData: {
            tables: [
              {
                headers: ['Fecha', 'Descripción', 'Cargo', 'Abono'],
                rows: [
                  ['01/06/2026', 'COMPRA SUPERMERCADO', '45000', ''],
                  ['02/06/2026', 'TRANSFERENCIA RECIBIDA', '', '120000'],
                ],
              },
            ],
            parserMeta: { mode: 'vision_structured', confidence: 0.84 },
          },
        },
      ],
      'checking_account',
    );

    expect(movements).toHaveLength(2);
    expect(movements.find((m) => m.description.includes('SUPERMERCADO'))?.direction).toBe('expense');
    expect(movements.find((m) => m.description.includes('TRANSFERENCIA'))?.direction).toBe('income');
  });

  it('uses section category for single Monto column checking cartolas', () => {
    const movements = extractMovements(
      [
        {
          name: 'bice.png',
          text: '',
          summary: null,
          structuredData: {
            tables: [
              {
                headers: ['Fecha', 'Categoría', 'Descripción', 'Monto'],
                rows: [
                  ['01/06/2026', 'Cargos', 'PAGO SERVIPAG', '25000'],
                  ['02/06/2026', 'Abonos', 'TRANSFERENCIA DESDE CUENTA', '80000'],
                ],
              },
            ],
            parserMeta: { mode: 'vision_structured', confidence: 0.82 },
          },
        },
      ],
      'checking_account',
    );

    expect(movements).toHaveLength(2);
    expect(movements.find((m) => m.description.includes('SERVIPAG'))?.direction).toBe('expense');
    expect(movements.find((m) => m.description.includes('TRANSFERENCIA'))?.direction).toBe('income');
  });

  it('maps wallet Tipo column to direction for photo OCR tables', () => {
    const movements = extractMovements(
      [
        {
          name: 'mach.png',
          text: '',
          summary: null,
          structuredData: {
            tables: [
              {
                headers: ['Fecha', 'Descripción', 'Monto', 'Tipo'],
                rows: [
                  ['03/04/2026', 'Compra local', '15000', 'Cargo'],
                  ['04/04/2026', 'Transferencia recibida', '50000', 'Abono'],
                ],
              },
            ],
          },
        },
      ],
      'debit_account',
    );

    expect(movements).toHaveLength(2);
    expect(movements[0]?.direction).toBe('expense');
    expect(movements[1]?.direction).toBe('income');
    expect(movements[0]?.direction_basis).toBe('column_tipo_cargo');
    expect(movements[1]?.direction_basis).toBe('column_tipo_abono');
  });

  it('classifies unsigned retail descriptions as expense on checking photos', () => {
    const movements = extractMovements(
      [
        {
          name: 'foto-cartola.png',
          text: '',
          summary: null,
          structuredData: {
            tables: [
              {
                headers: ['Fecha', 'Descripción', 'Monto'],
                rows: [
                  ['01/06/2026', 'Copec Nunoa Compras', '5500'],
                  ['02/06/2026', 'Transferencia recibida', '120000'],
                ],
              },
            ],
            parserMeta: { mode: 'vision_structured', confidence: 0.8 },
          },
        },
      ],
      'checking_account',
    );

    expect(movements.length).toBeGreaterThanOrEqual(2);
    expect(movements.find((m) => m.description.includes('Copec'))?.direction).toBe('expense');
    expect(movements.find((m) => m.description.includes('Transferencia'))?.direction).toBe('income');
  });
});
