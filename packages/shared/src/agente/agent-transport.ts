/**
 * Transport policy for Core Agent client calls.
 *
 * Desktop uses SSE streaming; mobile/PWA uses JSON POST (more reliable on iOS Safari).
 * JSON is also used when streaming is disabled or the stream transport fails.
 */

export const CORE_AGENT_STREAM_STALL_FALLBACK_MS = 12_000;

export type AgentTransportHint = {
  userAgent?: string | null;
  pointerCoarse?: boolean | null;
  mobileViewport?: boolean | null;
  streamEnvDisabled?: boolean;
};

/** JSON when streaming is disabled via env or on mobile/touch clients. */
export function shouldPreferAgentJsonTransport(hint: AgentTransportHint = {}): boolean {
  if (hint.streamEnvDisabled === true) return true;
  return isMobileAgentClient(hint);
}

/** Mobile / touch clients — longer timeouts and immediate UI flush during stream. */
export function isMobileAgentClient(hint: AgentTransportHint = {}): boolean {
  const ua = String(hint.userAgent ?? '').trim();
  if (/iPhone|iPad|iPod|Android/i.test(ua)) return true;
  if (hint.pointerCoarse === true) return true;
  if (hint.mobileViewport === true) return true;
  return false;
}

export function shouldFlushAgentStreamPatches(hint: AgentTransportHint = {}): boolean {
  return isMobileAgentClient(hint);
}

export function readBrowserAgentTransportHint(): AgentTransportHint {
  if (typeof window === 'undefined') return {};

  let pointerCoarse: boolean | null = null;
  let mobileViewport: boolean | null = null;
  try {
    pointerCoarse = window.matchMedia('(pointer: coarse)').matches;
    mobileViewport =
      window.matchMedia('(max-width: 768px)').matches ||
      window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  } catch {
    pointerCoarse = null;
    mobileViewport = null;
  }

  return {
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    pointerCoarse,
    mobileViewport,
    streamEnvDisabled: process.env.NEXT_PUBLIC_AGENT_STREAM === 'false',
  };
}
