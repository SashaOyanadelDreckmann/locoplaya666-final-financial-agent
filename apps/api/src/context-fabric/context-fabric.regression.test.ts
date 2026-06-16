import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { clearContextPackCacheForTests } from './context-pack.service';
import {
  publishDocumentParseObservation,
  publishFinancialContextMergeObservation,
} from './context-fabric.publish.service';
import { selectContextSections } from '@financial-agent/shared';
import { applyContextPackToSummary } from './context-fabric.integration.helpers';
import type { ContextPack } from '@financial-agent/shared';

describe('context-fabric regression scenarios', () => {
  beforeEach(() => {
    clearContextPackCacheForTests();
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('TRANSACTIONS_CONTEXT_PUBLISH_ENABLED', 'true');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('greeting turn selects lifecycle-only sections', () => {
    const { included, omitted } = selectContextSections({
      consumer: 'core-agent',
      purpose: 'answer',
      userMessage: 'hola',
      maxInputTokens: 2048,
    });
    expect(included).toEqual(['lifecycle']);
    expect(omitted.length).toBeGreaterThan(3);
  });

  it('chat-3 philosophical question avoids transactions by default', () => {
    const { included } = selectContextSections({
      consumer: 'core-agent',
      purpose: 'social_reflection',
      activeChat: 'chat-3',
      userMessage: '¿Qué implica gastar con conciencia?',
      maxInputTokens: 2048,
    });
    expect(included).toContain('social_reflections');
    expect(included).not.toContain('transactions');
  });

  it('pack application preserves profile and adds fabric metadata', () => {
    const pack: ContextPack = {
      contextVersion: 'ctx-1',
      packVersion: 'pack-1',
      generatedAt: new Date().toISOString(),
      facts: [],
      deterministicSummaries: { lifecycle: { phase: 'budget_needed' } },
      activeConflicts: [],
      evidenceReferences: [],
      includedSections: ['lifecycle'],
      omittedSections: ['documents'],
      resourceUris: [],
      tokenEstimate: 40,
      cacheStatus: 'miss',
      sourceVersions: {},
    };
    const legacy = {
      profile: { diagnosticNarrative: 'Perfil' },
      consolidated_context: { transactions: { activeProduct: { movements: [1, 2, 3] } } },
      uploaded_documents: [{ name: 'a.pdf', text: 'secret' }],
    };
    const optimized = applyContextPackToSummary(legacy, pack, {
      activeChatId: 'chat-1',
      budgetRows: [],
    });
    expect(optimized.profile).toEqual(legacy.profile);
    expect(optimized.context_fabric).toBeTruthy();
    expect((optimized.uploaded_documents as Array<{ text?: string }>)[0]?.text).toBeUndefined();
  });

  it('publish after document parse returns null when flag disabled', async () => {
    vi.stubEnv('TRANSACTIONS_CONTEXT_PUBLISH_ENABLED', 'false');
    vi.stubEnv('FINANCIAL_CONTEXT_MCP_ENABLED', 'false');
    const result = await publishDocumentParseObservation({
      userId: 'user-no-exists',
      documentIds: ['doc-1'],
      movementCount: 3,
    });
    expect(result).toBeNull();
  });
});

describe('context-fabric publish with flags enabled', () => {
  it('publishFinancialContextMergeObservation is a no-op without user', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('TRANSACTIONS_CONTEXT_PUBLISH_ENABLED', 'true');
    const result = await publishFinancialContextMergeObservation({
      userId: 'missing-user-id-xyz',
      reason: 'panel_merge',
    });
    expect(result).toBeNull();
    vi.unstubAllEnvs();
  });
});
