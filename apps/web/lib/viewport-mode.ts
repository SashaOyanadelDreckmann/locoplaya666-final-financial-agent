/**
 * Viewport mode — phone + iPad/tablet portrait → mobile shell; tablet landscape → desktop.
 */

export const TABLET_PORTRAIT_MEDIA =
  '(min-width: 768px) and (max-width: 1366px) and (orientation: portrait)';

export const MOBILE_SHELL_MEDIA = `(max-width: 767px), ${TABLET_PORTRAIT_MEDIA}`;

export const TABLET_LANDSCAPE_MEDIA =
  '(min-width: 768px) and (max-width: 1366px) and (orientation: landscape)';

function isCoarsePointer(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(pointer: coarse)').matches;
}

export function isTabletDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const minSide = Math.min(w, h);
  const maxSide = Math.max(w, h);
  const touch = navigator.maxTouchPoints > 1;
  return (isCoarsePointer() || touch) && minSide >= 600 && maxSide <= 1400;
}

export function isPortraitOrientation(): boolean {
  if (typeof window === 'undefined') return true;
  return window.innerHeight >= window.innerWidth;
}

/** Phone always mobile; tablet portrait → mobile; tablet landscape → desktop. */
export function shouldUseMobileShell(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window.innerWidth;
  if (w <= 767) return true;
  if (isTabletDevice() && isPortraitOrientation() && w <= 1366) return true;
  return false;
}

export function isTabletPortraitBrowser(): boolean {
  if (typeof window === 'undefined') return false;
  if (document.documentElement.classList.contains('pwa-standalone')) return false;
  return isTabletDevice() && isPortraitOrientation();
}

/** Home canvas scroll container — phone, iPad portrait, iPad landscape (browser). */
export function shouldUseHomeScrollRoot(): boolean {
  if (typeof window === 'undefined') return false;
  if (document.documentElement.classList.contains('pwa-standalone')) return false;
  if (window.matchMedia(MOBILE_SHELL_MEDIA).matches) return true;
  return isTabletDevice() && window.matchMedia(TABLET_LANDSCAPE_MEDIA).matches;
}

export function syncViewportModeClasses(root: HTMLElement = document.documentElement): {
  mobileShell: boolean;
  tablet: boolean;
  portrait: boolean;
} {
  const body = document.body;
  const mobileShell = shouldUseMobileShell();
  const tablet = isTabletDevice();
  const portrait = isPortraitOrientation();

  root.classList.toggle('is-mobile-viewport', mobileShell);
  root.classList.toggle('is-desktop-viewport', !mobileShell);
  root.classList.toggle('is-tablet-device', tablet);
  root.classList.toggle('is-tablet-portrait', tablet && portrait);
  root.classList.toggle('is-tablet-landscape', tablet && !portrait);

  body?.classList.toggle('is-mobile-viewport', mobileShell);
  body?.classList.toggle('is-desktop-viewport', !mobileShell);
  body?.classList.toggle('is-tablet-device', tablet);
  body?.classList.toggle('is-tablet-portrait', tablet && portrait);
  body?.classList.toggle('is-tablet-landscape', tablet && !portrait);

  return { mobileShell, tablet, portrait };
}
