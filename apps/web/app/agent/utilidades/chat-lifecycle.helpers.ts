import { getMaxChatTurns, PRODUCT_CHAT_IDS, type ProductChatId } from '@financial-agent/shared';

export const PRIMARY_CHAT_ID = 'chat-1';

export const CHAT_ONBOARDING_LOCKED_MESSAGE =
  'Completa presupuesto, cartolas y entrevista para desbloquear este chat.';

export const CHAT_CLOSED_SEND_MESSAGE =
  'Este chat ya cerró su ventana de interacciones. Puedes revisar el resumen, ver el historial completo o exportar con Guardar PDF.';

export type ChatThreadAccessState = 'active' | 'closed' | 'locked';

function maxInteractionsForChat(chatId: string): number {
  if (PRODUCT_CHAT_IDS.includes(chatId as ProductChatId)) {
    return getMaxChatTurns(chatId as ProductChatId);
  }
  return getMaxChatTurns('chat-1');
}

export function resolveChatTurnCount(params: {
  chatId: string;
  chatTurns?: Record<string, number> | null;
  lifecycleLoaded?: boolean;
  fallbackUserMessageCount?: number;
}): number {
  const fromLifecycle = params.chatTurns?.[params.chatId];
  if (params.lifecycleLoaded) {
    return typeof fromLifecycle === 'number' && Number.isFinite(fromLifecycle)
      ? Math.max(0, Math.floor(fromLifecycle))
      : 0;
  }
  if (typeof fromLifecycle === 'number' && Number.isFinite(fromLifecycle)) {
    return Math.max(0, Math.floor(fromLifecycle));
  }
  const fallback = Number(params.fallbackUserMessageCount ?? 0);
  return Number.isFinite(fallback) ? Math.max(0, Math.floor(fallback)) : 0;
}

export function isChatInteractionExhausted(chatId: string, turnCount: number): boolean {
  return turnCount >= maxInteractionsForChat(chatId);
}

export function isChatMarkedClosed(chatId: string, closedChatIds: string[]): boolean {
  return closedChatIds.includes(chatId);
}

export function isChatClosed(params: {
  chatId: string;
  closedChatIds: string[];
  turnCount: number;
}): boolean {
  return (
    isChatMarkedClosed(params.chatId, params.closedChatIds) ||
    isChatInteractionExhausted(params.chatId, params.turnCount)
  );
}

export function isChatOnboardingLocked(params: {
  chatId: string;
  unlockedChatIds: string[];
  primaryChatId?: string;
}): boolean {
  const primaryChatId = params.primaryChatId ?? PRIMARY_CHAT_ID;
  if (params.chatId === primaryChatId) return false;
  return !params.unlockedChatIds.includes(params.chatId);
}

export function resolveChatThreadAccessState(params: {
  chatId: string;
  unlockedChatIds: string[];
  closedChatIds: string[];
  chatTurns?: Record<string, number> | null;
  lifecycleLoaded?: boolean;
  primaryChatId?: string;
}): ChatThreadAccessState {
  if (
    isChatOnboardingLocked({
      chatId: params.chatId,
      unlockedChatIds: params.unlockedChatIds,
      primaryChatId: params.primaryChatId,
    })
  ) {
    return 'locked';
  }
  const turnCount = resolveChatTurnCount({
    chatId: params.chatId,
    chatTurns: params.chatTurns,
    lifecycleLoaded: params.lifecycleLoaded,
  });
  if (
    isChatClosed({
      chatId: params.chatId,
      closedChatIds: params.closedChatIds,
      turnCount,
    })
  ) {
    return 'closed';
  }
  return 'active';
}

export function listNavigableChatIds(params: {
  chatIds: string[];
  unlockedChatIds: string[];
  primaryChatId?: string;
}): string[] {
  const primaryChatId = params.primaryChatId ?? PRIMARY_CHAT_ID;
  return params.chatIds.filter(
    (chatId) => chatId === primaryChatId || params.unlockedChatIds.includes(chatId),
  );
}
