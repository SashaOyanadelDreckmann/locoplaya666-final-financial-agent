'use client';

import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type RefObject,
} from 'react';
import { useScroll, type UseScrollOptions } from 'framer-motion';

import { shouldUseHomeScrollRoot } from '@/lib/viewport-mode';

type ContainerRef = RefObject<HTMLElement | null>;

const HomeScrollContext = createContext<ContainerRef | null>(null);

/** Touch home (phone + iPad): scroll on .mobile-scale-frame — wire Framer to it. */
export function HomeScrollRoot({ children }: { children: React.ReactNode }) {
  const [scrollRoot, setScrollRoot] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const apply = () => {
      const frame = document.querySelector<HTMLElement>('.mobile-scale-frame');
      if (shouldUseHomeScrollRoot() && frame) {
        frame.classList.add('home-scroll-root');
        setScrollRoot(frame);
        return;
      }
      frame?.classList.remove('home-scroll-root');
      setScrollRoot(null);
    };

    apply();
    window.addEventListener('resize', apply);
    window.addEventListener('orientationchange', apply);
    return () => {
      window.removeEventListener('resize', apply);
      window.removeEventListener('orientationchange', apply);
      document.querySelector('.mobile-scale-frame')?.classList.remove('home-scroll-root');
    };
  }, []);

  const containerRef = useMemo<ContainerRef>(
    () => ({ current: scrollRoot }),
    [scrollRoot],
  );

  return (
    <HomeScrollContext.Provider value={containerRef}>
      {children}
    </HomeScrollContext.Provider>
  );
}

export function useHomeScroll(options: UseScrollOptions = {}) {
  const containerRef = useContext(HomeScrollContext);
  const hasContainer = Boolean(containerRef?.current);

  return useScroll({
    ...options,
    container: hasContainer ? containerRef ?? undefined : undefined,
    layoutEffect: false,
  });
}
