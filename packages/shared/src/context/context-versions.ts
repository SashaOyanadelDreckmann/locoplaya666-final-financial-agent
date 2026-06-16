import type { ContextSourceVersion } from './context-contracts';

export const CONTEXT_SECTION_NAMES = [
  'intake',
  'budget',
  'transactions',
  'documents',
  'diagnostic',
  'interview',
  'social_reflections',
  'memory',
  'lifecycle',
] as const;

export type ContextSectionName = (typeof CONTEXT_SECTION_NAMES)[number];

export function buildResourceUri(section: ContextSectionName, suffix?: string): string {
  const base = `financial://me/${section.replace(/_/g, '-')}`;
  return suffix ? `${base}/${suffix}` : base;
}

export function buildManifestResourceUri(): string {
  return 'financial://me/manifest';
}

export function buildSnapshotResourceUri(version: string): string {
  return `financial://me/context/snapshot/${version}`;
}

export function mergeSourceVersions(
  versions: ContextSourceVersion[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of versions) {
    out[`${entry.sourceKind}:${entry.sourceId}`] = entry.version;
  }
  return out;
}

export function estimateTokensFromJson(value: unknown): number {
  try {
    const serialized = JSON.stringify(value ?? null);
    return Math.max(1, Math.ceil(serialized.length / 4));
  } catch {
    return 1;
  }
}
