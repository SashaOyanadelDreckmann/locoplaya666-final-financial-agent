import { FINCOIN_SPEND_BLOCKED_MESSAGE, isFincoinSpendBlocked } from '../compartido/fincoin-gate';

describe('fincoin-gate', () => {
  it('blocks spend only when depleted', () => {
    expect(isFincoinSpendBlocked(false)).toBe(false);
    expect(isFincoinSpendBlocked(true)).toBe(true);
  });

  it('exposes a stable user-facing blocked message', () => {
    expect(FINCOIN_SPEND_BLOCKED_MESSAGE).toMatch(/Fincoins se agotaron/i);
  });
});
