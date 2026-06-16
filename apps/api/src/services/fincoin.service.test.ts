import { describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import {
  computeFincoinUsage,
  FINCOIN_INITIAL_BALANCE,
  FINCOIN_MAX_USD_SPEND,
  FINCOIN_OPERATION_COST_USD,
  FINCOIN_WARNING_THRESHOLD,
} from '@financial-agent/shared';
import { chargeUsdSpentTotalAtomic, createUserRecord } from '../persistencia/repos/user.repository';
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

  it('atomically rejects a charge when the wallet cannot afford it', async () => {
    const passwordHash = await bcrypt.hash('Secret123', 4);
    const user = await createUserRecord({
      name: 'Atomic Fincoin',
      email: `atomic-${Date.now()}@test.com`,
      passwordHash,
    });

    const { patchUserRecord } = await import('../persistencia/repos');
    await patchUserRecord(user.id, {
      usdSpentTotal: FINCOIN_MAX_USD_SPEND - FINCOIN_OPERATION_COST_USD['agent.chat'] + 0.001,
    });

    const rejected = await chargeUsdSpentTotalAtomic(
      user.id,
      FINCOIN_OPERATION_COST_USD['agent.chat'],
      FINCOIN_MAX_USD_SPEND,
    );
    expect(rejected.charged).toBe(false);
    expect(rejected.reason).toBe('insufficient');

    await patchUserRecord(user.id, {
      usdSpentTotal: FINCOIN_MAX_USD_SPEND - FINCOIN_OPERATION_COST_USD['agent.chat'],
    });

    const accepted = await chargeUsdSpentTotalAtomic(
      user.id,
      FINCOIN_OPERATION_COST_USD['agent.chat'],
      FINCOIN_MAX_USD_SPEND,
    );
    expect(accepted.charged).toBe(true);
    expect(accepted.justDepleted).toBe(true);
  });
});
