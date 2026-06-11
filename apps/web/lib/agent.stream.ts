import {
  applyAgentStreamEvent,
  CHAT_PIPELINES,
  createInitialAgentStreamUiState,
  parseAgentStreamSseChunk,
  resolveCoreAgentStreamClientTimeoutMs,
  type AgentStreamEvent,
  type AgentStreamUiState,
} from '@financial-agent/shared';

import { sendToAgent } from './agent';
import { getAgentRequestUrl } from './apiBase';
import { ApiHttpError, parseApiResponse } from './apiEnvelope';
import { getCsrfToken, setCsrfToken } from './csrf';
import type { AgentResponse } from './agent.response.types';
import {
  buildCoreAgentRequestBody,
  type CoreAgentRequestPayload,
} from './agent/buildCoreAgentRequest';

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

export async function sendToAgentStream(
  payload: CoreAgentRequestPayload,
  callbacks: AgentStreamCallbacks = {},
): Promise<AgentResponse> {
  const streamEnabled = process.env.NEXT_PUBLIC_AGENT_STREAM !== 'false';
  if (!streamEnabled) {
    return sendToAgent(payload) as Promise<AgentResponse>;
  }

  const body = buildCoreAgentRequestBody({ ...payload, stream: true });
  const AGENT_STREAM_URL = getAgentRequestUrl(CHAT_PIPELINES.core.streamRoute);
  const csrfToken = getCsrfToken();
  const timeoutMs = resolveCoreAgentStreamClientTimeoutMs(process.env.NEXT_PUBLIC_AGENT_TIMEOUT_MS);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let uiState = createInitialAgentStreamUiState();
  callbacks.onUiState?.(uiState);

  let fullText = '';
  let finalResponse: AgentResponse | null = null;

  try {
    const res = await fetch(AGENT_STREAM_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      },
      credentials: 'include',
      body: JSON.stringify(body),
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
        callbacks.onEvent?.(event);
        uiState = applyAgentStreamEvent(uiState, event);
        callbacks.onUiState?.(uiState);

        if (event.type === 'message.delta') {
          fullText += event.delta;
          callbacks.onDelta?.(event.delta, fullText);
        }

        if (event.type === 'run.complete') {
          finalResponse = event.response as AgentResponse;
        }

        if (event.type === 'run.error') {
          throw new Error(event.message);
        }
      }
    }

    if (finalResponse) return finalResponse;
    if (fullText.trim().length > 0) {
      return { message: fullText, mode: uiState.mode ?? 'information' };
    }

    return sendToAgent(payload) as Promise<AgentResponse>;
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Agent timeout: la respuesta tardó demasiado');
    }
    if (finalResponse) return finalResponse;
    if (!isRecoverableStreamTransportError(error)) {
      throw error;
    }
    return sendToAgent(payload) as Promise<AgentResponse>;
  } finally {
    clearTimeout(timeoutId);
  }
}
