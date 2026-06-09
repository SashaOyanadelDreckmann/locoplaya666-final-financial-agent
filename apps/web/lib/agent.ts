import {
  CHAT_PIPELINES,
  resolveCoreAgentClientTimeoutMs,
  resolveCoreAgentRetryTimeoutMs,
} from '@financial-agent/shared';

import { getAgentRequestUrl } from './apiBase';
import { parseApiResponse } from './apiEnvelope';
import { getCsrfToken } from './csrf';
import {
  buildCoreAgentRequestBody,
  type CoreAgentRequestPayload,
} from './agent/buildCoreAgentRequest';

export type { CoreAgentRequestPayload };

export async function sendToAgent(payload: CoreAgentRequestPayload) {
  const body = buildCoreAgentRequestBody(payload);
  const AGENT_URL = getAgentRequestUrl(CHAT_PIPELINES.core.route);
  const csrfToken = getCsrfToken();
  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
  };

  const timeoutMs = resolveCoreAgentClientTimeoutMs(process.env.NEXT_PUBLIC_AGENT_TIMEOUT_MS);
  const retryTimeoutEnabled = process.env.NEXT_PUBLIC_AGENT_RETRY_TIMEOUT !== 'false';
  const retry5xxEnabled = process.env.NEXT_PUBLIC_AGENT_RETRY_5XX !== 'false';

  async function fetchWithTimeout(ms: number): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ms);
    try {
      return await fetch(AGENT_URL, {
        method: 'POST',
        headers: requestHeaders,
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
    res = await fetchWithTimeout(timeoutMs);
  } catch (error: unknown) {
    if (retryTimeoutEnabled && error instanceof DOMException && error.name === 'AbortError') {
      try {
        res = await fetchWithTimeout(resolveCoreAgentRetryTimeoutMs(process.env.NEXT_PUBLIC_AGENT_TIMEOUT_MS));
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
    res = await fetchWithTimeout(timeoutMs);
  }

  return parseApiResponse<any>(res);
}
