/**
 * Transport policy for Core Agent client calls.
 *
 * Mobile Safari often buffers fetch+ReadableStream SSE until the connection closes,
 * which leaves the chat stuck on the first phase with an empty bubble. JSON POST
 * avoids that and still uses the same Next.js session proxy.
 */

export const CORE_AGENT_STREAM_STALL_FALLBACK_MS = 12_000;

export type AgentTransportHint = {
  userAgent?: string | null;
  pointerCoarse?: boolean | null;
  mobileViewport?: boolean | null;
  streamEnvDisabled?: boolean;
};

export function shouldPreferAgentJsonTransport(hint: AgentTransportHint = {}): boolean {
  if (hint.streamEnvDisabled === true) return true;

  const ua = String(hint.userAgent ?? '').trim();
  if (/iPhone|iPad|iPod|Android/i.test(ua)) return true;

  if (hint.pointerCoarse === true) return true;
  if (hint.mobileViewport === true) return true;

  return false;
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
