import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { clearContextPackCacheForTests } from './context-pack.service';
import {
  publishContextSourceVersion,
  publishDocumentParseObservation,
  publishFinancialContextMergeObservation,
} from './context-fabric.publish.service';

describe('context-fabric.publish.service', () => {
  beforeEach(() => {
    clearContextPackCacheForTests();
    vi.stubEnv('NODE_ENV', 'test');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns null when publish flags are disabled in test env', async () => {
    vi.stubEnv('TRANSACTIONS_CONTEXT_PUBLISH_ENABLED', 'false');
    vi.stubEnv('FINANCIAL_CONTEXT_MCP_ENABLED', 'false');

    const result = await publishContextSourceVersion({
      userId: 'missing-user',
      sourceKind: 'document',
      sourceId: 'doc:1',
      contentHash: 'hash-1',
    });
    expect(result).toBeNull();
  });

  it('publishDocumentParseObservation hashes stable payload fields', async () => {
    vi.stubEnv('TRANSACTIONS_CONTEXT_PUBLISH_ENABLED', 'false');
    const disabled = await publishDocumentParseObservation({
      userId: 'user-1',
      documentIds: ['doc-a', 'doc-b'],
      movementCount: 12,
      evidenceFidelity: 'authoritative',
    });
    expect(disabled).toBeNull();
  });

  it('publishFinancialContextMergeObservation returns null for unknown user', async () => {
    vi.stubEnv('TRANSACTIONS_CONTEXT_PUBLISH_ENABLED', 'true');
    const result = await publishFinancialContextMergeObservation({
      userId: 'user-does-not-exist-xyz',
      reason: 'panel_merge',
      productsCount: 2,
      budgetRowsCount: 5,
    });
    expect(result).toBeNull();
  });
});
