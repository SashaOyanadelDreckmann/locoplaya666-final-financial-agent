export const PRODUCT_CHAT_IDS = ['chat-1', 'chat-2', 'chat-3'] as const;

export type ProductChatId = (typeof PRODUCT_CHAT_IDS)[number];

export const MAX_CHAT_TURNS_BY_CHAT: Record<ProductChatId, number> = {
  'chat-1': 30,
  'chat-2': 12,
  'chat-3': 10,
};

export function getMaxChatTurns(chatId: ProductChatId): number {
  return MAX_CHAT_TURNS_BY_CHAT[chatId];
}

export function getClosingModeTurn(chatId: ProductChatId): number {
  const maxTurns = getMaxChatTurns(chatId);
  return Math.max(4, maxTurns - 6);
}

export function getRemainingChatTurns(chatId: ProductChatId, turnCount: number): number {
  return Math.max(0, getMaxChatTurns(chatId) - Math.max(0, Math.floor(Number(turnCount ?? 0))));
}
