'use client';

import { useEffect } from 'react';

import { syncViewportModeClasses } from '@/lib/viewport-mode';

export default function ViewportModeSync() {
  useEffect(() => {
    const sync = () => syncViewportModeClasses();

    sync();
    window.addEventListener('resize', sync);
    window.addEventListener('orientationchange', sync);
    window.visualViewport?.addEventListener('resize', sync);

    return () => {
      window.removeEventListener('resize', sync);
      window.removeEventListener('orientationchange', sync);
      window.visualViewport?.removeEventListener('resize', sync);
      const root = document.documentElement;
      root.classList.remove(
        'is-mobile-viewport',
        'is-desktop-viewport',
        'is-tablet-device',
        'is-tablet-portrait',
        'is-tablet-landscape',
      );
      document.body?.classList.remove(
        'is-mobile-viewport',
        'is-desktop-viewport',
        'is-tablet-device',
        'is-tablet-portrait',
        'is-tablet-landscape',
      );
    };
  }, []);

  return null;
}
