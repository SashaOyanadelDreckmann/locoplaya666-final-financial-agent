import type { BuildContextPackInput, ContextManifest, ContextPack } from '@financial-agent/shared';
import { getContextFabricFlags, isContextFabricActive } from './context-fabric.policy';
import { loadContextSourceBundle } from './context-source.loader';
import { buildManifestFromBundle } from './context-provenance.service';
import { buildContextPackFromBundle } from './context-pack.service';
import { detectContextConflicts } from './context-consistency.service';
import { buildFactsFromBundle } from './context-provenance.service';
import { logContextFabricAudit } from './context-fabric.audit';

export async function getContextManifestForUser(user: {
  id: string;
  injectedIntake?: unknown;
  injectedProfile?: unknown;
  latestDiagnosticProfileId?: string | null;
  memoryBlob?: unknown;
  panelState?: unknown;
}): Promise<ContextManifest> {
  const bundle = await loadContextSourceBundle(user);
  const flags = getContextFabricFlags();
  const { facts } = buildFactsFromBundle(bundle);
  const baseManifest = buildManifestFromBundle(bundle, 0);
  if (!flags.consistencyEnabled && !flags.shadowMode && !flags.enabled && !flags.coreContextPackEnabled) {
    return baseManifest;
  }
  const conflicts = detectContextConflicts({
    facts,
    contextVersion: baseManifest.contextVersion,
    diagnosticCompletedAt: bundle.diagnosticProfile?.meta?.completedAt ?? null,
    budgetLastModified: baseManifest.sections.find((s) => s.name === 'budget')?.lastModified,
  });
  return buildManifestFromBundle(bundle, conflicts.length);
}

export async function getContextPackForUser(
  user: Parameters<typeof loadContextSourceBundle>[0],
  input: BuildContextPackInput,
  audit?: { correlationId?: string; pipeline?: string },
): Promise<ContextPack | null> {
  if (!isContextFabricActive()) return null;
  const started = Date.now();
  const bundle = await loadContextSourceBundle(user);
  const pack = buildContextPackFromBundle(bundle, input);
  logContextFabricAudit({
    correlationId: audit?.correlationId,
    pipeline: audit?.pipeline ?? input.consumer,
    contextVersion: pack.contextVersion,
    packVersion: pack.packVersion,
    includedSections: pack.includedSections,
    omittedSections: pack.omittedSections,
    tokenEstimate: pack.tokenEstimate,
    cacheStatus: pack.cacheStatus,
    conflictCount: pack.activeConflicts.length,
    factCount: pack.facts.length,
    latencyMs: Date.now() - started,
    flags: getContextFabricFlags(),
  });
  return pack;
}
