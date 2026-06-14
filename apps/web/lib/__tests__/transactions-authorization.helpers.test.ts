import {
  buildTransactionAuthorizationBlockMessage,
  deriveTransactionAuthorizationState,
} from '../transacciones/autorizacion.helpers';

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

  it('falls back to the product label when the draft label is empty', () => {
    const result = deriveTransactionAuthorizationState(
      {
        bank: 'Banco de Chile (simulacion)',
        label: 'Cuenta corriente',
        simulationAccepted: true,
      },
      {
        bank: 'Banco de Chile (simulacion)',
        label: '',
        simulationAccepted: true,
      },
    );

    expect(result.label).toBe('Cuenta corriente');
    expect(result.canContinue).toBe(true);
  });

  it('blocks generic placeholder labels until a real template is chosen', () => {
    const result = deriveTransactionAuthorizationState(
      {
        bank: 'Banco BICE (simulacion)',
        label: 'Producto 1',
        simulationAccepted: true,
      },
      {
        bank: 'Banco BICE (simulacion)',
        label: '',
        simulationAccepted: true,
      },
    );

    expect(result.canContinue).toBe(false);
    expect(buildTransactionAuthorizationBlockMessage(result)).toContain('plantilla de producto');
  });

  it('lists every missing authorization prerequisite in consent guidance', () => {
    expect(
      buildTransactionAuthorizationBlockMessage({
        bank: '',
        label: '',
        simulationAccepted: false,
      }),
    ).toBe('Completa institución, plantilla de producto, consentimiento simulado para autorizar.');
  });
});
