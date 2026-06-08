import {
  resolveMovementDirectionForTotals,
  resolveMovementKind,
  resolveSignedAmount,
} from '../movement-direction.helpers';

describe('movement-direction helpers', () => {
  it('trusts API direction for credit card abonos even when amount is negative', () => {
    expect(
      resolveMovementDirectionForTotals({
        apiDirection: 'income',
        movementKind: 'abono',
        signedAmount: -10_000,
        isCreditCardProduct: true,
      }),
    ).toBe('income');
  });

  it('uses credit card sign convention only when API direction is missing', () => {
    expect(
      resolveMovementDirectionForTotals({
        signedAmount: -10_000,
        isCreditCardProduct: true,
      }),
    ).toBe('income');
    expect(
      resolveMovementDirectionForTotals({
        signedAmount: 2_930,
        isCreditCardProduct: true,
      }),
    ).toBe('expense');
  });

  it('keeps checking account negative amounts as expenses by default', () => {
    expect(
      resolveMovementDirectionForTotals({
        signedAmount: -4_900,
        isCreditCardProduct: false,
      }),
    ).toBe('expense');
  });

  it('preserves abono kind for visa signature credits', () => {
    expect(
      resolveMovementKind({
        apiKind: 'abono',
        directionForTotals: 'income',
        signedAmount: -10_000,
        isCreditCardProduct: true,
      }),
    ).toBe('abono');
  });

  it('derives signed amount from API direction when amount_signed is absent', () => {
    expect(
      resolveSignedAmount({
        amount: 10_000,
        direction: 'expense',
      }),
    ).toBe(-10_000);
  });
});
