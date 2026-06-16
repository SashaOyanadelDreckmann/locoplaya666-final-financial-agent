import { createHash } from 'crypto';

export function hashContent(value: unknown): string {
  const serialized = stableSerialize(value);
  return createHash('sha256').update(serialized).digest('hex').slice(0, 16);
}

export function buildSourceVersion(contentHash: string, lastModified?: string): string {
  const ts = lastModified ? Date.parse(lastModified) : Date.now();
  const safeTs = Number.isFinite(ts) ? ts : Date.now();
  return `v1-${contentHash}-${safeTs}`;
}

export function buildContextVersion(sectionHashes: Record<string, string>): string {
  const joined = Object.keys(sectionHashes)
    .sort()
    .map((key) => `${key}:${sectionHashes[key]}`)
    .join('|');
  return `ctx-${hashContent(joined)}`;
}

function stableSerialize(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableSerialize(item)).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableSerialize(obj[key])}`).join(',')}}`;
}
