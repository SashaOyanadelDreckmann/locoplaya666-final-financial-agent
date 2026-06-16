import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  getContextFabricFlags,
  isConsistencyPipelineActive,
  isContextFabricActive,
  isContextFabricMcpToolsEnabled,
  isContextFabricSessionEnabled,
  isCoreContextPackResolutionEnabled,
  isContextPublishEnabled,
  shouldApplyCoreContextPack,
} from './context-fabric.policy';

describe('context-fabric.policy', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'test');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('treats all flags disabled as inactive in test env', () => {
    vi.stubEnv('FINANCIAL_CONTEXT_MCP_ENABLED', 'false');
    vi.stubEnv('CORE_CONTEXT_PACK_ENABLED', 'false');
    vi.stubEnv('BUDGET_CONTEXT_PACK_ENABLED', 'false');
    vi.stubEnv('TRANSACTIONS_CONTEXT_PUBLISH_ENABLED', 'false');
    vi.stubEnv('DIAGNOSTIC_CONTEXT_PACK_ENABLED', 'false');
    vi.stubEnv('CONTEXT_CONSISTENCY_ENABLED', 'false');
    vi.stubEnv('FINANCIAL_CONTEXT_SHADOW_MODE', 'false');
    vi.stubEnv('CONTEXT_CONFLICT_UI_ENABLED', 'false');

    const flags = getContextFabricFlags();
    expect(isContextFabricSessionEnabled(flags)).toBe(false);
    expect(isContextFabricMcpToolsEnabled(flags)).toBe(false);
    expect(isContextFabricActive(flags)).toBe(false);
    expect(isConsistencyPipelineActive(flags)).toBe(false);
    expect(isCoreContextPackResolutionEnabled(flags)).toBe(false);
    expect(shouldApplyCoreContextPack(flags)).toBe(false);
  });

  it('enables session snapshot with conflict UI only (no MCP tools)', () => {
    vi.stubEnv('CONTEXT_CONFLICT_UI_ENABLED', 'true');
    const flags = getContextFabricFlags();
    expect(isContextFabricSessionEnabled(flags)).toBe(true);
    expect(isContextFabricMcpToolsEnabled(flags)).toBe(false);
    expect(isConsistencyPipelineActive(flags)).toBe(true);
    expect(isContextPublishEnabled('intake', flags)).toBe(true);
    expect(isContextPublishEnabled('document', flags)).toBe(false);
  });

  it('resolves core packs in shadow-only mode without applying', () => {
    vi.stubEnv('FINANCIAL_CONTEXT_SHADOW_MODE', 'true');
    vi.stubEnv('CORE_CONTEXT_PACK_ENABLED', 'false');
    vi.stubEnv('FINANCIAL_CONTEXT_MCP_ENABLED', 'false');
    const flags = getContextFabricFlags();
    expect(isCoreContextPackResolutionEnabled(flags)).toBe(true);
    expect(shouldApplyCoreContextPack(flags)).toBe(false);
    expect(isContextFabricMcpToolsEnabled(flags)).toBe(true);
  });

  it('does not apply core pack when only master MCP flag is enabled', () => {
    vi.stubEnv('FINANCIAL_CONTEXT_MCP_ENABLED', 'true');
    vi.stubEnv('CORE_CONTEXT_PACK_ENABLED', 'false');
    vi.stubEnv('FINANCIAL_CONTEXT_SHADOW_MODE', 'false');
    const flags = getContextFabricFlags();
    expect(isContextFabricMcpToolsEnabled(flags)).toBe(true);
    expect(isCoreContextPackResolutionEnabled(flags)).toBe(false);
    expect(shouldApplyCoreContextPack(flags)).toBe(false);
  });
});
