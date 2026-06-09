'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

import {
  PanelCardsMorphIntro,
  type PanelDockTarget,
  type PanelMorphPhase,
} from '@/components/ui/panel-cards-morph-intro';
import { PANEL_INTRO_CARD_ORDER } from './panel-cards-intro.copy';
import { computeMobileDeckDockTargets } from './panel-cards-intro.mobile-dock';

const SPOTLIGHT_MS = 1500;
const DOCK_MS = 1300;
const FADE_OUT_MS = 520;

export type PanelIntroPhase = 'morph' | 'dock';

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
  isMobileViewport: boolean;
  onPhaseChange?: (phase: PanelIntroPhase) => void;
  onComplete: () => void;
}) {
  const reducedMotion = prefersReducedMotion();
  const [phase, setPhase] = useState<PanelMorphPhase>(reducedMotion ? 'spotlight' : 'scatter');
  const [activeIndex, setActiveIndex] = useState(0);
  const [dockTargets, setDockTargets] = useState<PanelDockTarget[] | null>(null);
  const [exiting, setExiting] = useState(false);
  const exitStartedRef = useRef(false);
  const totalCards = PANEL_INTRO_CARD_ORDER.length;

  const beginDock = useCallback(() => {
    props.onPhaseChange?.('dock');

    const panel = props.panelGridRef.current?.closest('.agent-panel');
    if (panel instanceof HTMLElement) panel.scrollTop = 0;

    const measureDelay = props.isMobileViewport ? 96 : 0;

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.setTimeout(() => {
          setDockTargets(measureDockTargets(props.panelGridRef, props.isMobileViewport));
          setPhase('dock');
        }, measureDelay);
      });
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

    return () => {
      document.documentElement.classList.remove('panel-intro-active');
      document.body.classList.remove('panel-intro-active');
    };
  }, [props.panelGridRef]);

  useEffect(() => {
    if (reducedMotion) return;

    const tLine = window.setTimeout(() => setPhase('line'), 380);
    const tCircle = window.setTimeout(() => setPhase('circle'), 1680);
    const tSpotlight = window.setTimeout(() => setPhase('spotlight'), 2900);

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
    const timer = window.setTimeout(() => finish(), DOCK_MS);
    return () => window.clearTimeout(timer);
  }, [phase, finish]);

  useEffect(() => {
    if (!reducedMotion || phase !== 'spotlight') return;
    const timer = window.setTimeout(() => beginDock(), 520);
    return () => window.clearTimeout(timer);
  }, [reducedMotion, phase, beginDock]);

  return (
    <motion.div
      className={`panel-intro-overlay${exiting ? ' is-exiting' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Presentación del panel financiero"
      aria-busy={!exiting}
      initial={{ opacity: 0 }}
      animate={{ opacity: exiting ? 0 : 1 }}
      transition={{ duration: FADE_OUT_MS / 1000, ease: [0.42, 0, 0.58, 1] }}
    >
      <div className="panel-intro-overlay__backdrop" aria-hidden="true" />
      <PanelCardsMorphIntro
        phase={phase}
        activeIndex={activeIndex}
        dockTargets={dockTargets}
        reducedMotion={reducedMotion}
      />
    </motion.div>
  );
}
