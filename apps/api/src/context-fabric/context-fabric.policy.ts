/**
 * Feature flags for Financial Context Fabric.
 * All default to false — legacy behavior when disabled.
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
    transactionsContextPublishEnabled: readBool('TRANSACTIONS_CONTEXT_PUBLISH_ENABLED', false),
    diagnosticContextPackEnabled: readBool('DIAGNOSTIC_CONTEXT_PACK_ENABLED', false),
    consistencyEnabled: readBool('CONTEXT_CONSISTENCY_ENABLED', isDevelopment),
    conflictUiEnabled: readBool('CONTEXT_CONFLICT_UI_ENABLED', false),
  };
}

export function isContextFabricActive(flags: ContextFabricFlags = getContextFabricFlags()): boolean {
  return (
    flags.enabled ||
    flags.shadowMode ||
    flags.coreContextPackEnabled ||
    flags.budgetContextPackEnabled ||
    flags.transactionsContextPublishEnabled ||
    flags.diagnosticContextPackEnabled ||
    flags.consistencyEnabled
  );
}
