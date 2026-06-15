/** @jest-environment jsdom */

import {
  isChatThreadNearBottom,
  scrollChatThreadAfterUpdate,
} from '../utilidades/page.utils';

function createThread(contentHeight: number, viewportHeight: number, scrollTop: number) {
  const thread = document.createElement('div');
  thread.className = 'agent-thread';
  Object.defineProperty(thread, 'clientHeight', { value: viewportHeight, configurable: true });
  Object.defineProperty(thread, 'scrollHeight', { value: contentHeight, configurable: true });
  thread.scrollTop = scrollTop;
  return thread;
}

describe('chat thread scroll helpers', () => {
  it('detects when the thread is near the bottom', () => {
    const thread = createThread(1000, 400, 560);
    expect(isChatThreadNearBottom(thread)).toBe(true);
    expect(isChatThreadNearBottom(thread, 32)).toBe(false);
  });

  it('follows the streaming tail instead of pinning the stream rail', () => {
    const thread = createThread(1200, 400, 0);
    const rail = document.createElement('div');
    rail.className = 'agent-stream-rail';
    thread.appendChild(rail);
    const bubble = document.createElement('div');
    bubble.className = 'agent-bubble assistant latex-doc is-streaming';
    thread.appendChild(bubble);

    scrollChatThreadAfterUpdate(thread, { followStreamingTail: true });

    expect(thread.scrollTop).toBe(1200);
  });

  it('respects manual scroll position while streaming', () => {
    const thread = createThread(1200, 400, 120);
    const rail = document.createElement('div');
    rail.className = 'agent-stream-rail';
    thread.appendChild(rail);

    scrollChatThreadAfterUpdate(thread, {
      followStreamingTail: true,
      respectUserScroll: true,
    });

    expect(thread.scrollTop).toBe(120);
  });

  it('forces scroll after a new user turn even when reading history', () => {
    const thread = createThread(1200, 400, 120);
    const rail = document.createElement('div');
    rail.className = 'agent-stream-rail';
    thread.appendChild(rail);

    scrollChatThreadAfterUpdate(thread, {
      followStreamingTail: true,
      respectUserScroll: true,
      force: true,
    });

    expect(thread.scrollTop).toBe(1200);
  });
});
