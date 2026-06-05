import { describe, expect, it } from 'vitest';
import { inferMovementDirection } from './documents';

describe('documents movement direction', () => {
  it('treats credit card abonos and payments as income', () => {
    expect(inferMovementDirection('Abono tarjeta de crédito', 120000, '', 'credit_card')).toBe('income');
    expect(inferMovementDirection('Pago mínimo tarjeta', 45000, '', 'credit_card')).toBe('income');
  });

  it('keeps credit card purchases as expense', () => {
    expect(inferMovementDirection('Compra supermercado', 58000, '', 'credit_card')).toBe('expense');
    expect(inferMovementDirection('Cargo webpay', 22000, '', 'credit_card')).toBe('expense');
  });

  it('preserves standard banking semantics for other products', () => {
    expect(inferMovementDirection('Abono transferencia recibida', 80000, '', 'checking_account')).toBe('income');
    expect(inferMovementDirection('Cargo por mantención', 4900, '', 'checking_account')).toBe('expense');
  });
});
