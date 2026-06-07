'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { ApiHttpError } from '@/lib/apiEnvelope';
import { getSessionInfo } from '@/lib/api';
import { syncViewportModeClasses } from '@/lib/viewport-mode';
import { hasCompletedIntakeAccess, resolveAuthRedirectPath } from '../page.utils';

export type AgentSessionInfo = {
  id?: string;
  injectedIntake?: {
    intake?: Record<string, unknown>;
    intakeContext?: string;
    [key: string]: unknown;
  } | null;
  injectedProfile?: unknown;
  productLifecycle?: {
    phase?: string;
    unlockedChats?: string[];
    closedChats?: string[];
    chatTurns?: Record<string, number>;
    actionPlanFunnelStage?: 'brainstorm' | 'converge' | 'deliver' | null;
    closingMode?: boolean;
  } | null;
  knowledgeScore?: number;
  name?: string;
  userId?: string;
  email?: string;
  latestDiagnosticCompletedAt?: string | null;
} | null;

export function useAgentShell() {
  const router = useRouter();
  const [sessionInfo, setSessionInfo] = useState<AgentSessionInfo>(null);
  const [authBootstrapped, setAuthBootstrapped] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [isStandaloneDisplayMode, setIsStandaloneDisplayMode] = useState(false);

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
    html.classList.add('agent-route-active');
    body.classList.add('agent-route-active');

    html.style.overflow = 'hidden';
    html.style.overscrollBehavior = 'none';
    body.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'none';

    const preventBounce = (e: TouchEvent) => {
      let target = e.target as HTMLElement | null;
      while (target && target !== document.body) {
        if (
          target.classList.contains('mobile-panel-handle') ||
          target.closest('.mobile-panel-handle') ||
          target.closest('.agent-panel.is-dragging')
        ) {
          return;
        }

        const expandedPanel = target.closest('.agent-panel.is-mobile-expanded');
        if (expandedPanel) {
          return;
        }

        if (target.closest('.agent-panel.is-mobile-compact')) {
          return;
        }

        if (
          document.documentElement.classList.contains('is-tablet-landscape') &&
          target.closest('.agent-panel')
        ) {
          return;
        }

        const style = window.getComputedStyle(target);
        const overflowY = style.overflowY;
        const overflowX = style.overflowX;
        if (
          overflowY === 'auto' ||
          overflowY === 'scroll' ||
          overflowX === 'auto' ||
          overflowX === 'scroll'
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
      html.classList.remove('agent-route-active');
      body.classList.remove('agent-route-active');
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
      const vv = window.visualViewport;
      const layoutH = window.innerHeight;
      const visibleH = vv?.height ?? layoutH;
      /* Always track visible height — required when the on-screen keyboard opens. */
      document.documentElement.style.setProperty('--visual-vh', `${visibleH}px`);

      if (document.documentElement.classList.contains('keyboard-opening')) {
        return;
      }
      const visualStackH = Math.max(
        layoutH,
        document.documentElement.clientHeight,
        Math.round(visibleH + (vv?.offsetTop ?? 0)),
      );
      document.documentElement.style.setProperty('--screen-h', `${visualStackH}px`);
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      document.documentElement.style.removeProperty('--screen-h');
      document.documentElement.style.removeProperty('--visual-vh');
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
