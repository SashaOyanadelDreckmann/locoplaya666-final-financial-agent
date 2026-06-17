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

import { isTabletDevice, TABLET_LANDSCAPE_MEDIA, shouldUseHomeScrollRoot } from '@/lib/interfaz/viewport-mode';

type HomeScrollContextValue = {
  containerRef: RefObject<HTMLElement | null>;
  /** True once the scroll container ref is wired — triggers child re-renders. */
  ready: boolean;
};

const HomeScrollContext = createContext<HomeScrollContextValue | null>(null);

function isScrollable(el: HTMLElement): boolean {
  if (el.scrollHeight <= el.clientHeight + 1) return false;
  const oy = getComputedStyle(el).overflowY;
  return oy === 'auto' || oy === 'scroll' || oy === 'overlay';
}

function syncHomeScrollRoot(): HTMLElement | null {
  const frame = document.querySelector<HTMLElement>('.mobile-scale-frame');
  // Phones + tablet portrait: document scroll (sticky + Framer offsets). Frame root only on tablet landscape.
  const tabletLandscape =
    isTabletDevice() && window.matchMedia(TABLET_LANDSCAPE_MEDIA).matches;
  const frameScrolls = Boolean(frame && isScrollable(frame));
  const useRoot = Boolean(frame && (tabletLandscape || (frameScrolls && !shouldUseHomeScrollRoot())));

  document.documentElement.classList.toggle('home-scroll-active', useRoot);

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
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const apply = () => {
      const next = syncHomeScrollRoot();
      containerRef.current = next;
      setReady(Boolean(next));
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
    <HomeScrollContext.Provider value={{ containerRef, ready }}>
      {children}
    </HomeScrollContext.Provider>
  );
}

export function useHomeScroll(options: UseScrollOptions = {}) {
  const ctx = useContext(HomeScrollContext);
  const useContainer = Boolean(ctx?.ready && ctx.containerRef);

  return useScroll({
    ...options,
    container: useContainer ? ctx!.containerRef : undefined,
    layoutEffect: useContainer,
  });
}
