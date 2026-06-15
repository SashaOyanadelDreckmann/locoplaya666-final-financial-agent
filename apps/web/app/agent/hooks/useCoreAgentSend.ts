'use client';

import { useCallback, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import {
  readBrowserAgentTransportHint,
  shouldPreferAgentJsonTransport,
} from '@financial-agent/shared';

import { getSessionIdForChat } from '@/lib/sesion/session';
import { primeAgentCsrfToken } from '@/lib/agente/agent';
import { sendToAgentStream } from '@/lib/agente/agent.stream';
import {
  applyCoreAgentErrorItems,
  applyCoreAgentResponseToItems,
  extractCoreAgentSideEffects,
  type CoreAgentResponseSideEffects,
} from '@/lib/agente/nucleo/applyCoreAgentResponse';
import { formatChatSendError } from '@/lib/compartido/userError';
import {
  buildCoreAgentHistorySnapshot,
  buildCoreAgentSendPayload,
  buildSlimCoreAgentSendPayload,
  type CoreAgentRequestContext,
} from '@/lib/agente/nucleo/buildCoreAgentContext';
import {
  buildCoreAgentRequestBody,
  serializeCoreAgentRequestBody,
  type CoreAgentRequestPayload,
} from '@/lib/agente/nucleo/buildCoreAgentRequest';
import {
  appendOptimisticCoreAgentTurn,
  patchStreamingAssistantMessage,
} from '@/lib/agente/nucleo/stream-session';
import type { AgentResponse, ChatItem } from '@/lib/agente/agent.response.types';

export type CoreAgentSendOptions = {
  agentPayload?: string;
  hideUserMessage?: boolean;
  ignoreLoadingGuard?: boolean;
};

export type UseCoreAgentSendParams = {
  setItemsForActive: (updater: ChatItem[] | ((prevItems: ChatItem[]) => ChatItem[])) => void;
  incrementUserMessageCount: () => void;
  clearDraft: () => void;
  getActiveThreadId: () => string;
  buildRequestContext: () => CoreAgentRequestContext;
  getSessionId: () => string;
  prepareSend?: () => Promise<void>;
  onSideEffects: (effects: CoreAgentResponseSideEffects, response: AgentResponse) => void;
  onTransientError?: (message: string) => void;
  normalizePanelAction?: (
    action: AgentResponse['panel_action'],
  ) => AgentResponse['panel_action'];
};

function canSerializeAgentPayload(payload: CoreAgentRequestPayload): boolean {
  try {
    serializeCoreAgentRequestBody(buildCoreAgentRequestBody(payload));
    return true;
  } catch {
    return false;
  }
}

function buildMinimalAgentSendPayload(
  context: CoreAgentRequestContext,
  params: {
    userMessage: string;
    agentMessage: string;
    sessionId: string;
    clientMessageId: string;
  },
) {
  return {
    user_message: params.agentMessage,
    session_id: params.sessionId,
    client_message_id: params.clientMessageId,
    history: buildCoreAgentHistorySnapshot(context.items, context.activeChatId),
    context: { client_hydrate: true },
    ui_state: {
      panel_stage: context.panelStage,
      panel_collapsed: context.isPanelCollapsed,
      active_chat: {
        id: context.activeThread?.id ?? context.activeChatId,
        label: context.activeThread?.label ?? 'Core',
        name: context.activeThread?.name ?? 'Diagnóstico financiero',
      },
    },
    _meta: {
      displayUserMessage: params.userMessage,
    },
  };
}

export function useCoreAgentSend(params: UseCoreAgentSendParams) {
  const [loading, setLoading] = useState(false);
  const sendGuardRef = useRef(false);

  const sendCoreAgentMessage = useCallback(async (
    userMessage: string,
    options?: CoreAgentSendOptions,
  ): Promise<{ ok: true; response: AgentResponse } | { ok: false; reason: 'busy' | 'error' }> => {
      if ((loading || sendGuardRef.current) && !options?.ignoreLoadingGuard) {
        return { ok: false, reason: 'busy' };
      }

      const agentMessage = String(options?.agentPayload ?? userMessage).trim();
      const hideUserMessage = options?.hideUserMessage === true;
      const clientMessageId =
        globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      params.clearDraft();
      sendGuardRef.current = true;

      flushSync(() => {
        setLoading(true);
        params.setItemsForActive((prev) =>
          appendOptimisticCoreAgentTurn({
            list: prev,
            userMessage,
            hideUserMessage,
            threadId: params.getActiveThreadId(),
          }),
        );
      });
      params.incrementUserMessageCount();

      try {
        await params.prepareSend?.();
        const requestContext = params.buildRequestContext();
        const preferJsonTransport = shouldPreferAgentJsonTransport(readBrowserAgentTransportHint());
        const activeThreadId = params.getActiveThreadId();
        const sendParams = {
          userMessage,
          agentMessage,
          sessionId: getSessionIdForChat(activeThreadId),
          clientMessageId,
        };

        await primeAgentCsrfToken(preferJsonTransport);

        const payloadCandidates = [
          preferJsonTransport
            ? buildSlimCoreAgentSendPayload(requestContext, sendParams)
            : buildCoreAgentSendPayload(requestContext, sendParams),
          buildSlimCoreAgentSendPayload(requestContext, sendParams),
          buildMinimalAgentSendPayload(requestContext, sendParams),
        ];

        let finalRequestPayload: CoreAgentRequestPayload | null = null;
        for (const candidate of payloadCandidates) {
          const { _meta: _ignoredMeta, ...stripped } = candidate;
          if (canSerializeAgentPayload(stripped)) {
            finalRequestPayload = stripped;
            break;
          }
        }

        if (!finalRequestPayload) {
          throw new Error('No se pudo preparar el mensaje para el agente');
        }

        const res = (await sendToAgentStream(finalRequestPayload, {
          onUiState: (streamState) => {
            params.setItemsForActive((prev) =>
              patchStreamingAssistantMessage(prev, {
                stream: streamState,
                mode: streamState.mode ?? 'information',
              }),
            );
          },
          onDelta: (_delta, fullText) => {
            params.setItemsForActive((prev) =>
              patchStreamingAssistantMessage(prev, {
                content: fullText,
              }),
            );
          },
        })) as AgentResponse;

        if (!res || typeof res !== 'object') {
          throw new Error('Respuesta inválida del agente');
        }

        if (params.normalizePanelAction) {
          res.panel_action = params.normalizePanelAction(res.panel_action);
        }

        const sideEffects = extractCoreAgentSideEffects(res);
        params.setItemsForActive((prev) =>
          applyCoreAgentResponseToItems({
            items: prev,
            response: res,
          }),
        );
        params.onSideEffects(sideEffects, res);

        return { ok: true, response: res };
      } catch (error: unknown) {
        if (process.env.NODE_ENV !== 'production') {
          console.error('[chat.send] failed', error);
        }
        const errorText = formatChatSendError(error);
        let transientError: string | undefined;
        params.setItemsForActive((prev) => {
          const next = applyCoreAgentErrorItems(prev, errorText);
          transientError = next.transientError;
          return next.items;
        });
        if (transientError) {
          params.onTransientError?.(transientError);
        }
        return { ok: false, reason: 'error' };
      } finally {
        sendGuardRef.current = false;
        setLoading(false);
      }
    },
    [
      loading,
      params.setItemsForActive,
      params.incrementUserMessageCount,
      params.clearDraft,
      params.getActiveThreadId,
      params.buildRequestContext,
      params.getSessionId,
      params.prepareSend,
      params.onSideEffects,
      params.onTransientError,
      params.normalizePanelAction,
    ],
  );

  return {
    loading,
    setLoading,
    sendCoreAgentMessage,
  };
}
