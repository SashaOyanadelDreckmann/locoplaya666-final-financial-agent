'use client';

import { useCallback, useState } from 'react';

import { sendToAgentStream } from '@/lib/agent.stream';
import {
  applyCoreAgentErrorItems,
  applyCoreAgentResponseToItems,
  extractCoreAgentSideEffects,
  type CoreAgentResponseSideEffects,
} from '@/lib/agent/applyCoreAgentResponse';
import {
  buildCoreAgentSendPayload,
  type CoreAgentRequestContext,
} from '@/lib/agent/buildCoreAgentContext';
import {
  appendOptimisticCoreAgentTurn,
  patchStreamingAssistantMessage,
} from '@/lib/agent/stream-session';
import type { AgentResponse, ChatItem } from '@/lib/agent.response.types';
import { toUserFacingError } from '@/lib/userError';

export type CoreAgentSendOptions = {
  agentPayload?: string;
  hideUserMessage?: boolean;
  ignoreLoadingGuard?: boolean;
};

export type UseCoreAgentSendParams = {
  setItemsForActive: (updater: ChatItem[] | ((prevItems: ChatItem[]) => ChatItem[])) => void;
  incrementUserMessageCount: () => void;
  clearDraft: () => void;
  buildRequestContext: () => CoreAgentRequestContext;
  getSessionId: () => string;
  onSideEffects: (effects: CoreAgentResponseSideEffects, response: AgentResponse) => void;
  normalizePanelAction?: (
    action: AgentResponse['panel_action'],
  ) => AgentResponse['panel_action'];
};

export function useCoreAgentSend(params: UseCoreAgentSendParams) {
  const [loading, setLoading] = useState(false);

  const sendCoreAgentMessage = useCallback(async (
    userMessage: string,
    options?: CoreAgentSendOptions,
  ): Promise<{ ok: true; response: AgentResponse } | { ok: false; reason: 'busy' | 'error' }> => {
      if (loading && !options?.ignoreLoadingGuard) {
        return { ok: false, reason: 'busy' };
      }

      const agentMessage = String(options?.agentPayload ?? userMessage).trim();
      const hideUserMessage = options?.hideUserMessage === true;
      const clientMessageId =
        globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      params.clearDraft();
      setLoading(true);

      params.setItemsForActive((prev) =>
        appendOptimisticCoreAgentTurn({
          list: prev,
          userMessage,
          hideUserMessage,
        }),
      );
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
        const errorText = toUserFacingError(error, 'chat.send');
        params.setItemsForActive((prev) => applyCoreAgentErrorItems(prev, errorText));
        return { ok: false, reason: 'error' };
      } finally {
        setLoading(false);
      }
    },
    [
      loading,
      params.setItemsForActive,
      params.incrementUserMessageCount,
      params.clearDraft,
      params.buildRequestContext,
      params.getSessionId,
      params.onSideEffects,
      params.normalizePanelAction,
    ],
  );

  return {
    loading,
    setLoading,
    sendCoreAgentMessage,
  };
}
