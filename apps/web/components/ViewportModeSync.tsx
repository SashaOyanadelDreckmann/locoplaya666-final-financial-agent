'use client';

import { useEffect } from 'react';

import { syncPwaStandaloneClass, syncViewportModeClasses } from '@/lib/viewport-mode';
import { suppressPwaBrowserChrome } from '@/lib/mobile-viewport-sync';

export default function ViewportModeSync() {
  useEffect(() => {
    const sync = () => {
      const root = document.documentElement;
      syncPwaStandaloneClass(root);
      suppressPwaBrowserChrome(root);
      syncViewportModeClasses();
    };

    sync();
    window.addEventListener('resize', sync);
    window.addEventListener('orientationchange', sync);
    window.addEventListener('pageshow', sync);
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', sync);
    window.visualViewport?.addEventListener('resize', sync);

    return () => {
      window.removeEventListener('resize', sync);
      window.removeEventListener('orientationchange', sync);
      window.removeEventListener('pageshow', sync);
      window.removeEventListener('focus', sync);
      document.removeEventListener('visibilitychange', sync);
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
