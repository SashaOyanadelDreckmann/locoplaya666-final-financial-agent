import { estimateTokensFromJson } from '@financial-agent/shared';
import type { ContextPack } from '@financial-agent/shared';

export type ContextShadowComparison = {
  legacyTokenEstimate: number;
  packTokenEstimate: number;
  tokenDelta: number;
  tokenReductionPct: number;
  factCount: number;
  conflictCount: number;
  includedSections: string[];
  omittedSections: string[];
  contextVersion: string;
  packVersion: string;
  cacheStatus: string;
};

export function estimateLegacyContextTokens(context: Record<string, unknown>, uiState: Record<string, unknown>): number {
  return estimateTokensFromJson({
    context: {
      injected_profile: context.injected_profile ? '[profile]' : null,
      injected_intake: context.injected_intake ? '[intake]' : null,
      injected_budget: context.injected_budget,
      consolidated_context: context.consolidated_context,
      persistent_memory: context.persistent_memory,
      session_memory: context.session_memory,
      uploaded_documents: context.uploaded_documents,
      social_consciousness_reflections: context.social_consciousness_reflections,
    },
    ui_state: {
      budget_summary: uiState.budget_summary,
      budget_rows: uiState.budget_rows,
      flow_status: uiState.flow_status,
      memory_profile_summary: uiState.memory_profile_summary,
    },
  });
}

export function compareContextPackShadow(params: {
  legacyContext: Record<string, unknown>;
  legacyUiState: Record<string, unknown>;
  pack: ContextPack;
}): ContextShadowComparison {
  const legacyTokenEstimate = estimateLegacyContextTokens(params.legacyContext, params.legacyUiState);
  const packTokenEstimate = params.pack.tokenEstimate;
  const tokenDelta = legacyTokenEstimate - packTokenEstimate;
  const tokenReductionPct =
    legacyTokenEstimate > 0 ? Math.round((tokenDelta / legacyTokenEstimate) * 100) : 0;

  return {
    legacyTokenEstimate,
    packTokenEstimate,
    tokenDelta,
    tokenReductionPct,
    factCount: params.pack.facts.length,
    conflictCount: params.pack.activeConflicts.length,
    includedSections: params.pack.includedSections,
    omittedSections: params.pack.omittedSections,
    contextVersion: params.pack.contextVersion,
    packVersion: params.pack.packVersion,
    cacheStatus: params.pack.cacheStatus,
  };
}
