import { describe, expect, it } from 'vitest';
import { compareContextPackShadow } from './context-fabric-shadow.helpers';
import type { ContextPack } from '@financial-agent/shared';

describe('context-fabric-shadow.helpers', () => {
  it('reports token delta between legacy payload and pack', () => {
    const legacyContext = {
      injected_intake: { intake: { incomeBand: '600k-1M', employmentStatus: 'employed' } },
      injected_budget: { income: 900_000, expenses: 700_000, balance: 200_000 },
      consolidated_context: {
        transactions: {
          activeProduct: { movements: Array.from({ length: 40 }, (_, i) => ({ id: i, amount: 1000 })) },
        },
      },
      persistent_memory: { facts: Array.from({ length: 10 }, (_, i) => ({ id: i })) },
    };
    const legacyUiState = {
      budget_rows: Array.from({ length: 20 }, (_, i) => ({ id: `r${i}`, amount: 100_000 })),
      budget_summary: { income: 900_000, expenses: 700_000, balance: 200_000 },
    };
    const pack: ContextPack = {
      contextVersion: 'ctx-1',
      packVersion: 'pack-1',
      generatedAt: new Date().toISOString(),
      facts: [],
      deterministicSummaries: { lifecycle: { phase: 'budget_needed' } },
      activeConflicts: [],
      evidenceReferences: [],
      includedSections: ['lifecycle'],
      omittedSections: ['transactions'],
      resourceUris: ['financial://me/lifecycle'],
      tokenEstimate: 50,
      cacheStatus: 'miss',
      sourceVersions: {},
    };
    const shadow = compareContextPackShadow({ legacyContext, legacyUiState, pack });
    expect(shadow.legacyTokenEstimate).toBeGreaterThan(shadow.packTokenEstimate);
    expect(shadow.tokenReductionPct).toBeGreaterThan(0);
  });
});
