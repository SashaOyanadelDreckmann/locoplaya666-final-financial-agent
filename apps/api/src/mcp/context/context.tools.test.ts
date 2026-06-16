import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../services/user.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/user.service')>();
  return {
    ...actual,
    loadUserById: vi.fn(async (userId: string) =>
      userId === 'user-ok'
        ? {
            id: 'user-ok',
            injectedIntake: {
              intake: { profession: 'Analista' },
              budgetContext: { income: 1_000_000, expenses: 800_000, balance: 200_000 },
            },
          }
        : null,
    ),
  };
});

import { contextGetManifestTool, contextGetPackTool } from './context.tools';

describe('context.tools', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('FINANCIAL_CONTEXT_MCP_ENABLED', 'true');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('context.get_manifest rejects missing session user', async () => {
    await expect(contextGetManifestTool.run({}, {})).rejects.toThrow('context_unauthorized');
  });

  it('context.get_manifest returns manifest for authed user when enabled', async () => {
    const result = await contextGetManifestTool.run({ consumer: 'core-agent' }, { user_id: 'user-ok' });
    expect(result.tool_call.status).toBe('success');
    expect((result.data as { ok: boolean; manifest?: { contextVersion: string } }).ok).toBe(true);
    expect(
      (result.data as { manifest?: { contextVersion: string } }).manifest?.contextVersion,
    ).toBeTruthy();
  });

  it('context.get_pack builds a pack for transactions consumer', async () => {
    const result = await contextGetPackTool.run(
      {
        consumer: 'transactions-agent',
        purpose: 'transaction_analysis',
        userMessage: 'analiza mis movimientos de enero',
        maxInputTokens: 2048,
      },
      { user_id: 'user-ok', turn_id: 'turn-1' },
    );
    expect(result.tool_call.status).toBe('success');
    const data = result.data as { ok: boolean; pack?: { includedSections: string[] } };
    expect(data.ok).toBe(true);
    expect(data.pack?.includedSections).toContain('transactions');
  });
});
