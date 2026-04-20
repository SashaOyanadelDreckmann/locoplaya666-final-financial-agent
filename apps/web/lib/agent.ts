import { getAgentRequestUrl } from './apiBase';
import { parseApiResponse } from './apiEnvelope';

/* ────────────────────────────────────────────── */
/* Envío al agente central (LIMPIO)               */
/* ────────────────────────────────────────────── */

export async function sendToAgent(payload: {
  user_message: string;
  session_id?: string;
  history?: { role: 'user' | 'assistant'; content: string }[];
  profile?: unknown;
  user_info?: { name?: string };
  context?: Record<string, unknown>;
  ui_state?: Record<string, unknown>;
  preferences?: Record<string, unknown>;
}) {
  const { profile, user_info, history, context, ...rest } = payload;

  /* user_id persistente */
  let userId = 'anonymous';
  try {
    const persisted = localStorage.getItem('user_id');
    if (persisted) userId = persisted;
  } catch {}

  /* history mínimo */
  const safeHistory = Array.isArray(history)
    ? history
        .filter(
          (h) =>
            h &&
            (h.role === 'user' || h.role === 'assistant') &&
            typeof h.content === 'string' &&
            h.content.trim().length > 0
        )
        .slice(-8)
    : [];

  /* user_name garantizado */
  let resolvedUserInfo = user_info;
  if (!resolvedUserInfo) {
    try {
      const name = localStorage.getItem('user_name');
      if (name) resolvedUserInfo = { name };
    } catch {}
  }

  const body = {
    user_id: userId,
    user_name: resolvedUserInfo?.name,
    ...rest,
    history: safeHistory,
    context: {
      ...(context ?? {}),
      ...(profile ? { profile } : {}),
      ...(resolvedUserInfo ? { user_info: resolvedUserInfo } : {}),
    },
  };

  if (process.env.NODE_ENV !== 'production') {
    // útil en desarrollo sin ensuciar prod
    console.log('[DEV] payload.user_message =', payload.user_message);
  }

  const AGENT_URL = getAgentRequestUrl('/api/agent');
  const timeoutMs = Number(process.env.NEXT_PUBLIC_AGENT_TIMEOUT_MS || 35000);
  const retryTimeoutEnabled = process.env.NEXT_PUBLIC_AGENT_RETRY_TIMEOUT !== 'false';
  const retry5xxEnabled = process.env.NEXT_PUBLIC_AGENT_RETRY_5XX !== 'false';

  async function fetchWithTimeout(): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(AGENT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  let res: Response;
  try {
    res = await fetchWithTimeout();
  } catch (error: unknown) {
    if (retryTimeoutEnabled && error instanceof DOMException && error.name === 'AbortError') {
      // Retry once with a larger timeout for slow tool chains.
      try {
        const retryController = new AbortController();
        const retryTimeoutId = setTimeout(() => retryController.abort(), timeoutMs + 20000);
        try {
          res = await fetch(AGENT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(body),
            signal: retryController.signal,
          });
        } finally {
          clearTimeout(retryTimeoutId);
        }
      } catch (retryError: unknown) {
        if (retryError instanceof DOMException && retryError.name === 'AbortError') {
          throw new Error('Agent timeout: la respuesta tardó demasiado');
        }
        throw retryError;
      }
    }
    throw error;
  }

  // Railway can briefly return 5xx during deploy/wake-up; retry once.
  if (retry5xxEnabled && res.status >= 500 && res.status <= 599) {
    await new Promise((resolve) => setTimeout(resolve, 700));
    res = await fetchWithTimeout();
  }

  return parseApiResponse<any>(res);
}
