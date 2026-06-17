'use client';

import { useEffect, useState, type RefObject } from 'react';
import { useMotionValue, type MotionValue } from 'framer-motion';
import { MOBILE_SHELL_MEDIA } from '@/lib/interfaz/viewport-mode';

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export type PinMode = 'before' | 'fixed' | 'after';

export function useNarrowViewport(): boolean {
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_SHELL_MEDIA);
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  return narrow;
}

function resolveScrollRoot(): HTMLElement | Window {
  const frame = document.querySelector<HTMLElement>('.mobile-scale-frame');
  if (!frame) return window;

  const { overflowY } = getComputedStyle(frame);
  const scrollableY =
    overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay';
  if (scrollableY && frame.scrollHeight > frame.clientHeight + 1) {
    return frame;
  }

  return window;
}

function viewportHeight(scroller: HTMLElement | Window): number {
  return scroller === window ? window.innerHeight : (scroller as HTMLElement).clientHeight;
}

/** Progress 0→1 while `target` travels from top to bottom of the scrollport (start→end). */
export function measureSectionScrollProgress(
  target: HTMLElement,
  scroller: HTMLElement | Window = resolveScrollRoot(),
): number {
  const vh = viewportHeight(scroller);
  const scrollable = target.offsetHeight - vh;
  if (scrollable <= 1) return 0;

  if (scroller === window) {
    const top = target.getBoundingClientRect().top + window.scrollY;
    return clamp01((window.scrollY - top) / scrollable);
  }

  const frame = scroller as HTMLElement;
  const frameRect = frame.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  return clamp01(-(targetRect.top - frameRect.top) / scrollable);
}

/**
 * Scroll progress for sticky sections on mobile — listens to the real scroll root
 * (window or .mobile-scale-frame) instead of relying on Framer's container wiring.
 */
export function useSectionScrollProgress(
  targetRef: RefObject<HTMLElement | null>,
  enabled: boolean,
): MotionValue<number> {
  const progress = useMotionValue(0);

  useEffect(() => {
    if (!enabled) return;

    let scroller: HTMLElement | Window = window;
    let raf = 0;

    const measure = () => {
      const target = targetRef.current;
      if (!target) return;
      scroller = resolveScrollRoot();
      progress.set(measureSectionScrollProgress(target, scroller));
    };

    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };

    const attach = () => {
      scroller = resolveScrollRoot();
      scroller.addEventListener('scroll', onScroll, { passive: true });
      measure();
    };

    attach();
    window.addEventListener('resize', onScroll, { passive: true });
    window.addEventListener('orientationchange', onScroll, { passive: true });

    const mo = new MutationObserver(onScroll);
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => {
      cancelAnimationFrame(raf);
      scroller.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('orientationchange', onScroll);
      mo.disconnect();
    };
  }, [enabled, progress, targetRef]);

  return progress;
}

/** Fixed pin fallback when `position: sticky` fails (common on iOS). */
export function usePinnedScrollSection(
  targetRef: RefObject<HTMLElement | null>,
  enabled: boolean,
): PinMode {
  const [mode, setMode] = useState<PinMode>('before');

  useEffect(() => {
    if (!enabled) return;

    let scroller: HTMLElement | Window = window;
    let raf = 0;

    const update = () => {
      const el = targetRef.current;
      if (!el) return;
      scroller = resolveScrollRoot();
      const rect = el.getBoundingClientRect();
      const vh = viewportHeight(scroller);

      if (rect.top > 0) {
        setMode('before');
      } else if (rect.bottom <= vh + 1) {
        setMode('after');
      } else {
        setMode('fixed');
      }
    };

    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };

    scroller = resolveScrollRoot();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    window.addEventListener('orientationchange', onScroll, { passive: true });
    update();

    return () => {
      cancelAnimationFrame(raf);
      scroller.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('orientationchange', onScroll);
    };
  }, [enabled, targetRef]);

  return mode;
}
