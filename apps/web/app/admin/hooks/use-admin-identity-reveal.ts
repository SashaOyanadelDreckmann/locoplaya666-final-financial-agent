import { useCallback, useEffect, useRef, useState } from 'react';

const TRIPLE_CLICK_WINDOW_MS = 600;
const REVEAL_DURATION_MS = 10_000;

export function useAdminIdentityReveal(resetKey?: string) {
  const [revealed, setRevealed] = useState(false);
  const clickCountRef = useRef(0);
  const clickWindowRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearRevealTimeout = useCallback(() => {
    if (revealTimeoutRef.current) {
      clearTimeout(revealTimeoutRef.current);
      revealTimeoutRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    clearRevealTimeout();
    setRevealed(false);
    clickCountRef.current = 0;
    if (clickWindowRef.current) {
      clearTimeout(clickWindowRef.current);
      clickWindowRef.current = null;
    }
  }, [clearRevealTimeout]);

  const onIdentityTargetClick = useCallback(() => {
    clickCountRef.current += 1;
    if (clickWindowRef.current) clearTimeout(clickWindowRef.current);
    clickWindowRef.current = setTimeout(() => {
      clickCountRef.current = 0;
      clickWindowRef.current = null;
    }, TRIPLE_CLICK_WINDOW_MS);

    if (clickCountRef.current < 3) return;

    clickCountRef.current = 0;
    if (clickWindowRef.current) {
      clearTimeout(clickWindowRef.current);
      clickWindowRef.current = null;
    }

    setRevealed(true);
    clearRevealTimeout();
    revealTimeoutRef.current = setTimeout(() => {
      setRevealed(false);
      revealTimeoutRef.current = null;
    }, REVEAL_DURATION_MS);
  }, [clearRevealTimeout]);

  useEffect(() => {
    reset();
  }, [resetKey, reset]);

  useEffect(
    () => () => {
      if (clickWindowRef.current) clearTimeout(clickWindowRef.current);
      clearRevealTimeout();
    },
    [clearRevealTimeout],
  );

  return { revealed, onIdentityTargetClick };
}
