import type { BuildContextPackInput, ContextPack } from '@financial-agent/shared';
import {
  estimateTokensFromJson,
  mergeSourceVersions,
  selectContextSections,
  trimPackToTokenBudget,
} from '@financial-agent/shared';
import { hashContent } from './context-version.service';
import type { ContextSourceBundle } from './context-source.loader';
import {
  buildFactsFromBundle,
  buildManifestFromBundle,
  buildSectionSummaries,
} from './context-provenance.service';
import { detectContextConflicts } from './context-consistency.service';
import { getContextFabricFlags, isConsistencyPipelineActive } from './context-fabric.policy';

type CacheEntry = {
  contextVersion: string;
  pack: ContextPack;
  expiresAt: number;
};

const packCache = new Map<string, CacheEntry>();

export function clearContextPackCacheForTests(): void {
  packCache.clear();
}

function cacheKey(userId: string, input: BuildContextPackInput, contextVersion: string): string {
  return [
    userId,
    contextVersion,
    input.consumer,
    input.purpose,
    input.activeChat ?? '',
    input.maxInputTokens,
    (input.requiredSections ?? []).join(','),
  ].join('|');
}

export function buildContextPackFromBundle(
  bundle: ContextSourceBundle,
  input: BuildContextPackInput,
): ContextPack {
  const flags = getContextFabricFlags();
  const { facts, artifacts, sourceVersions } = buildFactsFromBundle(bundle);
  const manifest = buildManifestFromBundle(bundle, 0);
  const conflicts = isConsistencyPipelineActive(flags)
      ? detectContextConflicts({
          facts,
          contextVersion: manifest.contextVersion,
          diagnosticCompletedAt: bundle.diagnosticProfile?.meta?.completedAt ?? null,
          budgetLastModified: manifest.sections.find((s) => s.name === 'budget')?.lastModified,
        })
      : [];

  const manifestWithConflicts = buildManifestFromBundle(bundle, conflicts.length);
  const { included, omitted } = selectContextSections(input);
  const summaries = buildSectionSummaries(bundle);
  const deterministicSummaries: Record<string, unknown> = {};
  for (const section of included) {
    if (section in summaries) deterministicSummaries[section] = summaries[section as keyof typeof summaries];
  }

  const filteredFacts = facts.filter((fact) => {
    if (included.includes('intake') && fact.sourceKind === 'intake') return true;
    if (included.includes('budget') && fact.sourceKind === 'budget') return true;
    if (included.includes('transactions') && fact.sourceKind === 'transaction') return true;
    if (included.includes('diagnostic') && fact.sourceKind === 'diagnostic') return true;
    if (included.includes('social_reflections') && fact.sourceKind === 'social_reflection') return true;
    if (included.includes('lifecycle') && fact.sourceKind === 'deterministic_derivation') return true;
    return false;
  });

  const resourceUris = manifestWithConflicts.sections
    .filter((section) => included.includes(section.name as (typeof included)[number]))
    .map((section) => section.resourceUri);

  const basePack: ContextPack = {
    contextVersion: manifestWithConflicts.contextVersion,
    packVersion: `pack-${hashContent({ input, facts: filteredFacts.map((f) => f.factId) })}`,
    generatedAt: bundle.loadedAt,
    facts: filteredFacts,
    deterministicSummaries,
    activeConflicts: conflicts,
    evidenceReferences: artifacts.filter((artifact) =>
      included.some((section) => artifact.uri.includes(section.replace(/_/g, '-'))),
    ),
    includedSections: included,
    omittedSections: omitted,
    resourceUris,
    tokenEstimate: estimateTokensFromJson({
      facts: filteredFacts,
      deterministicSummaries,
      activeConflicts: conflicts,
    }),
    cacheStatus: 'miss',
    sourceVersions: mergeSourceVersions(sourceVersions),
  };

  const key = cacheKey(bundle.userId, input, basePack.contextVersion);
  const cached = packCache.get(key);
  if (cached && cached.expiresAt > Date.now() && cached.contextVersion === basePack.contextVersion) {
    return { ...cached.pack, cacheStatus: 'hit' };
  }

  const trimmed = trimPackToTokenBudget(basePack, input.maxInputTokens);
  packCache.set(key, {
    contextVersion: trimmed.contextVersion,
    pack: trimmed,
    expiresAt: Date.now() + 60_000,
  });
  return trimmed;
}

export function invalidateContextPackCache(userId: string): void {
  for (const key of packCache.keys()) {
    if (key.startsWith(`${userId}|`)) packCache.delete(key);
  }
}
