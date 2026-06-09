'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { motion } from 'framer-motion';

import {
  PanelCardsMorphIntro,
  type PanelCardNaturalSize,
  type PanelDockTarget,
  type PanelMorphPhase,
} from '@/components/ui/panel-cards-morph-intro';
import { PANEL_INTRO_CARD_ORDER } from './panel-cards-intro.copy';
import {
  computeMobileDeckDockTargets,
  getMobileDeckCardNaturalSize,
} from './panel-cards-intro.mobile-dock';
import type { PanelIntroHandoffOrigin, PanelIntroPhase } from './panel-intro.types';

const SPOTLIGHT_MS = 4000;
const DOCK_MS = 1040;
const SETTLE_MS = 640;
const FADE_OUT_MS = 320;

export type { PanelIntroPhase };

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
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

function measureCardNaturalSizes(
  panelGridRef: React.RefObject<HTMLDivElement | null>,
  isMobileViewport: boolean,
): Record<string, PanelCardNaturalSize> {
  const grid = panelGridRef.current;
  if (!grid) return {};

  const sizes: Record<string, PanelCardNaturalSize> = {};

  PANEL_INTRO_CARD_ORDER.forEach((card) => {
    const slot =
      grid.querySelector<HTMLElement>(`[data-panel-card-key="${card.key}"]`) ??
      grid.querySelector<HTMLElement>(`[data-panel-intro-slot="${card.key}"]`) ??
      grid.querySelector<HTMLElement>(`[data-panel-section="${card.key}"]`);

    if (!slot) return;

    const rect = (slot.closest('.mobile-panel-stack-card') ?? slot).getBoundingClientRect();
    sizes[card.key] = {
      width: Math.max(rect.width, 1),
      height: Math.max(rect.height, 1),
    };
  });

  if (isMobileViewport && Object.keys(sizes).length === 0) {
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
}) {
  const reducedMotion = prefersReducedMotion();
  const [phase, setPhase] = useState<PanelMorphPhase>(reducedMotion ? 'spotlight' : 'scatter');
  const [activeIndex, setActiveIndex] = useState(0);
  const [dockTargets, setDockTargets] = useState<PanelDockTarget[] | null>(null);
  const [naturalSizes, setNaturalSizes] = useState<Record<string, PanelCardNaturalSize>>({});
  const [exiting, setExiting] = useState(false);
  const exitStartedRef = useRef(false);
  const totalCards = PANEL_INTRO_CARD_ORDER.length;

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
    props.onPhaseChange?.('dock');

    const panel = props.panelGridRef.current?.closest('.agent-panel');
    if (panel instanceof HTMLElement) panel.scrollTop = 0;

    const measureDelay = props.isMobileViewport ? 128 : 0;

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.setTimeout(() => {
          refreshMeasurements();
          setDockTargets(measureDockTargets(props.panelGridRef, props.isMobileViewport));
          setPhase('dock');
        }, measureDelay);
      });
    });
  }, [props, refreshMeasurements]);

  const beginSettle = useCallback(() => {
    props.onPhaseChange?.('settle');
    setPhase('settle');
    window.requestAnimationFrame(() => {
      props.onSettled?.();
    });
  }, [props]);

  const finish = useCallback(() => {
    if (exitStartedRef.current) return;
    exitStartedRef.current = true;
    setExiting(true);
    window.setTimeout(() => props.onComplete(), FADE_OUT_MS);
  }, [props]);

  useEffect(() => {
    props.onPhaseChange?.('morph');
  }, [props.onPhaseChange]);

  useEffect(() => {
    document.documentElement.classList.add('panel-intro-active');
    document.body.classList.add('panel-intro-active');

    const panel = props.panelGridRef.current?.closest('.agent-panel');
    if (panel instanceof HTMLElement) {
      panel.scrollTop = 0;
    }

    const measureTimer = window.setTimeout(() => refreshMeasurements(), 64);

    return () => {
      window.clearTimeout(measureTimer);
      document.documentElement.classList.remove('panel-intro-active');
      document.body.classList.remove('panel-intro-active');
    };
  }, [props.panelGridRef, refreshMeasurements]);

  useEffect(() => {
    if (reducedMotion) return;

    const tLine = window.setTimeout(() => setPhase('line'), 240);
    const tCircle = window.setTimeout(() => setPhase('circle'), 920);
    const tSpotlight = window.setTimeout(() => setPhase('spotlight'), 1680);

    return () => {
      window.clearTimeout(tLine);
      window.clearTimeout(tCircle);
      window.clearTimeout(tSpotlight);
    };
  }, [reducedMotion]);

  useEffect(() => {
    if (phase !== 'spotlight') return;

    if (activeIndex >= totalCards - 1) {
      const dockTimer = window.setTimeout(() => beginDock(), SPOTLIGHT_MS);
      return () => window.clearTimeout(dockTimer);
    }

    const timer = window.setTimeout(() => {
      setActiveIndex((index) => Math.min(index + 1, totalCards - 1));
    }, SPOTLIGHT_MS);

    return () => window.clearTimeout(timer);
  }, [phase, activeIndex, totalCards, beginDock]);

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
    const timer = window.setTimeout(() => beginDock(), 520);
    return () => window.clearTimeout(timer);
  }, [reducedMotion, phase, beginDock]);

  return (
    <motion.div
      className={`panel-intro-overlay${exiting ? ' is-exiting' : ''}${
        phase === 'dock' || phase === 'settle' ? ' is-docking' : ''
      }${props.handoffOrigin ? ' has-handoff' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Presentación del panel financiero"
      aria-busy={!exiting}
      initial={{ opacity: props.handoffOrigin ? 1 : 0 }}
      animate={{ opacity: exiting ? 0 : 1 }}
      transition={{ duration: props.handoffOrigin ? 0.12 : 0.42, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="panel-intro-overlay__backdrop" aria-hidden="true" />
      <PanelCardsMorphIntro
        phase={phase}
        activeIndex={activeIndex}
        dockTargets={dockTargets}
        panelCards={orderedPanelCards}
        naturalSizes={naturalSizes}
        handoffOrigin={props.handoffOrigin}
        isMobileViewport={props.isMobileViewport}
        reducedMotion={reducedMotion}
      />
    </motion.div>
  );
}
