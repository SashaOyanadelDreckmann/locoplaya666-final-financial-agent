/**
 * Feature flags for Financial Context Fabric.
 * Production default: false (legacy). Development default: true for all flags.
 */

export type ContextFabricFlags = {
  enabled: boolean;
  shadowMode: boolean;
  coreContextPackEnabled: boolean;
  budgetContextPackEnabled: boolean;
  transactionsContextPublishEnabled: boolean;
  diagnosticContextPackEnabled: boolean;
  consistencyEnabled: boolean;
  conflictUiEnabled: boolean;
};

function readBool(name: string, fallback = false): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return raw.trim().toLowerCase() === 'true';
}

const isDevelopment = process.env.NODE_ENV === 'development';

export function getContextFabricFlags(): ContextFabricFlags {
  return {
    enabled: readBool('FINANCIAL_CONTEXT_MCP_ENABLED', isDevelopment),
    shadowMode: readBool('FINANCIAL_CONTEXT_SHADOW_MODE', isDevelopment),
    coreContextPackEnabled: readBool('CORE_CONTEXT_PACK_ENABLED', isDevelopment),
    budgetContextPackEnabled: readBool('BUDGET_CONTEXT_PACK_ENABLED', isDevelopment),
    transactionsContextPublishEnabled: readBool('TRANSACTIONS_CONTEXT_PUBLISH_ENABLED', isDevelopment),
    diagnosticContextPackEnabled: readBool('DIAGNOSTIC_CONTEXT_PACK_ENABLED', isDevelopment),
    consistencyEnabled: readBool('CONTEXT_CONSISTENCY_ENABLED', isDevelopment),
    conflictUiEnabled: readBool('CONTEXT_CONFLICT_UI_ENABLED', isDevelopment),
  };
}

/** MCP tools + on-demand packs (not conflict-only UI). */
export function isContextFabricMcpToolsEnabled(
  flags: ContextFabricFlags = getContextFabricFlags(),
): boolean {
  return (
    flags.enabled ||
    flags.shadowMode ||
    flags.coreContextPackEnabled ||
    flags.budgetContextPackEnabled ||
    flags.transactionsContextPublishEnabled ||
    flags.diagnosticContextPackEnabled
  );
}

/** Session snapshot and conflict banner (includes conflict-only rollout). */
export function isContextFabricSessionEnabled(
  flags: ContextFabricFlags = getContextFabricFlags(),
): boolean {
  return (
    isContextFabricMcpToolsEnabled(flags) ||
    flags.consistencyEnabled ||
    flags.conflictUiEnabled
  );
}

/** @deprecated Prefer isContextFabricSessionEnabled or isContextFabricMcpToolsEnabled. */
export function isContextFabricActive(
  flags: ContextFabricFlags = getContextFabricFlags(),
): boolean {
  return isContextFabricSessionEnabled(flags);
}

export function isConsistencyPipelineActive(
  flags: ContextFabricFlags = getContextFabricFlags(),
): boolean {
  return (
    flags.consistencyEnabled ||
    flags.conflictUiEnabled ||
    isContextFabricMcpToolsEnabled(flags)
  );
}

/** Build core orchestrator pack for apply and/or shadow comparison. */
export function isCoreContextPackResolutionEnabled(
  flags: ContextFabricFlags = getContextFabricFlags(),
): boolean {
  if (!flags.coreContextPackEnabled && !flags.shadowMode) return false;
  if (process.env.NODE_ENV === 'test') {
    return (
      process.env.CORE_CONTEXT_PACK_ENABLED === 'true' ||
      process.env.FINANCIAL_CONTEXT_SHADOW_MODE === 'true'
    );
  }
  return true;
}

/** Mutate core agent context_summary with the fabric pack. */
export function shouldApplyCoreContextPack(
  flags: ContextFabricFlags = getContextFabricFlags(),
): boolean {
  return flags.coreContextPackEnabled;
}

export function isContextPublishEnabled(
  sourceKind: 'intake' | 'document' | 'transaction' | 'other' = 'other',
  flags: ContextFabricFlags = getContextFabricFlags(),
): boolean {
  if (process.env.NODE_ENV === 'test') {
    if (sourceKind === 'intake') {
      return (
        process.env.CONTEXT_CONFLICT_UI_ENABLED === 'true' ||
        process.env.CONTEXT_CONSISTENCY_ENABLED === 'true' ||
        process.env.CORE_CONTEXT_PACK_ENABLED === 'true' ||
        process.env.FINANCIAL_CONTEXT_SHADOW_MODE === 'true' ||
        process.env.FINANCIAL_CONTEXT_MCP_ENABLED === 'true' ||
        process.env.BUDGET_CONTEXT_PACK_ENABLED === 'true' ||
        process.env.TRANSACTIONS_CONTEXT_PUBLISH_ENABLED === 'true' ||
        process.env.DIAGNOSTIC_CONTEXT_PACK_ENABLED === 'true'
      );
    }
    return (
      process.env.TRANSACTIONS_CONTEXT_PUBLISH_ENABLED === 'true' ||
      process.env.FINANCIAL_CONTEXT_MCP_ENABLED === 'true'
    );
  }

  if (sourceKind === 'intake') {
    return isContextFabricSessionEnabled(flags);
  }

  return flags.transactionsContextPublishEnabled || flags.enabled;
}
