/**
 * Canonical Core Agent timeout policy — single source for backend proxies and frontend clients.
 *
 * Layering:
 * - client (JSON): base timeout, optional +30s retry
 * - client (stream): base + stream extra (no retry on abort)
 * - Next.js proxy: stream client timeout + proxy buffer
 */

export const CORE_AGENT_DEFAULT_CLIENT_TIMEOUT_MS = 65_000;
export const CORE_AGENT_MOBILE_CLIENT_TIMEOUT_MS = 45_000;
export const CORE_AGENT_STREAM_EXTRA_TIMEOUT_MS = 30_000;
export const CORE_AGENT_PROXY_BUFFER_MS = 20_000;
export const CORE_AGENT_PROXY_RETRY_DELAY_MS = 450;

export function resolveCoreAgentClientTimeoutMs(envValue?: string | number | null): number {
  const parsed = Number(envValue);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : CORE_AGENT_DEFAULT_CLIENT_TIMEOUT_MS;
}

export function resolveCoreAgentStreamClientTimeoutMs(envValue?: string | number | null): number {
  return resolveCoreAgentClientTimeoutMs(envValue) + CORE_AGENT_STREAM_EXTRA_TIMEOUT_MS;
}

export function resolveCoreAgentProxyTimeoutMs(envValue?: string | number | null): number {
  return resolveCoreAgentStreamClientTimeoutMs(envValue) + CORE_AGENT_PROXY_BUFFER_MS;
}

export function resolveCoreAgentRetryTimeoutMs(envValue?: string | number | null): number {
  return resolveCoreAgentClientTimeoutMs(envValue) + CORE_AGENT_STREAM_EXTRA_TIMEOUT_MS;
}

export function resolveCoreAgentMobileClientTimeoutMs(envValue?: string | number | null): number {
  const parsed = Number(envValue);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.min(parsed, CORE_AGENT_DEFAULT_CLIENT_TIMEOUT_MS);
  }
  return CORE_AGENT_MOBILE_CLIENT_TIMEOUT_MS;
}
