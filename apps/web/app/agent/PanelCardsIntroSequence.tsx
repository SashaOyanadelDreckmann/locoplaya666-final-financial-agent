'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { motion } from 'framer-motion';

import {
  PanelCardsMorphIntro,
  type PanelCardNaturalSize,
  type PanelDockTarget,
  type PanelMorphPhase,
} from '@/components/ui/panel-cards-morph-intro';
import {
  PANEL_INTRO_CARD_ORDER,
  PANEL_INTRO_CARD_SIZE_FALLBACKS,
} from './panel-cards-intro.copy';
import {
  computeMobileDeckDockTargets,
  getMobileDeckCardNaturalSize,
} from './panel-cards-intro.mobile-dock';
import { markPanelIntroCompleted } from './panel-intro.prefs';
import type { PanelIntroHandoffOrigin, PanelIntroPhase } from './panel-intro.types';

const ENTER_MS = 360;
const DOCK_MS = 820;
const SETTLE_MS = 480;
const FADE_OUT_MS = 320;

export type { PanelIntroPhase };

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function spotlightDurationForIndex(index: number, isMobile: boolean, total: number): number {
  const isLast = index >= total - 1;
  if (isLast) return isMobile ? 2200 : 2600;
  if (isMobile) {
    if (index <= 2) return 1600;
    if (index <= 5) return 1300;
    return 1100;
  }
  if (index <= 2) return 2000;
  if (index <= 5) return 1700;
  return 1400;
}

function measureGridDockTargets(
  panelGridRef: React.RefObject<HTMLDivElement | null>,
): PanelDockTarget[] {
  const grid = panelGridRef.current;
  if (!grid) return [];

  return PANEL_INTRO_CARD_ORDER.map((card) => {
    const slot =
      grid.querySelector<HTMLElement>(`[data-panel-intro-slot="${card.key}"]`) ??
      grid.querySelector<HTMLElement>(`[data-panel-section="${card.key}"]`) ??
      grid.querySelector<HTMLElement>(`[data-panel-card-key="${card.key}"]`);

    if (!slot) return { x: 0, y: 0, width: 120, height: 72 };

    const rect = slot.getBoundingClientRect();
    return {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
    };
  });
}

function readMeasuredCardSize(node: HTMLElement | null): PanelCardNaturalSize | null {
  if (!node) return null;

  const width = Math.max(node.offsetWidth, node.getBoundingClientRect().width);
  const height = Math.max(node.offsetHeight, node.getBoundingClientRect().height);
  if (width < 24 || height < 24) return null;

  return { width, height };
}

function measureCardNaturalSizes(
  panelGridRef: React.RefObject<HTMLDivElement | null>,
  isMobileViewport: boolean,
): Record<string, PanelCardNaturalSize> {
  const grid = panelGridRef.current;
  const sizes: Record<string, PanelCardNaturalSize> = {};

  PANEL_INTRO_CARD_ORDER.forEach((card) => {
    const fallback = PANEL_INTRO_CARD_SIZE_FALLBACKS[card.key];
    if (!grid) {
      if (fallback) sizes[card.key] = fallback;
      return;
    }

    const slot =
      grid.querySelector<HTMLElement>(`[data-panel-card-key="${card.key}"]`) ??
      grid.querySelector<HTMLElement>(`[data-panel-intro-slot="${card.key}"]`) ??
      grid.querySelector<HTMLElement>(`[data-panel-section="${card.key}"]`);

    const leaf =
      slot?.querySelector<HTMLElement>(
        '.profile-card, .panel-card, .panel-feature-card, .interview-flow-card, .recent-library-card, .news-card, article.panel-card',
      ) ?? slot;

    const measured = readMeasuredCardSize((leaf?.closest('.mobile-panel-stack-card') ?? leaf) as HTMLElement | null);
    sizes[card.key] = measured ?? fallback ?? { width: 168, height: 88 };
  });

  if (isMobileViewport && Object.values(sizes).every((size) => size.width < 48)) {
    const mobileSize = getMobileDeckCardNaturalSize();
    PANEL_INTRO_CARD_ORDER.forEach((card) => {
      sizes[card.key] = mobileSize;
    });
  }

  return sizes;
}

function measureDockTargets(
  panelGridRef: React.RefObject<HTMLDivElement | null>,
  isMobileViewport: boolean,
): PanelDockTarget[] {
  if (isMobileViewport) {
    return computeMobileDeckDockTargets(panelGridRef.current);
  }
  return measureGridDockTargets(panelGridRef);
}

export function PanelCardsIntroSequence(props: {
  panelGridRef: React.RefObject<HTMLDivElement | null>;
  panelCards: Array<{ key: string; node: ReactElement }>;
  isMobileViewport: boolean;
  handoffOrigin?: PanelIntroHandoffOrigin | null;
  onPhaseChange?: (phase: PanelIntroPhase) => void;
  onSettled?: () => void;
  onComplete: () => void;
  onPanelReveal?: () => void;
  onHaptic?: (ms?: number) => void;
}) {
  const reducedMotion = prefersReducedMotion();
  const [phase, setPhase] = useState<PanelMorphPhase>(reducedMotion ? 'spotlight' : 'enter');
  const [activeIndex, setActiveIndex] = useState(0);
  const [dockTargets, setDockTargets] = useState<PanelDockTarget[] | null>(null);
  const [naturalSizes, setNaturalSizes] = useState<Record<string, PanelCardNaturalSize>>({});
  const [exiting, setExiting] = useState(false);
  const exitStartedRef = useRef(false);
  const dockStartedRef = useRef(false);
  const skipStartedRef = useRef(false);
  const propsRef = useRef(props);
  propsRef.current = props;
  const totalCards = PANEL_INTRO_CARD_ORDER.length;
  const spotlightDurationMs = spotlightDurationForIndex(activeIndex, props.isMobileViewport, totalCards);

  const orderedPanelCards = useMemo(
    () =>
      PANEL_INTRO_CARD_ORDER.map((meta) => {
        const card = props.panelCards.find((item) => item.key === meta.key);
        return card ? { key: card.key, node: card.node } : null;
      }).filter(Boolean) as Array<{ key: string; node: ReactElement }>,
    [props.panelCards],
  );

  const refreshMeasurements = useCallback(() => {
    setNaturalSizes(measureCardNaturalSizes(props.panelGridRef, props.isMobileViewport));
  }, [props.panelGridRef, props.isMobileViewport]);

  const beginDock = useCallback(() => {
    if (dockStartedRef.current) return;
    dockStartedRef.current = true;

    propsRef.current.onPhaseChange?.('dock');

    const panel = propsRef.current.panelGridRef.current?.closest('.agent-panel');
    if (panel instanceof HTMLElement) panel.scrollTop = 0;

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        setNaturalSizes(
          measureCardNaturalSizes(propsRef.current.panelGridRef, propsRef.current.isMobileViewport),
        );
        setDockTargets(
          measureDockTargets(propsRef.current.panelGridRef, propsRef.current.isMobileViewport),
        );
        setPhase('dock');
      });
    });
  }, []);

  const beginSettle = useCallback(() => {
    propsRef.current.onPhaseChange?.('settle');
    setPhase('settle');
    window.requestAnimationFrame(() => {
      propsRef.current.onSettled?.();
      propsRef.current.onPanelReveal?.();
    });
  }, []);

  const finish = useCallback(() => {
    if (exitStartedRef.current) return;
    exitStartedRef.current = true;
    markPanelIntroCompleted();
    setExiting(true);
    window.setTimeout(() => propsRef.current.onComplete(), FADE_OUT_MS);
  }, []);

  const skipToPanel = useCallback(() => {
    if (skipStartedRef.current || exitStartedRef.current || dockStartedRef.current) return;
    skipStartedRef.current = true;
    propsRef.current.onHaptic?.(8);
    beginDock();
  }, [beginDock]);

  useEffect(() => {
    propsRef.current.onPhaseChange?.('morph');
  }, []);

  useEffect(() => {
    document.documentElement.classList.add('panel-intro-active');
    document.body.classList.add('panel-intro-active');

    const panel = props.panelGridRef.current?.closest('.agent-panel');
    if (panel instanceof HTMLElement) {
      panel.scrollTop = 0;
    }

    const measureTimer = window.setTimeout(() => refreshMeasurements(), 48);
    const remeasureTimer = window.setTimeout(() => refreshMeasurements(), 220);

    return () => {
      window.clearTimeout(measureTimer);
      window.clearTimeout(remeasureTimer);
      document.documentElement.classList.remove('panel-intro-active');
      document.body.classList.remove('panel-intro-active');
    };
  }, [props.panelGridRef, refreshMeasurements]);

  useEffect(() => {
    if (reducedMotion) return;
    const timer = window.setTimeout(() => {
      setPhase('spotlight');
      propsRef.current.onHaptic?.(6);
    }, ENTER_MS);
    return () => window.clearTimeout(timer);
  }, [reducedMotion]);

  /* Auto-play spotlight: timer only resets when activeIndex changes, not on parent re-renders */
  useEffect(() => {
    if (phase !== 'spotlight' || exiting) return;

    const duration = spotlightDurationForIndex(activeIndex, props.isMobileViewport, totalCards);
    const timer = window.setTimeout(() => {
      if (activeIndex >= totalCards - 1) {
        beginDock();
        return;
      }
      setActiveIndex((index) => Math.min(index + 1, totalCards - 1));
      propsRef.current.onHaptic?.(5);
    }, duration);

    return () => window.clearTimeout(timer);
  }, [phase, activeIndex, exiting, props.isMobileViewport, totalCards, beginDock]);

  useEffect(() => {
    if (phase !== 'dock') return;
    const settleTimer = window.setTimeout(() => beginSettle(), DOCK_MS);
    return () => window.clearTimeout(settleTimer);
  }, [phase, beginSettle]);

  useEffect(() => {
    if (phase !== 'settle') return;
    const timer = window.setTimeout(() => finish(), SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [phase, finish]);

  useEffect(() => {
    if (!reducedMotion || phase !== 'spotlight') return;
    const timer = window.setTimeout(() => beginDock(), 280);
    return () => window.clearTimeout(timer);
  }, [reducedMotion, phase, beginDock]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (exiting) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        skipToPanel();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [exiting, skipToPanel]);

  return (
    <motion.div
      className={`panel-intro-overlay${exiting ? ' is-exiting' : ''}${
        phase === 'dock' || phase === 'settle' ? ' is-docking' : ''
      }${phase === 'spotlight' || phase === 'enter' ? ' is-spotlight-stage' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Presentación del panel financiero"
      aria-busy={!exiting}
      initial={{ opacity: 0 }}
      animate={{ opacity: exiting ? 0 : 1 }}
      transition={{ duration: 0.36, ease: EASE }}
    >
      <div className="panel-intro-overlay__backdrop" aria-hidden="true" />

      <button
        type="button"
        className="panel-intro-skip"
        onClick={skipToPanel}
        aria-label="Entrar al panel sin ver la presentación completa"
      >
        <span className="panel-intro-skip__label">Entrar al panel</span>
        {!props.isMobileViewport ? (
          <span className="panel-intro-skip__hint">Esc</span>
        ) : null}
      </button>

      <PanelCardsMorphIntro
        phase={phase}
        activeIndex={activeIndex}
        dockTargets={dockTargets}
        panelCards={orderedPanelCards}
        naturalSizes={naturalSizes}
        handoffOrigin={props.handoffOrigin}
        isMobileViewport={props.isMobileViewport}
        panelGridRef={props.panelGridRef}
        reducedMotion={reducedMotion}
        spotlightDurationMs={spotlightDurationMs}
        autoPlay
      />
    </motion.div>
  );
}
