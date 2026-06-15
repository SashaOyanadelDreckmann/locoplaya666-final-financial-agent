import {
  CHAT_PIPELINES,
  readBrowserAgentTransportHint,
  resolveCoreAgentClientTimeoutMs,
  resolveCoreAgentMobileClientTimeoutMs,
  resolveCoreAgentRetryTimeoutMs,
  shouldPreferAgentJsonTransport,
} from '@financial-agent/shared';

import { getAgentRequestUrl, getSessionApiBaseUrl } from '@/lib/api/base';
import { parseApiResponse } from '@/lib/api/envelope';
import { getCsrfToken, setCsrfToken, clearCsrfToken } from '@/lib/sesion/csrf';
import {
  buildCoreAgentRequestBody,
  serializeCoreAgentRequestBody,
  type CoreAgentRequestPayload,
} from './nucleo/buildCoreAgentRequest';

export type { CoreAgentRequestPayload };

function resolveBrowserAgentPostUrl(path = CHAT_PIPELINES.core.route): string {
  const relative = getAgentRequestUrl(path);
  if (typeof window === 'undefined') return relative;
  return new URL(relative, window.location.origin).href;
}

async function ensureAgentCsrfToken(force = false): Promise<string | null> {
  if (!force) {
    const existing = getCsrfToken();
    if (existing) return existing;
  }

  try {
    const res = await fetch(`${getSessionApiBaseUrl()}/api/session`, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });
    const token = res.headers.get('x-csrf-token');
    if (token) {
      setCsrfToken(token);
      return token;
    }
    if (res.ok) {
      await res.json().catch(() => null);
    }
  } catch {
    // fall through
  }

  return getCsrfToken();
}

export async function primeAgentCsrfToken(force = false): Promise<string | null> {
  return ensureAgentCsrfToken(force);
}

async function postAgentRequest(params: {
  url: string;
  headers: Record<string, string>;
  body: string;
  timeoutMs: number;
}): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), params.timeoutMs);
  try {
    return await fetch(params.url, {
      method: 'POST',
      headers: params.headers,
      credentials: 'include',
      cache: 'no-store',
      body: params.body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function sendToAgent(payload: CoreAgentRequestPayload) {
  const AGENT_URL = resolveBrowserAgentPostUrl(CHAT_PIPELINES.core.route);
  const transportHint = readBrowserAgentTransportHint();
  const isMobileJson = shouldPreferAgentJsonTransport(transportHint);
  const timeoutMs = isMobileJson
    ? resolveCoreAgentMobileClientTimeoutMs(process.env.NEXT_PUBLIC_AGENT_TIMEOUT_MS)
    : resolveCoreAgentClientTimeoutMs(process.env.NEXT_PUBLIC_AGENT_TIMEOUT_MS);
  const body = buildCoreAgentRequestBody(payload);
  const serializedBody = serializeCoreAgentRequestBody(body);

  if (process.env.NODE_ENV !== 'production') {
    console.info('[agent.send] POST', AGENT_URL, `${serializedBody.length} bytes`);
  }

  const retryTimeoutEnabled = process.env.NEXT_PUBLIC_AGENT_RETRY_TIMEOUT !== 'false';
  const retry5xxEnabled = process.env.NEXT_PUBLIC_AGENT_RETRY_5XX !== 'false';

  async function fetchWithCsrf(attempt: number, requestTimeoutMs = timeoutMs): Promise<Response> {
    if (attempt > 0) {
      clearCsrfToken();
    }
    const csrfToken = await ensureAgentCsrfToken(isMobileJson || attempt > 0);
    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    };
    return postAgentRequest({
      url: AGENT_URL,
      headers: requestHeaders,
      body: serializedBody,
      timeoutMs: requestTimeoutMs,
    });
  }

  let res: Response;
  try {
    res = await fetchWithCsrf(0);
    if (res.status === 403 && isMobileJson) {
      res = await fetchWithCsrf(1);
    }
  } catch (error: unknown) {
    if (retryTimeoutEnabled && error instanceof DOMException && error.name === 'AbortError') {
      try {
        const retryTimeoutMs = resolveCoreAgentRetryTimeoutMs(
          process.env.NEXT_PUBLIC_AGENT_TIMEOUT_MS,
        );
        res = await fetchWithCsrf(0, retryTimeoutMs);
        if (res.status === 403 && isMobileJson) {
          res = await fetchWithCsrf(1, retryTimeoutMs);
        }
      } catch (retryError: unknown) {
        if (retryError instanceof DOMException && retryError.name === 'AbortError') {
          throw new Error('Agent timeout: la respuesta tardó demasiado');
        }
        throw retryError;
      }
    } else {
      throw error;
    }
  }

  if (retry5xxEnabled && res.status >= 500 && res.status <= 599) {
    await new Promise((resolve) => setTimeout(resolve, 700));
    res = await fetchWithCsrf(0);
  }

  if (process.env.NODE_ENV !== 'production') {
    console.info('[agent.send] response', res.status);
  }

  return parseApiResponse<any>(res);
}
