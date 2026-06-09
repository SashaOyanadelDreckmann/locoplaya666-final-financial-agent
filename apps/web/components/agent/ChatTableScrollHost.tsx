'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  buildChatTableScrollHint,
  buildChatTableScrollHostClassName,
  readChatTableScrollState,
  type ChatTableScrollState,
} from './chat-table-scroll.helpers';

const EMPTY_SCROLL_STATE: ChatTableScrollState = {
  canScrollX: false,
  canScrollY: false,
  atStartX: true,
  atEndX: true,
  atStartY: true,
  atEndY: true,
};

const HINT_AUTO_DISMISS_MS = 5200;

type ChatTableScrollHostProps = {
  wrapClassName: string;
  children: ReactNode;
};

export function ChatTableScrollHost({ wrapClassName, children }: ChatTableScrollHostProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [scrollState, setScrollState] = useState<ChatTableScrollState>(EMPTY_SCROLL_STATE);
  const [hintVisible, setHintVisible] = useState(false);
  const [hintDismissed, setHintDismissed] = useState(false);
  const dismissTimerRef = useRef<number | null>(null);

  const clearDismissTimer = useCallback(() => {
    if (dismissTimerRef.current !== null) {
      window.clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }, []);

  const dismissHint = useCallback(() => {
    clearDismissTimer();
    setHintVisible(false);
    setHintDismissed(true);
  }, [clearDismissTimer]);

  const syncScrollState = useCallback(() => {
    const host = hostRef.current;
    if (!host) return;

    const next = readChatTableScrollState(host);
    setScrollState(next);

    const hintText = buildChatTableScrollHint(next);
    if (!hintText) {
      dismissHint();
      return;
    }

    if (!hintDismissed) {
      setHintVisible(true);
      clearDismissTimer();
      dismissTimerRef.current = window.setTimeout(() => {
        dismissHint();
      }, HINT_AUTO_DISMISS_MS);
    }
  }, [clearDismissTimer, dismissHint, hintDismissed]);

  useLayoutEffect(() => {
    syncScrollState();
  }, [syncScrollState, children]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const onScroll = () => {
      const next = readChatTableScrollState(host);
      setScrollState(next);
      if ((next.canScrollX || next.canScrollY) && !hintDismissed) {
        dismissHint();
      }
    };

    host.addEventListener('scroll', onScroll, { passive: true });

    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => syncScrollState()) : null;
    resizeObserver?.observe(host);
    if (host.firstElementChild instanceof HTMLElement) {
      resizeObserver?.observe(host.firstElementChild);
    }

    return () => {
      host.removeEventListener('scroll', onScroll);
      resizeObserver?.disconnect();
      clearDismissTimer();
    };
  }, [clearDismissTimer, dismissHint, hintDismissed, syncScrollState]);

  const hintText = buildChatTableScrollHint(scrollState);
  const hostClassName = buildChatTableScrollHostClassName(
    wrapClassName,
    scrollState,
    hintVisible && Boolean(hintText),
    hintDismissed,
  );

  return (
    <div ref={hostRef} className={hostClassName}>
      {children}
      {hintText ? (
        <span className="chat-table-scroll-hint" role="status" aria-live="polite">
          <span className="chat-table-scroll-hint__glyph" aria-hidden="true">
            {scrollState.canScrollX && scrollState.canScrollY ? (
              <>
                <span className="chat-table-scroll-hint__arrow chat-table-scroll-hint__arrow--x" />
                <span className="chat-table-scroll-hint__arrow chat-table-scroll-hint__arrow--y" />
              </>
            ) : scrollState.canScrollX ? (
              <span className="chat-table-scroll-hint__arrow chat-table-scroll-hint__arrow--x" />
            ) : (
              <span className="chat-table-scroll-hint__arrow chat-table-scroll-hint__arrow--y" />
            )}
          </span>
          <span className="chat-table-scroll-hint__text">{hintText}</span>
        </span>
      ) : null}
    </div>
  );
}
