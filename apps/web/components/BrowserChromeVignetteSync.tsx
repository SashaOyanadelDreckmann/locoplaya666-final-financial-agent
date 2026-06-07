'use client';

import { useEffect } from 'react';

import { isTabletPortraitBrowser } from '@/lib/viewport-mode';
import {
  applyMobileViewportTokens,
  clearMobileViewportTokens,
  isPwaStandaloneViewport,
  suppressPwaBrowserChrome,
} from '@/lib/mobile-viewport-sync';

export default function BrowserChromeVignetteSync() {
  useEffect(() => {
    let focusOutTimer: ReturnType<typeof setTimeout> | null = null;

    const sync = () => {
      const html = document.documentElement;

      if (isPwaStandaloneViewport(html)) {
        suppressPwaBrowserChrome(html);
        applyMobileViewportTokens(html);
        return;
      }

      const tabletPortraitBrowser = isTabletPortraitBrowser();
      html.classList.toggle('browser-chrome-vignette-tablet-off', tabletPortraitBrowser);
      applyMobileViewportTokens(html);
    };

    const onFocusIn = () => {
      if (focusOutTimer) clearTimeout(focusOutTimer);
      sync();
    };

    const onFocusOut = () => {
      focusOutTimer = setTimeout(sync, 140);
    };

    sync();

    const vv = window.visualViewport;
    vv?.addEventListener('resize', sync);
    vv?.addEventListener('scroll', sync);
    window.addEventListener('resize', sync);
    window.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('pageshow', sync);
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', sync);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);

    return () => {
      if (focusOutTimer) clearTimeout(focusOutTimer);
      const html = document.documentElement;
      html.classList.remove('browser-chrome-vignette-tablet-off');
      clearMobileViewportTokens(html);
      vv?.removeEventListener('resize', sync);
      vv?.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
      window.removeEventListener('scroll', sync);
      window.removeEventListener('pageshow', sync);
      window.removeEventListener('focus', sync);
      document.removeEventListener('visibilitychange', sync);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, []);

  return null;
}
