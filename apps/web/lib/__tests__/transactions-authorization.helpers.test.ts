import { deriveTransactionAuthorizationState } from '../transactions-authorization.helpers';

describe('transactions-authorization.helpers', () => {
  it('derives authorization from local draft first and falls back to product state', () => {
    const result = deriveTransactionAuthorizationState(
      {
        bank: 'Banco Base',
        label: 'Cuenta corriente',
        simulationAccepted: true,
      },
      {
        bank: 'Banco DRAFT',
        label: 'Tarjeta de crédito',
        simulationAccepted: false,
      },
    );

    expect(result).toMatchObject({
      bank: 'Banco DRAFT',
      label: 'Tarjeta de crédito',
      simulationAccepted: false,
      canContinue: false,
    });
  });

  it('allows continue when the persisted product already authorized the simulation', () => {
    const result = deriveTransactionAuthorizationState({
      bank: 'Banco Base',
      label: 'Cuenta corriente',
      simulationAccepted: true,
    });

    expect(result.canContinue).toBe(true);
  });
});
