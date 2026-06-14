export type FaRuntimePublicConfig = {
  apiOrigin: string;
};

declare global {
  interface Window {
    __FA_RUNTIME__?: FaRuntimePublicConfig;
  }
}

const API_ORIGIN_ENV_KEYS = [
  'NEXT_PUBLIC_AGENT_API_URL',
  'NEXT_PUBLIC_API_URL',
  'NEXT_PUBLIC_API_ORIGIN',
  'INTERNAL_API_ORIGIN',
  'API_ORIGIN',
] as const;

export function normalizeApiOrigin(value: string): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw.replace(/\/+$/, '');
  if (/^[a-z0-9.-]+(?::\d+)?$/i.test(raw)) return `https://${raw.replace(/\/+$/, '')}`;
  return raw.replace(/\/+$/, '');
}

export function readApiOriginFromProcessEnv(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  for (const key of API_ORIGIN_ENV_KEYS) {
    const normalized = normalizeApiOrigin(env[key] ?? '');
    if (normalized) return normalized;
  }
  return null;
}

export function readApiOriginFromRuntimeWindow(): string | null {
  if (typeof window === 'undefined') return null;
  return normalizeApiOrigin(window.__FA_RUNTIME__?.apiOrigin ?? '');
}

export function buildRuntimePublicConfig(): FaRuntimePublicConfig {
  return {
    apiOrigin: readApiOriginFromProcessEnv() ?? '',
  };
}

export function buildRuntimePublicConfigScript(): string {
  const payload = JSON.stringify(buildRuntimePublicConfig()).replace(/</g, '\\u003c');
  return `window.__FA_RUNTIME__=${payload};`;
}
