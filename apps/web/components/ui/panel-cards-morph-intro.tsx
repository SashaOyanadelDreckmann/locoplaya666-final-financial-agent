"use client";

import React, { useEffect, useMemo, useState, type ReactElement } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { cn } from "@/lib/utils";
import {
  PANEL_INTRO_CARD_ORDER,
  PANEL_INTRO_CARD_SIZE_FALLBACKS,
} from "@/app/agent/panel-cards-intro.copy";
import { getMobileSpotlightLayout, getMobileDeckCardNaturalSize } from "@/app/agent/panel-cards-intro.mobile-dock";
import { presentPanelCardForIntro, wrapMobileDeckIntroCard } from "@/app/agent/panel-cards-intro.present";
import type { PanelIntroHandoffOrigin } from "@/app/agent/panel-intro.types";

export type PanelMorphPhase = "enter" | "spotlight" | "shell" | "assemble" | "settle";

export type PanelDockTarget = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
};

export type PanelCardNaturalSize = {
  width: number;
  height: number;
};

export type PanelIntroCardLayout = {
  left: number;
  top: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
};

type CardLayout = PanelIntroCardLayout;

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const SPOTLIGHT_SPRING = { type: "spring" as const, stiffness: 54, damping: 20, mass: 0.86 };
const ASSEMBLE_SPRING = { type: "spring" as const, stiffness: 470, damping: 34, mass: 0.74 };
const SETTLE_SPRING = { type: "spring" as const, stiffness: 58, damping: 19, mass: 0.9 };

function extractPanelCardLeaf(node: ReactElement): ReactElement {
  const props = node.props as { children?: React.ReactNode; className?: string };
  if (
    node.type === "div" &&
    typeof props.className === "string" &&
    /\bmob-col\b/.test(props.className)
  ) {
    const child = React.Children.toArray(props.children).find(React.isValidElement);
    if (child && React.isValidElement(child)) {
      return child;
    }
  }
  return node;
}

function resolveIntroCardSize(
  cardKey: string,
  naturalSizes: Record<string, PanelCardNaturalSize>,
  defaultNatural: PanelCardNaturalSize,
): PanelCardNaturalSize {
  const measured = naturalSizes[cardKey];
  if (measured && measured.width > 24 && measured.height > 24) {
    return measured;
  }
  return PANEL_INTRO_CARD_SIZE_FALLBACKS[cardKey] ?? defaultNatural;
}

function resolveSpotlightNaturalSize(
  cardKey: string,
  naturalSizes: Record<string, PanelCardNaturalSize>,
  isMobile: boolean,
  defaultNatural: PanelCardNaturalSize,
): PanelCardNaturalSize {
  if (!isMobile) {
    return resolveIntroCardSize(cardKey, naturalSizes, defaultNatural);
  }

  const measured = naturalSizes[cardKey];
  if (measured && measured.width >= 48 && measured.height >= 40) {
    const deck = getMobileDeckCardNaturalSize();
    const wRatio = measured.width / deck.width;
    if (wRatio >= 0.85 && wRatio <= 1.2) {
      return measured;
    }
  }

  return getMobileDeckCardNaturalSize();
}

function readViewportCenter() {
  if (typeof window === "undefined") {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  return {
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

function useViewportCenter() {
  const [center, setCenter] = useState(readViewportCenter);

  useEffect(() => {
    const update = () => setCenter(readViewportCenter());
    update();
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, []);

  return center;
}

export function computeSpotlightLayoutForCard(input: {
  cardKey: string;
  phase: "enter" | "spotlight";
  naturalSizes: Record<string, PanelCardNaturalSize>;
  handoffOrigin?: PanelIntroHandoffOrigin | null;
  isMobile: boolean;
  viewport: { x: number; y: number; width: number; height: number };
}): CardLayout {
  const defaultNatural = { width: 168, height: 88 };
  const natural = resolveSpotlightNaturalSize(
    input.cardKey,
    input.naturalSizes,
    input.isMobile,
    defaultNatural,
  );
  const aspect = natural.width / Math.max(natural.height, 1);

  if (input.isMobile) {
    const mobile = getMobileSpotlightLayout({
      viewportWidth: input.viewport.width,
      viewportHeight: input.viewport.height,
      naturalWidth: natural.width,
      naturalHeight: natural.height,
      phase: input.phase,
      handoffOrigin: input.handoffOrigin,
    });
    return {
      left: mobile.left,
      top: mobile.top,
      width: mobile.width,
      height: mobile.height,
      rotation: 0,
      opacity: input.phase === "enter" ? 0.78 : 1,
    };
  }

  const scale = input.phase === "enter" ? 0.9 : 1.1;
  const cardW = Math.min(natural.width * scale, Math.min(input.viewport.width * 0.44, 400));
  const cardH = Math.round(cardW / aspect);
  const centerY = input.viewport.y + 28;

  if (input.phase === "enter" && input.handoffOrigin) {
    return {
      left: input.handoffOrigin.x - cardW / 2,
      top: input.handoffOrigin.y - cardH / 2,
      width: cardW,
      height: cardH,
      rotation: 0,
      opacity: 0.76,
    };
  }

  return {
    left: input.viewport.x - cardW / 2,
    top: centerY - cardH / 2,
    width: cardW,
    height: cardH,
    rotation: 0,
    opacity: 1,
  };
}

function IntroSpotlightCard({
  cardKey,
  cardNode,
  naturalSize,
  layout,
  phase,
  isMobile,
}: {
  cardKey: string;
  cardNode: ReactElement;
  naturalSize: PanelCardNaturalSize;
  layout: CardLayout;
  phase: "enter" | "spotlight" | "shell";
  isMobile: boolean;
}) {
  const leafNode = extractPanelCardLeaf(cardNode);
  const showcaseNode = isMobile ? null : presentPanelCardForIntro(leafNode);
  const mobileDeckNatural = isMobile ? getMobileDeckCardNaturalSize() : null;
  const renderNatural = isMobile ? mobileDeckNatural ?? naturalSize : naturalSize;
  const fitScale = Math.min(
    1,
    layout.width / Math.max(renderNatural.width, 1),
    layout.height / Math.max(renderNatural.height, 1),
  );
  const exiting = phase === "shell";

  return (
    <motion.div
      layoutId={`panel-intro-card-${cardKey}`}
      className={cn(
        "panel-morph-card is-spotlight-active",
        isMobile && "is-mobile",
        exiting && "is-spotlight-exiting",
      )}
      initial={false}
      animate={{
        left: layout.left,
        top: layout.top,
        rotate: layout.rotation,
        opacity: exiting ? 0 : layout.opacity,
        scale: exiting ? 0.92 : 1,
        width: layout.width,
        height: layout.height,
        filter: exiting ? "blur(10px)" : "blur(0px)",
      }}
      transition={
        exiting
          ? { duration: 0.34, ease: EASE }
          : SPOTLIGHT_SPRING
      }
      style={{
        position: "fixed",
        zIndex: 6,
      }}
    >
      <div className={cn("panel-morph-card__frame is-spotlight", isMobile && "is-mobile-deck")}>
        <div
          className="panel-morph-card__content"
          style={{
            width: renderNatural.width,
            height: renderNatural.height,
            transform: fitScale < 0.999 ? `scale(${fitScale})` : undefined,
          }}
        >
          {isMobile ? (
            wrapMobileDeckIntroCard(cardNode, cardKey)
          ) : (
            <div className="agent-panel panel-morph-card__skin" aria-hidden="true">
              {React.cloneElement(showcaseNode!, {
                className: cn(
                  (showcaseNode!.props as { className?: string }).className,
                  "panel-morph-card__slot",
                ),
                "aria-hidden": true,
                tabIndex: -1,
              } as Record<string, unknown>)}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function IntroAssembleCard({
  cardKey,
  cardNode,
  naturalSize,
  layout,
  phase,
  index,
  isMobile,
}: {
  cardKey: string;
  cardNode: ReactElement;
  naturalSize: PanelCardNaturalSize;
  layout: CardLayout;
  phase: "assemble" | "settle";
  index: number;
  isMobile: boolean;
}) {
  const leafNode = extractPanelCardLeaf(cardNode);
  const showcaseNode = isMobile ? null : presentPanelCardForIntro(leafNode);
  const mobileDeckNatural = isMobile ? getMobileDeckCardNaturalSize() : null;
  const renderNatural = isMobile ? mobileDeckNatural ?? naturalSize : naturalSize;
  const fitScale = Math.min(
    1,
    layout.width / Math.max(renderNatural.width, 1),
    layout.height / Math.max(renderNatural.height, 1),
  );
  const settling = phase === "settle";

  return (
    <motion.div
      layoutId={settling ? undefined : `panel-intro-card-${cardKey}`}
      className={cn(
        "panel-morph-card is-assembling",
        settling && "is-settling",
        isMobile && "is-mobile",
      )}
      initial={{
        left: layout.left,
        top: layout.top + 12,
        width: layout.width,
        height: layout.height,
        rotate: layout.rotation,
        opacity: 0,
        scale: 0.88,
        filter: "blur(10px)",
      }}
      animate={{
        left: layout.left,
        top: layout.top,
        rotate: layout.rotation,
        opacity: settling ? 0 : 1,
        scale: settling ? 0.98 : 1,
        width: layout.width,
        height: layout.height,
        filter: settling ? "blur(6px)" : "blur(0px)",
      }}
      transition={
        settling
          ? { ...SETTLE_SPRING, opacity: { duration: 0.32, ease: EASE } }
          : ASSEMBLE_SPRING
      }
      style={{
        position: "fixed",
        zIndex: 2147482800 + index,
      }}
    >
      <div className={cn("panel-morph-card__frame", isMobile && "is-mobile-deck")}>
        <div
          className="panel-morph-card__content"
          style={{
            width: renderNatural.width,
            height: renderNatural.height,
            transform: fitScale < 0.999 ? `scale(${fitScale})` : undefined,
          }}
        >
          {isMobile ? (
            wrapMobileDeckIntroCard(cardNode, cardKey)
          ) : (
            <div className="agent-panel panel-morph-card__skin" aria-hidden="true">
              {React.cloneElement(showcaseNode!, {
                className: cn(
                  (showcaseNode!.props as { className?: string }).className,
                  "panel-morph-card__slot",
                ),
                "aria-hidden": true,
                tabIndex: -1,
              } as Record<string, unknown>)}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export function PanelCardsMorphIntro(props: {
  phase: PanelMorphPhase;
  activeIndex: number;
  dockTargets?: PanelDockTarget[] | null;
  panelCards: Array<{ key: string; node: ReactElement }>;
  naturalSizes: Record<string, PanelCardNaturalSize>;
  handoffOrigin?: PanelIntroHandoffOrigin | null;
  isMobileViewport?: boolean;
  panelGridRef?: React.RefObject<HTMLDivElement | null>;
  reducedMotion?: boolean;
  spotlightDurationMs?: number;
  revealedCount?: number;
  autoPlay?: boolean;
  onAdvance?: () => void;
  className?: string;
}) {
  const cards = PANEL_INTRO_CARD_ORDER;
  const total = cards.length;
  const viewport = useViewportCenter();
  const isMobile = props.isMobileViewport ?? viewport.width < 768;
  const activeMeta = cards[props.activeIndex] ?? cards[0];
  const spotlightMs = props.spotlightDurationMs ?? 2000;
  const isLastSpotlight = props.phase === "spotlight" && props.activeIndex >= total - 1;
  const autoPlay = props.autoPlay ?? false;
  const revealedCount = props.revealedCount ?? 0;
  const isSpotlightStage = props.phase === "spotlight" || props.phase === "enter";
  const isShellStage = props.phase === "shell";
  const isAssembleStage = props.phase === "assemble" || props.phase === "settle";

  const cardNodeByKey = useMemo(() => {
    const map = new Map<string, ReactElement>();
    props.panelCards.forEach((card) => map.set(card.key, card.node));
    return map;
  }, [props.panelCards]);

  const defaultNatural = { width: 168, height: 88 };
  const resolveNatural = (cardKey: string) =>
    resolveIntroCardSize(cardKey, props.naturalSizes, defaultNatural);
  const resolveSpotlightNatural = (cardKey: string) =>
    resolveSpotlightNaturalSize(cardKey, props.naturalSizes, isMobile, defaultNatural);

  const spotlightLayout = useMemo((): CardLayout | null => {
    if (!isSpotlightStage && !isShellStage) return null;

    return computeSpotlightLayoutForCard({
      cardKey: activeMeta.key,
      phase: isShellStage ? "spotlight" : props.phase === "enter" ? "enter" : "spotlight",
      naturalSizes: props.naturalSizes,
      handoffOrigin: props.handoffOrigin,
      isMobile,
      viewport,
    });
  }, [
    activeMeta.key,
    isMobile,
    isShellStage,
    isSpotlightStage,
    props.handoffOrigin,
    props.phase,
    viewport,
    props.naturalSizes,
  ]);

  const assembleLayouts = useMemo((): CardLayout[] | null => {
    if (!isAssembleStage || !props.dockTargets) return null;
    return props.dockTargets.map((dock) => ({
      left: dock.x,
      top: dock.y,
      width: dock.width,
      height: dock.height,
      rotation: dock.rotation ?? 0,
      opacity: 1,
    }));
  }, [isAssembleStage, props.dockTargets]);

  const spotlightCardKey = isShellStage ? activeMeta.key : activeMeta.key;

  return (
    <div
      className={cn(
        "panel-morph-intro",
        isMobile && "is-mobile",
        isSpotlightStage && "is-spotlight-stage",
        props.phase === "enter" && "is-enter-stage",
        isShellStage && "is-shell-stage",
        isAssembleStage && "is-assemble-stage",
        props.phase === "settle" && "is-settle-stage",
        isLastSpotlight && "is-final-spotlight",
        props.className,
      )}
      style={{ "--panel-intro-spotlight-ms": `${spotlightMs}ms` } as React.CSSProperties}
    >
      <header className="panel-morph-intro__header">
        <AnimatePresence mode="wait">
          {props.phase === "enter" ? (
            <motion.div
              key="enter"
              className="panel-morph-intro__caption"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.36, ease: EASE }}
            >
              <span className="panel-morph-intro__eyebrow">Acceso privado</span>
              <h2 className="panel-morph-intro__title">Tu centro de control</h2>
              <p className="panel-morph-intro__lede">
                Nueve módulos. Una sola vista de tu operación financiera.
              </p>
            </motion.div>
          ) : props.phase === "spotlight" ? (
            <motion.div
              key={`spotlight-${activeMeta.key}`}
              className="panel-morph-intro__caption"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.32, ease: EASE }}
            >
              <span className="panel-morph-intro__eyebrow">
                {activeMeta.tag ?? "Módulo"} · {String(props.activeIndex + 1).padStart(2, "0")} /{" "}
                {String(total).padStart(2, "0")}
              </span>
              <h2 className="panel-morph-intro__title">{activeMeta.label}</h2>
              <p className="panel-morph-intro__lede">{activeMeta.caption}</p>
              {isLastSpotlight ? (
                <p className="panel-morph-intro__finale-hint">Preparando tu panel…</p>
              ) : null}
            </motion.div>
          ) : isShellStage ? (
            <motion.div
              key="shell"
              className="panel-morph-intro__caption is-shell-caption"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.32, ease: EASE }}
            >
              <span className="panel-morph-intro__eyebrow">Panel financiero</span>
              <h2 className="panel-morph-intro__title">Tu espacio de trabajo</h2>
              <p className="panel-morph-intro__lede">Desplegando módulos uno a uno…</p>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </header>

      <div className="panel-morph-intro__stage">
        <AnimatePresence mode="wait">
          {(isSpotlightStage || isShellStage) && spotlightLayout ? (
            (() => {
              const cardNode = cardNodeByKey.get(spotlightCardKey);
              if (!cardNode) return null;
              return (
                <IntroSpotlightCard
                  key={spotlightCardKey}
                  cardKey={spotlightCardKey}
                  cardNode={cardNode}
                  naturalSize={resolveSpotlightNatural(spotlightCardKey)}
                  layout={spotlightLayout}
                  phase={isShellStage ? "shell" : props.phase === "enter" ? "enter" : "spotlight"}
                  isMobile={isMobile}
                />
              );
            })()
          ) : null}
        </AnimatePresence>

        {isMobile && isAssembleStage && assembleLayouts
          ? cards.slice(0, props.phase === "settle" ? total : revealedCount).map((meta, i) => {
              const cardNode = cardNodeByKey.get(meta.key);
              const layout = assembleLayouts[i];
              if (!cardNode || !layout) return null;
              return (
                <IntroAssembleCard
                  key={meta.key}
                  cardKey={meta.key}
                  cardNode={cardNode}
                  naturalSize={resolveNatural(meta.key)}
                  layout={layout}
                  phase={props.phase === "settle" ? "settle" : "assemble"}
                  index={i}
                  isMobile
                />
              );
            })
          : null}
      </div>

      {props.phase === "spotlight" ? (
        <footer className="panel-morph-intro__footer">
          <div className="panel-morph-intro__progress" aria-hidden="true">
            {cards.map((card, i) => (
              <span
                key={card.key}
                className={cn(
                  "panel-morph-intro__progress-dot",
                  i === props.activeIndex && "is-active",
                  i < props.activeIndex && "is-done",
                )}
              />
            ))}
          </div>
          {!isLastSpotlight ? (
            <p className="panel-morph-intro__tap-hint" aria-hidden="true">
              {autoPlay
                ? "Reproducción automática"
                : isMobile
                  ? "Toca para continuar"
                  : "Clic o → para continuar"}
            </p>
          ) : (
            <p className="panel-morph-intro__tap-hint is-finale" aria-hidden="true">
              Transición al panel
            </p>
          )}
        </footer>
      ) : null}

      <div className="panel-morph-intro__brand" aria-hidden="true">
        <span className="panel-morph-intro__brand-mark">Financieramente</span>
      </div>
    </div>
  );
}
