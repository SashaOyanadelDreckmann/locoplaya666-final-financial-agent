import { describe, expect, it } from 'vitest';
import type { ContextPack } from '@financial-agent/shared';
import {
  applyContextPackToSummary,
  mapClassificationToPackPurpose,
} from './context-fabric.integration.helpers';

function samplePack(overrides: Partial<ContextPack> = {}): ContextPack {
  return {
    contextVersion: 'ctx-test',
    packVersion: 'pack-test',
    generatedAt: new Date().toISOString(),
    facts: [
      {
        factId: 'budget::panel::budget.totals::monthly_income',
        subject: 'budget.totals',
        predicate: 'monthly_income',
        value: 1_200_000,
        sourceKind: 'budget',
        sourceId: 'panel',
        sourceVersion: 'v1',
        observedAt: new Date().toISOString(),
        confidence: 0.95,
        userConfirmed: false,
        derived: false,
        contentHash: 'abc',
        unit: 'CLP',
        cadence: 'monthly',
      },
    ],
    deterministicSummaries: {
      intake: { incomeBand: '600k-1M', employmentStatus: 'employed' },
      transactions: { productsCount: 2, activeProductLabel: 'Cuenta Vista' },
      lifecycle: { phase: 'budget_needed', unlockedChats: ['chat-1'] },
    },
    activeConflicts: [],
    evidenceReferences: [],
    includedSections: ['intake', 'budget', 'lifecycle'],
    omittedSections: ['documents'],
    resourceUris: ['financial://me/intake'],
    tokenEstimate: 120,
    cacheStatus: 'miss',
    sourceVersions: {},
    ...overrides,
  };
}

describe('context-fabric.integration.helpers', () => {
  it('maps classification modes to pack purposes', () => {
    expect(mapClassificationToPackPurpose({ mode: 'regulation', activeChatId: 'chat-1' })).toBe(
      'regulation',
    );
    expect(mapClassificationToPackPurpose({ mode: 'budgeting', activeChatId: 'chat-1' })).toBe(
      'budget_analysis',
    );
    expect(mapClassificationToPackPurpose({ mode: 'information', activeChatId: 'chat-3' })).toBe(
      'social_reflection',
    );
  });

  it('slims legacy context summary while preserving profile and fabric metadata', () => {
    const legacy = {
      profile: { diagnosticNarrative: 'Perfil largo' },
      intake: { intake: { incomeBand: '600k-1M', huge: 'x'.repeat(5000) } },
      budget: { income: 900_000, expenses: 700_000, balance: 200_000 },
      budget_rows: Array.from({ length: 25 }, (_, i) => ({
        id: `row_${i}`,
        category: `Cat ${i}`,
        type: 'expense',
        amount: 100_000,
      })),
      consolidated_context: {
        transactions: {
          activeProduct: {
            movements: Array.from({ length: 40 }, (_, i) => ({ id: i, amount: 1000 })),
          },
        },
      },
      uploaded_documents: [{ name: 'doc.pdf', text: 'x'.repeat(3000) }],
      financial_evidence: { has_transactions: true, movement_count: 40 },
    };

    const optimized = applyContextPackToSummary(legacy, samplePack(), {
      activeChatId: 'chat-1',
      budgetRows: legacy.budget_rows as never[],
      financialEvidence: legacy.financial_evidence as never,
    });

    expect(optimized.profile).toEqual(legacy.profile);
    expect((optimized.budget_rows as unknown[]).length).toBeLessThanOrEqual(12);
    expect((optimized.uploaded_documents as Array<{ text?: string }>)[0]?.text).toBeUndefined();
    expect(
      (optimized.consolidated_context as { transactions: { activeProduct?: unknown } }).transactions
        .activeProduct,
    ).toBeUndefined();
    expect(optimized.context_fabric).toBeTruthy();
    expect((optimized.budget as { income: number }).income).toBe(1_200_000);
  });

  it('minimizes numeric context for chat-3', () => {
    const legacy = {
      profile: { diagnosticNarrative: 'x' },
      budget_rows: Array.from({ length: 10 }, (_, i) => ({
        id: `row_${i}`,
        category: `Cat ${i}`,
        type: 'expense',
        amount: 100_000,
      })),
      consolidated_context: { transactions: { activeProduct: { movements: [1, 2, 3] } } },
    };
    const optimized = applyContextPackToSummary(legacy, samplePack(), {
      activeChatId: 'chat-3',
      budgetRows: legacy.budget_rows as never[],
    });
    expect((optimized.budget_rows as unknown[]).length).toBeLessThanOrEqual(4);
    expect(
      (optimized.consolidated_context as { transactions: { scope: string } }).transactions.scope,
    ).toBe('chat3_minimal');
  });
});
