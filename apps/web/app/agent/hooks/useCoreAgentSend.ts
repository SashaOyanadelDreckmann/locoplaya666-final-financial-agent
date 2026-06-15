'use client';

import { useCallback, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import { sendToAgentStream } from '@/lib/agente/agent.stream';
import {
  applyCoreAgentErrorItems,
  applyCoreAgentResponseToItems,
  extractCoreAgentSideEffects,
  type CoreAgentResponseSideEffects,
} from '@/lib/agente/nucleo/applyCoreAgentResponse';
import {
  buildCoreAgentSendPayload,
  type CoreAgentRequestContext,
} from '@/lib/agente/nucleo/buildCoreAgentContext';
import {
  appendOptimisticCoreAgentTurn,
  patchStreamingAssistantMessage,
} from '@/lib/agente/nucleo/stream-session';
import type { AgentResponse, ChatItem } from '@/lib/agente/agent.response.types';
import { toUserFacingError } from '@/lib/compartido/userError';

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
  onSideEffects: (effects: CoreAgentResponseSideEffects, response: AgentResponse) => void;
  onTransientError?: (message: string) => void;
  normalizePanelAction?: (
    action: AgentResponse['panel_action'],
  ) => AgentResponse['panel_action'];
};

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
        const requestContext = params.buildRequestContext();
        const payload = buildCoreAgentSendPayload(requestContext, {
          userMessage,
          agentMessage,
          sessionId: params.getSessionId(),
          clientMessageId,
        });
        const { _meta: _ignoredMeta, ...requestPayload } = payload;

        const res = (await sendToAgentStream(requestPayload, {
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
        const errorText = toUserFacingError(error, 'chat.send');
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
