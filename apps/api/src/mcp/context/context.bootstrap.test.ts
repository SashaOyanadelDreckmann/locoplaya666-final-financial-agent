import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  getContextFabricFlags,
  isConsistencyPipelineActive,
  isContextFabricActive,
} from '../../context-fabric/context-fabric.policy';
import { bootstrapContextMCP, resetContextMcpBootstrapForTests } from './context.bootstrap';

describe('context.bootstrap', () => {
  beforeEach(() => {
    resetContextMcpBootstrapForTests();
    vi.stubEnv('NODE_ENV', 'test');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetContextMcpBootstrapForTests();
  });

  it('treats all fabric flags disabled as inactive in test env', () => {
    vi.stubEnv('FINANCIAL_CONTEXT_MCP_ENABLED', 'false');
    vi.stubEnv('CORE_CONTEXT_PACK_ENABLED', 'false');
    vi.stubEnv('BUDGET_CONTEXT_PACK_ENABLED', 'false');
    vi.stubEnv('TRANSACTIONS_CONTEXT_PUBLISH_ENABLED', 'false');
    vi.stubEnv('DIAGNOSTIC_CONTEXT_PACK_ENABLED', 'false');
    vi.stubEnv('CONTEXT_CONSISTENCY_ENABLED', 'false');
    vi.stubEnv('FINANCIAL_CONTEXT_SHADOW_MODE', 'false');
    vi.stubEnv('CONTEXT_CONFLICT_UI_ENABLED', 'false');

    const flags = getContextFabricFlags();
    expect(isContextFabricActive(flags)).toBe(false);
    expect(isConsistencyPipelineActive(flags)).toBe(false);
    expect(() => bootstrapContextMCP()).not.toThrow();
  });

  it('treats transactions publish flag as active fabric in test env', () => {
    vi.stubEnv('TRANSACTIONS_CONTEXT_PUBLISH_ENABLED', 'true');
    const flags = getContextFabricFlags();
    expect(isContextFabricActive(flags)).toBe(true);
    expect(isConsistencyPipelineActive(flags)).toBe(true);
    expect(() => bootstrapContextMCP()).not.toThrow();
  });
});
