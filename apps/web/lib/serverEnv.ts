import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ENV_CANDIDATES = [
  path.resolve(process.cwd(), '.env.local'),
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), 'apps/web/.env.local'),
  path.resolve(process.cwd(), 'apps/web/.env'),
  path.resolve(process.cwd(), 'apps/api/.env'),
  path.resolve(process.cwd(), '../api/.env'),
];

let cachedEnv: Record<string, string> | null = null;

function normalizeEnvValue(raw: string) {
  const trimmed = raw.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function loadFallbackEnv() {
  if (cachedEnv) return cachedEnv;
  const merged: Record<string, string> = {};

  for (const filePath of ENV_CANDIDATES) {
    if (!existsSync(filePath)) continue;
    const content = readFileSync(filePath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const separatorIndex = trimmed.indexOf('=');
      if (separatorIndex <= 0) continue;
      const key = trimmed.slice(0, separatorIndex).trim();
      const value = normalizeEnvValue(trimmed.slice(separatorIndex + 1));
      if (!(key in merged)) merged[key] = value;
    }
  }

  cachedEnv = merged;
  return merged;
}

export function getServerEnv(key: string) {
  const direct = process.env[key];
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  return loadFallbackEnv()[key];
}
