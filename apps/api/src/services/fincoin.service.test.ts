import { describe, expect, it } from 'vitest';
import {
  computeFincoinUsage,
  FINCOIN_INITIAL_BALANCE,
  FINCOIN_MAX_USD_SPEND,
  FINCOIN_OPERATION_COST_USD,
  FINCOIN_WARNING_THRESHOLD,
} from '@financial-agent/shared';
import { canAffordOperation, getFincoinUsageForUser } from './fincoin.service';

describe('fincoin usage', () => {
  it('starts users with full fincoin balance', () => {
    const usage = getFincoinUsageForUser({ usdSpentTotal: 0 });
    expect(usage.remainingFincoins).toBe(FINCOIN_INITIAL_BALANCE);
    expect(usage.depleted).toBe(false);
    expect(usage.lowBalance).toBe(false);
  });

  it('warns when remaining fincoins are at or below threshold', () => {
    const usage = computeFincoinUsage(FINCOIN_MAX_USD_SPEND - 0.32);
    expect(usage.remainingFincoins).toBeLessThanOrEqual(FINCOIN_WARNING_THRESHOLD);
    expect(usage.lowBalance).toBe(true);
    expect(usage.depleted).toBe(false);
  });

  it('marks depleted at the hard USD cap', () => {
    const usage = computeFincoinUsage(FINCOIN_MAX_USD_SPEND);
    expect(usage.depleted).toBe(true);
    expect(usage.remainingFincoins).toBe(0);
  });

  it('blocks operations that exceed remaining budget', () => {
    const usage = computeFincoinUsage(FINCOIN_MAX_USD_SPEND - 0.01);
    expect(canAffordOperation(usage, 'agent.chat')).toBe(false);
    expect(canAffordOperation(computeFincoinUsage(0), 'agent.chat')).toBe(true);
    expect(FINCOIN_OPERATION_COST_USD['agent.chat']).toBeGreaterThan(0);
  });
});
