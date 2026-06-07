'use client';

import { useEffect } from 'react';

import { MOBILE_SHELL_MEDIA, isTabletPortraitBrowser } from '@/lib/viewport-mode';

/** Max inset attributed to browser chrome — not the on-screen keyboard. */
const MAX_CHROME_BOTTOM = 72;
const MAX_CHROME_TOP = 88;

function isTextInput(el: Element | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

function syncBrowserChromeInsets() {
  const html = document.documentElement;
  const vv = window.visualViewport;
  if (!vv) return;

  const layoutH = window.innerHeight;
  const gap = Math.max(0, layoutH - vv.height - vv.offsetTop);
  const focusedInput = isTextInput(document.activeElement);
  const keyboardLikelyOpen =
    focusedInput && (gap > MAX_CHROME_BOTTOM || vv.height < layoutH * 0.78);

  const isMobileBrowser =
    !html.classList.contains('pwa-standalone') &&
    window.matchMedia(MOBILE_SHELL_MEDIA).matches;

  const tabletPortraitBrowser = isTabletPortraitBrowser();
  html.classList.toggle('browser-chrome-vignette-tablet-off', tabletPortraitBrowser);

  if (tabletPortraitBrowser) {
    html.classList.add('browser-chrome-vignette-suspended');
    html.style.setProperty('--browser-vv-offset-top', '0px');
    html.style.setProperty('--browser-vv-offset-bottom', '0px');
    html.style.setProperty('--visual-vh', `${vv.height}px`);
    return;
  }

  if (keyboardLikelyOpen) {
    html.classList.add('browser-chrome-vignette-suspended');
    html.classList.add('browser-keyboard-open');
    html.style.setProperty('--browser-vv-offset-top', '0px');
    html.style.setProperty('--browser-vv-offset-bottom', '0px');
    return;
  }

  html.classList.remove('browser-chrome-vignette-suspended');
  html.classList.remove('browser-keyboard-open');

  if (isMobileBrowser) {
    html.style.setProperty('--visual-vh', `${vv.height}px`);
  }

  const topInset = Math.min(Math.max(0, vv.offsetTop), MAX_CHROME_TOP);
  const bottomInset = Math.min(gap, MAX_CHROME_BOTTOM);

  html.style.setProperty('--browser-vv-offset-top', `${topInset}px`);
  html.style.setProperty('--browser-vv-offset-bottom', `${bottomInset}px`);
}

export default function BrowserChromeVignetteSync() {
  useEffect(() => {
    let focusOutTimer: ReturnType<typeof setTimeout> | null = null;

    const onFocusIn = () => {
      if (focusOutTimer) clearTimeout(focusOutTimer);
      syncBrowserChromeInsets();
    };

    const onFocusOut = () => {
      focusOutTimer = setTimeout(syncBrowserChromeInsets, 120);
    };

    syncBrowserChromeInsets();

    const vv = window.visualViewport;
    vv?.addEventListener('resize', syncBrowserChromeInsets);
    vv?.addEventListener('scroll', syncBrowserChromeInsets);
    window.addEventListener('resize', syncBrowserChromeInsets);
    window.addEventListener('scroll', syncBrowserChromeInsets, { passive: true });
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);

    return () => {
      if (focusOutTimer) clearTimeout(focusOutTimer);
      const html = document.documentElement;
      html.classList.remove('browser-chrome-vignette-suspended');
      html.classList.remove('browser-chrome-vignette-tablet-off');
      html.classList.remove('browser-keyboard-open');
      html.style.removeProperty('--browser-vv-offset-top');
      html.style.removeProperty('--browser-vv-offset-bottom');
      if (!html.classList.contains('pwa-standalone')) {
        html.style.removeProperty('--visual-vh');
      }
      vv?.removeEventListener('resize', syncBrowserChromeInsets);
      vv?.removeEventListener('scroll', syncBrowserChromeInsets);
      window.removeEventListener('resize', syncBrowserChromeInsets);
      window.removeEventListener('scroll', syncBrowserChromeInsets);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, []);

  return null;
}
