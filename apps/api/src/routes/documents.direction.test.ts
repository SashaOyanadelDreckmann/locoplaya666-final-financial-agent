import { describe, expect, it } from 'vitest';
import { inferMovementDirection, inferMovementKind, toIsoDate } from './documents';

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
});
