import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { getContextFabricSessionSnapshot } from './context-fabric.service';

describe('getContextFabricSessionSnapshot', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'test');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns null when fabric is disabled in test env', async () => {
    vi.stubEnv('FINANCIAL_CONTEXT_MCP_ENABLED', 'false');
    vi.stubEnv('CORE_CONTEXT_PACK_ENABLED', 'false');
    const snapshot = await getContextFabricSessionSnapshot({
      id: 'user-1',
      injectedIntake: { intake: { profession: 'Dev' } },
    });
    expect(snapshot).toBeNull();
  });

  it('returns version and lifecycle when fabric is enabled', async () => {
    vi.stubEnv('FINANCIAL_CONTEXT_MCP_ENABLED', 'true');
    const snapshot = await getContextFabricSessionSnapshot({
      id: 'user-1',
      injectedIntake: {
        intake: { profession: 'Dev', hasDebt: false },
        budgetContext: { income: 1_500_000, expenses: 1_000_000, balance: 500_000 },
      },
    });
    expect(snapshot).toBeTruthy();
    expect(snapshot?.contextVersion).toBeTruthy();
    expect(snapshot?.lifecycle).toBeTruthy();
    expect(typeof snapshot?.activeConflictCount).toBe('number');
  });

  it('includes conflict details when conflict UI flag is enabled', async () => {
    vi.stubEnv('FINANCIAL_CONTEXT_MCP_ENABLED', 'true');
    vi.stubEnv('CONTEXT_CONFLICT_UI_ENABLED', 'true');
    const snapshot = await getContextFabricSessionSnapshot({
      id: 'user-1',
      injectedIntake: {
        intake: { profession: 'Dev', incomeBand: '1M-2M' },
        budgetContext: { income: 400_000, expenses: 350_000, balance: 50_000 },
      },
    });
    expect(snapshot?.conflicts).toBeDefined();
    expect(Array.isArray(snapshot?.conflicts)).toBe(true);
  });

  it('returns snapshot when only conflict UI is enabled', async () => {
    vi.stubEnv('CONTEXT_CONFLICT_UI_ENABLED', 'true');
    vi.stubEnv('FINANCIAL_CONTEXT_MCP_ENABLED', 'false');
    const snapshot = await getContextFabricSessionSnapshot({
      id: 'user-1',
      injectedIntake: {
        intake: { profession: 'Dev', hasDebt: false },
        budgetContext: { income: 1_500_000, expenses: 1_000_000, balance: 500_000 },
      },
    });
    expect(snapshot).toBeTruthy();
    expect(snapshot?.contextVersion).toBeTruthy();
  });
});
