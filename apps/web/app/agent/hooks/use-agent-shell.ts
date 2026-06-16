'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { ApiHttpError } from '@/lib/api/envelope';
import { getSessionInfo, type FincoinUsageApiPayload } from '@/lib/api/cliente';
import type { SessionApiPayload } from '@/lib/tipos/session';
import { syncViewportModeClasses } from '@/lib/interfaz/viewport-mode';
import {
  applyMobileViewportTokens,
  isAgentModalOpen,
  restoreAgentShellViewport,
  shouldRestoreAgentShellViewport,
} from '@/lib/interfaz/mobile-viewport-sync';
import { hasCompletedIntakeAccess, resolveAuthRedirectPath } from '../utilidades/page.utils';

export type AgentSessionInfo = (SessionApiPayload & {
  fincoinUsage?: FincoinUsageApiPayload | null;
}) | null;

export function useAgentShell() {
  const router = useRouter();
  const [sessionInfo, setSessionInfo] = useState<AgentSessionInfo>(null);
  const [authBootstrapped, setAuthBootstrapped] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(() => {
    if (typeof window === 'undefined') return false;
    return syncViewportModeClasses().mobileShell;
  });
  const [isStandaloneDisplayMode, setIsStandaloneDisplayMode] = useState(() => {
    if (typeof window === 'undefined') return false;
    const media = window.matchMedia('(display-mode: standalone)');
    const iosStandalone = Boolean(
      (window.navigator as Navigator & { standalone?: boolean }).standalone
    );
    return media.matches || iosStandalone;
  });

  useEffect(() => {
    let cancelled = false;

    const bootstrapAuth = async () => {
      try {
        const info = await getSessionInfo();
        if (cancelled) return;
        if (!info?.id) {
          setIsAuthenticated(false);
          router.replace('/login');
          return;
        }
        if (!hasCompletedIntakeAccess(info?.injectedIntake)) {
          setIsAuthenticated(false);
          router.replace('/intake');
          return;
        }
        setSessionInfo(info);
        setIsAuthenticated(true);
      } catch (error) {
        if (cancelled) return;
        setIsAuthenticated(false);
        router.replace(resolveAuthRedirectPath(error));
      } finally {
        if (!cancelled) setAuthBootstrapped(true);
      }
    };

    void bootstrapAuth();

    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncViewport = () => {
      const { mobileShell: mobile } = syncViewportModeClasses();
      setIsMobileViewport(mobile);
    };
    syncViewport();
    window.addEventListener('resize', syncViewport);
    window.addEventListener('orientationchange', syncViewport);
    window.visualViewport?.addEventListener('resize', syncViewport);
    return () => {
      window.removeEventListener('resize', syncViewport);
      window.removeEventListener('orientationchange', syncViewport);
      window.visualViewport?.removeEventListener('resize', syncViewport);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(display-mode: standalone)');
    const syncStandalone = () => {
      const iosStandalone = Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
      setIsStandaloneDisplayMode(media.matches || iosStandalone);
    };
    syncStandalone();
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', syncStandalone);
    } else {
      media.addListener(syncStandalone);
    }
    window.addEventListener('focus', syncStandalone);
    document.addEventListener('visibilitychange', syncStandalone);
    return () => {
      if (typeof media.removeEventListener === 'function') {
        media.removeEventListener('change', syncStandalone);
      } else {
        media.removeListener(syncStandalone);
      }
      window.removeEventListener('focus', syncStandalone);
      document.removeEventListener('visibilitychange', syncStandalone);
    };
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const standaloneActive = isMobileViewport && isStandaloneDisplayMode;
    html.classList.toggle('agent-route-standalone', standaloneActive);
    body.classList.toggle('agent-route-standalone', standaloneActive);
    return () => {
      html.classList.remove('agent-route-standalone');
      body.classList.remove('agent-route-standalone');
    };
  }, [isMobileViewport, isStandaloneDisplayMode]);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;

    html.style.overflow = 'hidden';
    html.style.overscrollBehavior = 'none';
    body.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'none';

    const allowsTouchScroll = (el: HTMLElement) => {
      if (el.closest('.agent-modal-overlay, .social-modal-overlay')) return true;
      if (el.closest('.mobile-panel-handle, .agent-panel.is-dragging')) return true;
      if (el.closest('.agent-panel.is-mobile-expanded')) return true;
      if (el.closest('.agent-mobile-composer-dock')) return true;
      if (el.closest('.agent-thread')) return true;
      if (el.closest('.agent-bubble.is-scrollable-bubble, .latex-doc-body.is-scrollable-content')) {
        return true;
      }
      if (
        document.documentElement.classList.contains('is-tablet-landscape') &&
        el.closest('.agent-panel')
      ) {
        return true;
      }
      return false;
    };

    const preventBounce = (e: TouchEvent) => {
      let target = e.target as HTMLElement | null;
      while (target && target !== document.body) {
        if (allowsTouchScroll(target)) return;

        const style = window.getComputedStyle(target);
        const overflowY = style.overflowY;
        const overflowX = style.overflowX;
        if (
          overflowY === 'auto' ||
          overflowY === 'scroll' ||
          overflowY === 'overlay' ||
          overflowX === 'auto' ||
          overflowX === 'scroll' ||
          overflowX === 'overlay'
        ) {
          return;
        }
        target = target.parentElement;
      }
      e.preventDefault();
    };

    const preventGesture = (e: Event) => e.preventDefault();

    document.addEventListener('touchmove', preventBounce, { passive: false });
    document.addEventListener('gesturestart', preventGesture as EventListener, { passive: false });
    document.addEventListener('gesturechange', preventGesture as EventListener, { passive: false });
    document.addEventListener('gestureend', preventGesture as EventListener, { passive: false });

    return () => {
      html.style.overflow = '';
      html.style.overscrollBehavior = '';
      body.style.overflow = '';
      body.style.overscrollBehavior = '';
      document.removeEventListener('touchmove', preventBounce);
      document.removeEventListener('gesturestart', preventGesture);
      document.removeEventListener('gesturechange', preventGesture);
      document.removeEventListener('gestureend', preventGesture);
    };
  }, []);

  useEffect(() => {
    const vv = window.visualViewport;
    const update = () => {
      applyMobileViewportTokens();
    };
    const onVisualViewportScroll = () => {
      if (
        shouldRestoreAgentShellViewport() &&
        !isAgentModalOpen() &&
        (vv?.offsetTop ?? 0) > 0
      ) {
        restoreAgentShellViewport();
        return;
      }
      update();
    };
    const onPageShow = () => restoreAgentShellViewport();
    update();
    restoreAgentShellViewport();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    window.addEventListener('pageshow', onPageShow);
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', onVisualViewportScroll);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      window.removeEventListener('pageshow', onPageShow);
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', onVisualViewportScroll);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let modalWasOpen = isAgentModalOpen();
    let raf = 0;

    const syncAfterModal = () => {
      if (isAgentModalOpen()) {
        modalWasOpen = true;
        return;
      }
      if (modalWasOpen) {
        modalWasOpen = false;
        restoreAgentShellViewport();
      }
    };

    const scheduleSync = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(syncAfterModal);
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') restoreAgentShellViewport();
    };

    document.addEventListener('visibilitychange', onVisible);
    const observer = new MutationObserver(scheduleSync);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisible);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!authBootstrapped || !isAuthenticated) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let inFlight = false;

    const schedule = (ms: number) => {
      if (!alive) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void tick();
      }, ms);
    };

    const tick = async () => {
      if (!alive) return;
      if (document.visibilityState !== 'visible') {
        schedule(60000);
        return;
      }
      if (inFlight) {
        schedule(20000);
        return;
      }
      inFlight = true;
      try {
        const info = await getSessionInfo();
        if (alive) setSessionInfo(info);
      } catch (error) {
        if (error instanceof ApiHttpError && error.status === 401 && alive) {
          setIsAuthenticated(false);
          router.replace('/login');
          return;
        }
      } finally {
        inFlight = false;
        schedule(20000);
      }
    };

    void tick();

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [authBootstrapped, isAuthenticated, router]);

  return {
    sessionInfo,
    setSessionInfo,
    authBootstrapped,
    isAuthenticated,
    setIsAuthenticated,
    isMobileViewport,
    isStandaloneDisplayMode,
  };
}
