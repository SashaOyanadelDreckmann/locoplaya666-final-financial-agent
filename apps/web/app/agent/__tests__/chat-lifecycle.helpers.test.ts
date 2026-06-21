/** @jest-environment node */

import {
  CHAT_CLOSED_SEND_MESSAGE,
  isChatClosed,
  isChatOnboardingLocked,
  listNavigableChatIds,
  resolveChatThreadAccessState,
  resolveChatTurnCount,
} from '../utilidades/chat-lifecycle.helpers';

describe('chat lifecycle helpers', () => {
  it('prefers lifecycle turn count over local user message count when lifecycle is loaded', () => {
    expect(
      resolveChatTurnCount({
        chatId: 'chat-2',
        chatTurns: { 'chat-2': 12 },
        lifecycleLoaded: true,
        fallbackUserMessageCount: 18,
      }),
    ).toBe(12);
  });

  it('treats missing lifecycle turns as zero once lifecycle is loaded', () => {
    expect(
      resolveChatTurnCount({
        chatId: 'chat-2',
        chatTurns: {},
        lifecycleLoaded: true,
        fallbackUserMessageCount: 9,
      }),
    ).toBe(0);
  });

  it('distinguishes onboarding lock from closed chats', () => {
    expect(
      resolveChatThreadAccessState({
        chatId: 'chat-2',
        unlockedChatIds: ['chat-1'],
        closedChatIds: [],
        chatTurns: { 'chat-2': 0 },
        lifecycleLoaded: true,
      }),
    ).toBe('locked');

    expect(
      resolveChatThreadAccessState({
        chatId: 'chat-2',
        unlockedChatIds: ['chat-1', 'chat-2', 'chat-3'],
        closedChatIds: ['chat-2'],
        chatTurns: { 'chat-2': 12 },
        lifecycleLoaded: true,
      }),
    ).toBe('closed');
  });

  it('marks chat as closed when turns are exhausted even if closedChats is stale', () => {
    expect(
      isChatClosed({
        chatId: 'chat-3',
        closedChatIds: [],
        turnCount: 10,
      }),
    ).toBe(true);
  });

  it('keeps chat 1 navigable when closed by interactions', () => {
    expect(
      isChatOnboardingLocked({
        chatId: 'chat-1',
        unlockedChatIds: ['chat-1'],
      }),
    ).toBe(false);

    expect(
      resolveChatThreadAccessState({
        chatId: 'chat-1',
        unlockedChatIds: ['chat-1', 'chat-2', 'chat-3'],
        closedChatIds: ['chat-1'],
        chatTurns: { 'chat-1': 30 },
        lifecycleLoaded: true,
      }),
    ).toBe('closed');
  });

  it('includes closed but unlocked chats in mobile navigation order', () => {
    expect(
      listNavigableChatIds({
        chatIds: ['chat-1', 'chat-2', 'chat-3'],
        unlockedChatIds: ['chat-1', 'chat-2', 'chat-3'],
      }),
    ).toEqual(['chat-1', 'chat-2', 'chat-3']);
  });

  it('exposes a stable closed-send message', () => {
    expect(CHAT_CLOSED_SEND_MESSAGE).toContain('cerró');
  });
});
