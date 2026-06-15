import {
  applyAgentStreamEvent,
  CHAT_PIPELINES,
  CORE_AGENT_STREAM_STALL_FALLBACK_MS,
  createInitialAgentStreamUiState,
  createJsonTransportStreamUiState,
  parseAgentStreamSseChunk,
  readBrowserAgentTransportHint,
  resolveCoreAgentStreamClientTimeoutMs,
  shouldPreferAgentJsonTransport,
  stripAgentStreamTags,
  type AgentStreamEvent,
  type AgentStreamUiState,
} from '@financial-agent/shared';

import { sendToAgent } from './agent';
import { getAgentRequestUrl, getSessionApiBaseUrl } from '@/lib/api/base';
import { ApiHttpError, parseApiResponse } from '@/lib/api/envelope';
import { getCsrfToken, setCsrfToken } from '@/lib/sesion/csrf';
import type { AgentResponse } from './agent.response.types';
import {
  buildCoreAgentRequestBody,
  serializeCoreAgentRequestBody,
  type CoreAgentRequestPayload,
} from './nucleo/buildCoreAgentRequest';

export type { AgentStreamUiState };

export type AgentStreamCallbacks = {
  onEvent?: (event: AgentStreamEvent) => void;
  onDelta?: (delta: string, fullText: string) => void;
  onUiState?: (state: AgentStreamUiState) => void;
};

function captureCsrfFromResponse(res: Response): void {
  const token = res.headers.get('x-csrf-token');
  if (token) setCsrfToken(token);
}

function isRecoverableStreamTransportError(error: unknown): boolean {
  if (error instanceof ApiHttpError) return false;
  if (error instanceof DOMException && error.name === 'AbortError') return false;
  if (!(error instanceof Error)) return true;
  const msg = error.message.toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('load failed') ||
    msg.includes('networkerror') ||
    msg.includes('network request failed')
  );
}

function emitJsonTransportUiState(callbacks: AgentStreamCallbacks): void {
  callbacks.onUiState?.(createJsonTransportStreamUiState());
}

export async function sendToAgentStream(
  payload: CoreAgentRequestPayload,
  callbacks: AgentStreamCallbacks = {},
): Promise<AgentResponse> {
  const transportHint = readBrowserAgentTransportHint();
  const streamEnabled = !transportHint.streamEnvDisabled;
  if (!streamEnabled || shouldPreferAgentJsonTransport(transportHint)) {
    emitJsonTransportUiState(callbacks);
    return sendToAgent(payload) as Promise<AgentResponse>;
  }

  const body = buildCoreAgentRequestBody({ ...payload, stream: true });
  const AGENT_STREAM_URL = getAgentRequestUrl(CHAT_PIPELINES.core.streamRoute);
  const csrfToken = getCsrfToken() ?? (await fetch(`${getSessionApiBaseUrl()}/api/session`, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
  }).then((res) => {
    const token = res.headers.get('x-csrf-token');
    if (token) setCsrfToken(token);
    return token;
  }).catch(() => null));
  const timeoutMs = resolveCoreAgentStreamClientTimeoutMs(process.env.NEXT_PUBLIC_AGENT_TIMEOUT_MS);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let uiState = createInitialAgentStreamUiState();
  callbacks.onUiState?.(uiState);

  let fullText = '';
  let finalResponse: AgentResponse | null = null;
  let lastEventAt = Date.now();
  let abortedForStall = false;
  const stallTimer = setInterval(() => {
    if (finalResponse || fullText.trim().length > 0) return;
    if (Date.now() - lastEventAt < CORE_AGENT_STREAM_STALL_FALLBACK_MS) return;
    abortedForStall = true;
    controller.abort();
  }, 2_000);

  try {
    const res = await fetch(AGENT_STREAM_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      },
      credentials: 'include',
      body: serializeCoreAgentRequestBody(body),
      signal: controller.signal,
    });

    captureCsrfFromResponse(res);

    if (!res.ok) {
      const contentType = res.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        return parseApiResponse<AgentResponse>(res);
      }
      return sendToAgent(payload) as Promise<AgentResponse>;
    }

    if (!res.body) {
      return sendToAgent(payload) as Promise<AgentResponse>;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parsed = parseAgentStreamSseChunk(buffer);
      buffer = parsed.remainder;

      for (const event of parsed.events) {
        lastEventAt = Date.now();
        callbacks.onEvent?.(event);
        uiState = applyAgentStreamEvent(uiState, event);
        callbacks.onUiState?.(uiState);

        if (event.type === 'message.delta') {
          fullText += event.delta;
          callbacks.onDelta?.(event.delta, stripAgentStreamTags(fullText));
        }

        if (event.type === 'run.complete') {
          finalResponse = event.response as AgentResponse;
        }

        if (event.type === 'run.error') {
          emitJsonTransportUiState(callbacks);
          return sendToAgent(payload) as Promise<AgentResponse>;
        }
      }
    }

    if (finalResponse) return finalResponse;
    if (fullText.trim().length > 0) {
      emitJsonTransportUiState(callbacks);
      return sendToAgent(payload) as Promise<AgentResponse>;
    }

    return sendToAgent(payload) as Promise<AgentResponse>;
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      if (finalResponse) return finalResponse;
      if (abortedForStall || fullText.trim().length > 0) {
        emitJsonTransportUiState(callbacks);
        return sendToAgent(payload) as Promise<AgentResponse>;
      }
      throw new Error('Agent timeout: la respuesta tardó demasiado');
    }
    if (finalResponse) return finalResponse;
    if (!isRecoverableStreamTransportError(error)) {
      throw error;
    }
    emitJsonTransportUiState(callbacks);
    return sendToAgent(payload) as Promise<AgentResponse>;
  } finally {
    clearInterval(stallTimer);
    clearTimeout(timeoutId);
  }
}
