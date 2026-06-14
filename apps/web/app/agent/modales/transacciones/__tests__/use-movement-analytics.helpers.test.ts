import {
  resolveMovementDirectionForTotals,
  resolveMovementKind,
  resolveSignedAmount,
} from '../movement-direction.helpers';

describe('movement analytics direction integration', () => {
  it('keeps BICE card payments as inflows when API marks them income', () => {
    const signedAmount = resolveSignedAmount({
      amount: 186_446,
      direction: 'income',
    });
    const direction = resolveMovementDirectionForTotals({
      apiDirection: 'income',
      movementKind: 'abono',
      signedAmount,
      isCreditCardProduct: true,
    });
    const kind = resolveMovementKind({
      apiKind: 'abono',
      directionForTotals: direction,
      signedAmount,
      isCreditCardProduct: true,
    });

    expect(direction).toBe('income');
    expect(kind).toBe('abono');
  });

  it('does not flip positive card payments to expenses when API direction is present', () => {
    const signedAmount = resolveSignedAmount({
      amount: 100_000,
      direction: 'income',
    });
    expect(
      resolveMovementDirectionForTotals({
        apiDirection: 'income',
        movementKind: 'abono',
        signedAmount,
        isCreditCardProduct: true,
      }),
    ).toBe('income');
  });
});
