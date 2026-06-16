'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
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

const ENTER_MS = 420;
const SPOTLIGHT_MS = 1480;
const SPOTLIGHT_FINALE_MS = 1080;
const SHELL_MS = 360;
const CARD_ASSEMBLE_STAGGER_MS = 96;
const ASSEMBLE_FIRST_CARD_MS = 56;
const ASSEMBLE_TAIL_MS = 420;
const SETTLE_MS = 320;
const FADE_OUT_MS = 340;

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

  if (isMobileViewport) {
    const mobileSize = getMobileDeckCardNaturalSize();
    PANEL_INTRO_CARD_ORDER.forEach((card) => {
      sizes[card.key] = mobileSize;
    });
    return sizes;
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
  onRevealCountChange?: (count: number) => void;
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
  const [revealedCount, setRevealedCount] = useState(0);
  const [exiting, setExiting] = useState(false);
  const exitStartedRef = useRef(false);
  const shellStartedRef = useRef(false);
  const assembleStartedRef = useRef(false);
  const skipStartedRef = useRef(false);
  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;
  const [portalReady, setPortalReady] = useState(() => typeof document !== 'undefined');
  const propsRef = useRef(props);
  propsRef.current = props;
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

  const refreshAssemblyTargets = useCallback(() => {
    const nextNaturalSizes = measureCardNaturalSizes(
      propsRef.current.panelGridRef,
      propsRef.current.isMobileViewport,
    );
    setNaturalSizes(nextNaturalSizes);
    setDockTargets(
      measureDockTargets(propsRef.current.panelGridRef, propsRef.current.isMobileViewport),
    );
  }, []);

  const beginShellReveal = useCallback(() => {
    if (shellStartedRef.current) return;
    shellStartedRef.current = true;

    propsRef.current.onPhaseChange?.('shell');
    setPhase('shell');

    const panel = propsRef.current.panelGridRef.current?.closest('.agent-panel');
    if (panel instanceof HTMLElement) panel.scrollTop = 0;

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        refreshAssemblyTargets();
      });
    });
  }, [refreshAssemblyTargets]);

  const beginAssemble = useCallback(() => {
    if (assembleStartedRef.current) return;
    assembleStartedRef.current = true;

    propsRef.current.onPhaseChange?.('assemble');
    setPhase('assemble');
    setRevealedCount(0);
    propsRef.current.onRevealCountChange?.(0);
  }, []);

  const beginSettle = useCallback(() => {
    propsRef.current.onPhaseChange?.('settle');
    setPhase('settle');
    window.requestAnimationFrame(() => {
      propsRef.current.onSettled?.();
      propsRef.current.onPanelReveal?.();
    });
  }, []);

  const advanceIntro = useCallback(() => {
    if (exitStartedRef.current || skipStartedRef.current || exiting) return;

    if (phase === 'enter') {
      propsRef.current.onHaptic?.(4);
      setPhase('spotlight');
      return;
    }

    if (phase !== 'spotlight') return;

    propsRef.current.onHaptic?.(3);
    if (activeIndexRef.current >= totalCards - 1) {
      beginShellReveal();
      return;
    }
    setActiveIndex((index) => Math.min(index + 1, totalCards - 1));
  }, [beginShellReveal, exiting, phase, totalCards]);

  const finish = useCallback(() => {
    if (exitStartedRef.current) return;
    exitStartedRef.current = true;
    markPanelIntroCompleted();
    setExiting(true);
    window.setTimeout(() => propsRef.current.onComplete(), FADE_OUT_MS);
  }, []);

  const skipToPanel = useCallback(() => {
    if (skipStartedRef.current || exitStartedRef.current) return;
    skipStartedRef.current = true;
    shellStartedRef.current = true;
    assembleStartedRef.current = true;
    propsRef.current.onHaptic?.(8);

    refreshAssemblyTargets();
    propsRef.current.onPhaseChange?.('assemble');
    setPhase('assemble');
    setRevealedCount(totalCards);
    propsRef.current.onRevealCountChange?.(totalCards);

    window.setTimeout(() => beginSettle(), reducedMotion ? 120 : 280);
  }, [beginSettle, refreshAssemblyTargets, reducedMotion, totalCards]);

  useEffect(() => {
    if (!portalReady) setPortalReady(true);
    propsRef.current.onPhaseChange?.('morph');
  }, [portalReady]);

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

  useEffect(() => {
    if (phase !== 'spotlight' || exiting) return;

    const dwellMs = activeIndex >= totalCards - 1 ? SPOTLIGHT_FINALE_MS : SPOTLIGHT_MS;
    const timer = window.setTimeout(() => {
      if (activeIndex >= totalCards - 1) {
        beginShellReveal();
        return;
      }
      setActiveIndex((index) => Math.min(index + 1, totalCards - 1));
      propsRef.current.onHaptic?.(5);
    }, dwellMs);

    return () => window.clearTimeout(timer);
  }, [phase, activeIndex, exiting, totalCards, beginShellReveal]);

  useEffect(() => {
    if (phase !== 'shell') return;
    const timer = window.setTimeout(() => beginAssemble(), SHELL_MS);
    return () => window.clearTimeout(timer);
  }, [phase, beginAssemble]);

  useEffect(() => {
    if (phase !== 'assemble' || exiting) return;

    if (revealedCount >= totalCards) {
      const timer = window.setTimeout(() => beginSettle(), ASSEMBLE_TAIL_MS);
      return () => window.clearTimeout(timer);
    }

    const delay = revealedCount === 0 ? ASSEMBLE_FIRST_CARD_MS : CARD_ASSEMBLE_STAGGER_MS;
    const timer = window.setTimeout(() => {
      const next = Math.min(revealedCount + 1, totalCards);
      setRevealedCount(next);
      propsRef.current.onRevealCountChange?.(next);
      propsRef.current.onHaptic?.(4);
    }, delay);

    return () => window.clearTimeout(timer);
  }, [phase, revealedCount, exiting, totalCards, beginSettle]);

  useEffect(() => {
    if (phase !== 'settle') return;
    const timer = window.setTimeout(() => finish(), SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [phase, finish]);

  useEffect(() => {
    if (!reducedMotion || phase !== 'spotlight') return;
    const timer = window.setTimeout(() => beginShellReveal(), 1200);
    return () => window.clearTimeout(timer);
  }, [reducedMotion, phase, beginShellReveal]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (exiting) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        skipToPanel();
        return;
      }
      if (
        (event.key === 'ArrowRight' || event.key === ' ') &&
        (phase === 'enter' || phase === 'spotlight')
      ) {
        event.preventDefault();
        advanceIntro();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [exiting, skipToPanel, advanceIntro, phase]);

  if (!portalReady) return null;

  const overlayPhaseClass =
    phase === 'shell'
      ? ' is-shell-reveal'
      : phase === 'assemble' || phase === 'settle'
        ? ' is-assembling'
        : phase === 'spotlight' || phase === 'enter'
          ? ' is-spotlight-stage'
          : '';

  return createPortal(
    <motion.div
      className={`panel-intro-overlay${exiting ? ' is-exiting' : ''}${overlayPhaseClass}${
        props.isMobileViewport ? ' is-mobile' : ''
      }`}
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
        spotlightDurationMs={
          activeIndex >= totalCards - 1 ? SPOTLIGHT_FINALE_MS : SPOTLIGHT_MS
        }
        revealedCount={revealedCount}
        onAdvance={advanceIntro}
      />
    </motion.div>,
    document.body,
  );
}
