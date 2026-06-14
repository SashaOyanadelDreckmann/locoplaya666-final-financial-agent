'use client';

import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { useScroll, type UseScrollOptions } from 'framer-motion';

import { shouldUseHomeScrollRoot } from '@/lib/interfaz/viewport-mode';

const HomeScrollContext = createContext<RefObject<HTMLElement | null> | null>(null);

function isScrollable(el: HTMLElement): boolean {
  if (el.scrollHeight <= el.clientHeight + 1) return false;
  const oy = getComputedStyle(el).overflowY;
  return oy === 'auto' || oy === 'scroll' || oy === 'overlay';
}

function syncHomeScrollRoot(): HTMLElement | null {
  const frame = document.querySelector<HTMLElement>('.mobile-scale-frame');
  const mobileShell = shouldUseHomeScrollRoot();
  const frameScrolls = Boolean(frame && isScrollable(frame));
  const useRoot = Boolean(frame && (mobileShell || frameScrolls));

  document.documentElement.classList.toggle('home-scroll-active', mobileShell);

  if (useRoot && frame) {
    frame.classList.add('home-scroll-root');
    return frame;
  }

  frame?.classList.remove('home-scroll-root');
  return null;
}

/** Home scroll container — phone, iPad, and any viewport where .mobile-scale-frame scrolls. */
export function HomeScrollRoot({ children }: { children: React.ReactNode }) {
  const containerRef = useRef<HTMLElement | null>(null);
  const [scrollKey, setScrollKey] = useState(0);

  useLayoutEffect(() => {
    const apply = () => {
      const next = syncHomeScrollRoot();
      if (containerRef.current !== next) {
        containerRef.current = next;
        setScrollKey((k) => k + 1);
      }
    };

    apply();
    window.addEventListener('resize', apply);
    window.addEventListener('orientationchange', apply);
    window.addEventListener('pageshow', apply);
    document.addEventListener('visibilitychange', apply);
    const mo = new MutationObserver(apply);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => {
      mo.disconnect();
      window.removeEventListener('resize', apply);
      window.removeEventListener('orientationchange', apply);
      window.removeEventListener('pageshow', apply);
      document.removeEventListener('visibilitychange', apply);
      document.documentElement.classList.remove('home-scroll-active');
      containerRef.current = null;
      document.querySelector('.mobile-scale-frame')?.classList.remove('home-scroll-root');
    };
  }, []);

  return (
    <HomeScrollContext.Provider value={containerRef}>
      <div key={scrollKey} style={{ display: 'contents' }}>
        {children}
      </div>
    </HomeScrollContext.Provider>
  );
}

export function useHomeScroll(options: UseScrollOptions = {}) {
  const containerRef = useContext(HomeScrollContext);
  const usesContainer = Boolean(containerRef?.current);

  return useScroll({
    ...options,
    container: usesContainer ? containerRef ?? undefined : undefined,
    layoutEffect: usesContainer,
  });
}
