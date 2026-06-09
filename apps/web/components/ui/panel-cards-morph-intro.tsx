"use client";

import React, { useEffect, useMemo, useState, type ReactElement } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { cn } from "@/lib/utils";
import {
  PANEL_INTRO_CARD_ORDER,
  PANEL_INTRO_CARD_SIZE_FALLBACKS,
} from "@/app/agent/panel-cards-intro.copy";
import type { PanelIntroHandoffOrigin } from "@/app/agent/panel-intro.types";

export type PanelMorphPhase = "enter" | "spotlight" | "dock" | "settle";

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

type CardLayout = {
  left: number;
  top: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
};

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const SPOTLIGHT_SPRING = { type: "spring" as const, stiffness: 62, damping: 22, mass: 0.82 };
const DOCK_SPRING = { type: "spring" as const, stiffness: 68, damping: 22, mass: 0.8 };
const SETTLE_SPRING = { type: "spring" as const, stiffness: 78, damping: 26, mass: 0.78 };

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

function useViewportCenter() {
  const [center, setCenter] = useState({ x: 0, y: 0, width: 0, height: 0 });

  useEffect(() => {
    const update = () => {
      setCenter({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return center;
}

function IntroPanelCard({
  cardKey,
  cardNode,
  naturalSize,
  layout,
  phase,
  index,
}: {
  cardKey: string;
  cardNode: ReactElement;
  naturalSize: PanelCardNaturalSize;
  layout: CardLayout;
  phase: PanelMorphPhase;
  index: number;
}) {
  const isDocking = phase === "dock" || phase === "settle";
  const leafNode = extractPanelCardLeaf(cardNode);
  const fitScale = Math.min(
    1,
    layout.width / Math.max(naturalSize.width, 1),
    layout.height / Math.max(naturalSize.height, 1),
  );

  const transition =
    phase === "settle" ? SETTLE_SPRING : phase === "dock" ? DOCK_SPRING : SPOTLIGHT_SPRING;

  return (
    <motion.div
      layoutId={isDocking ? `panel-intro-card-${cardKey}` : undefined}
      className={cn("panel-morph-card", isDocking && "is-docking", phase === "settle" && "is-settling")}
      animate={{
        left: layout.left,
        top: layout.top,
        rotate: layout.rotation,
        opacity: phase === "settle" ? 0 : layout.opacity,
        width: layout.width,
        height: layout.height,
      }}
      transition={transition}
      style={{
        position: "fixed",
        zIndex: isDocking ? 2147482800 + index : 5,
      }}
    >
      <div className="panel-morph-card__frame">
        <div
          className="panel-morph-card__content"
          style={{
            width: naturalSize.width,
            height: naturalSize.height,
            transform: `scale(${fitScale})`,
          }}
        >
          {React.cloneElement(leafNode, {
            className: cn(
              (leafNode.props as { className?: string }).className,
              "panel-morph-card__slot",
            ),
            "aria-hidden": true,
            tabIndex: -1,
          } as Record<string, unknown>)}
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
  reducedMotion?: boolean;
  spotlightDurationMs?: number;
  onAdvance?: () => void;
  className?: string;
}) {
  const cards = PANEL_INTRO_CARD_ORDER;
  const total = cards.length;
  const viewport = useViewportCenter();
  const isMobile = props.isMobileViewport ?? viewport.width < 768;
  const activeMeta = cards[props.activeIndex] ?? cards[0];
  const isDockStage = props.phase === "dock" || props.phase === "settle";
  const spotlightMs = props.spotlightDurationMs ?? 2200;

  const cardNodeByKey = useMemo(() => {
    const map = new Map<string, ReactElement>();
    props.panelCards.forEach((card) => map.set(card.key, card.node));
    return map;
  }, [props.panelCards]);

  const defaultNatural = { width: 168, height: 88 };
  const resolveNatural = (cardKey: string) =>
    resolveIntroCardSize(cardKey, props.naturalSizes, defaultNatural);

  const spotlightLayout = useMemo((): CardLayout | null => {
    if (props.phase !== "spotlight" && props.phase !== "enter") return null;

    const natural = resolveNatural(activeMeta.key);
    const aspect = natural.width / Math.max(natural.height, 1);
    const cardW = Math.min(
      isMobile ? viewport.width - 48 : viewport.width - 120,
      isMobile ? 340 : 420,
      Math.max(natural.width, isMobile ? 280 : 320),
    );
    const cardH = Math.round(cardW / aspect);
    const centerY = viewport.y + (isMobile ? 24 : 32);

    if (props.phase === "enter" && props.handoffOrigin) {
      return {
        left: props.handoffOrigin.x - cardW / 2,
        top: props.handoffOrigin.y - cardH / 2,
        width: cardW * 0.88,
        height: Math.round(cardH * 0.88),
        rotation: 0,
        opacity: 0.72,
      };
    }

    return {
      left: viewport.x - cardW / 2,
      top: centerY - cardH / 2,
      width: cardW,
      height: cardH,
      rotation: 0,
      opacity: 1,
    };
  }, [activeMeta.key, isMobile, props.handoffOrigin, props.phase, viewport, props.naturalSizes]);

  const dockLayouts = useMemo((): CardLayout[] | null => {
    if (!isDockStage || !props.dockTargets) return null;
    return props.dockTargets.map((dock) => ({
      left: dock.x,
      top: dock.y,
      width: dock.width,
      height: dock.height,
      rotation: dock.rotation ?? 0,
      opacity: 1,
    }));
  }, [isDockStage, props.dockTargets]);

  return (
    <div
      className={cn(
        "panel-morph-intro",
        props.phase === "spotlight" && "is-spotlight-stage",
        props.phase === "enter" && "is-enter-stage",
        isDockStage && "is-dock-stage",
        props.phase === "settle" && "is-settle-stage",
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
            </motion.div>
          ) : null}
        </AnimatePresence>
      </header>

      <div
        className="panel-morph-intro__stage"
        onClick={() => {
          if (props.phase === "spotlight") props.onAdvance?.();
        }}
        onKeyDown={(event) => {
          if (props.phase !== "spotlight") return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            props.onAdvance?.();
          }
        }}
        role={props.phase === "spotlight" ? "button" : undefined}
        tabIndex={props.phase === "spotlight" ? 0 : undefined}
        aria-label={props.phase === "spotlight" ? "Avanzar al siguiente módulo" : undefined}
      >
        {(props.phase === "spotlight" || props.phase === "enter") && spotlightLayout ? (
          (() => {
            const cardNode = cardNodeByKey.get(activeMeta.key);
            if (!cardNode) return null;
            return (
              <IntroPanelCard
                key={activeMeta.key}
                cardKey={activeMeta.key}
                cardNode={cardNode}
                naturalSize={resolveNatural(activeMeta.key)}
                layout={spotlightLayout}
                phase={props.phase === "enter" ? "spotlight" : props.phase}
                index={props.activeIndex}
              />
            );
          })()
        ) : null}

        {isDockStage && dockLayouts
          ? cards.map((meta, i) => {
              const cardNode = cardNodeByKey.get(meta.key);
              const layout = dockLayouts[i];
              if (!cardNode || !layout) return null;
              return (
                <IntroPanelCard
                  key={meta.key}
                  cardKey={meta.key}
                  cardNode={cardNode}
                  naturalSize={resolveNatural(meta.key)}
                  layout={layout}
                  phase={props.phase}
                  index={i}
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
          <p className="panel-morph-intro__tap-hint" aria-hidden="true">
            {isMobile ? "Toca para continuar" : "Clic o → para continuar"}
          </p>
        </footer>
      ) : null}

      <div className="panel-morph-intro__brand" aria-hidden="true">
        <span className="panel-morph-intro__brand-mark">Financieramente</span>
      </div>
    </div>
  );
}
