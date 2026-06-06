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
});
