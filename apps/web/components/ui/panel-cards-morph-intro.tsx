"use client";

import React, { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { cn } from "@/lib/utils";
import {
  PANEL_INTRO_CARD_ORDER,
  PANEL_INTRO_CARD_SIZE_FALLBACKS,
} from "@/app/agent/panel-cards-intro.copy";
import type { PanelIntroHandoffOrigin } from "@/app/agent/panel-intro.types";

export type PanelMorphPhase = "scatter" | "line" | "circle" | "spotlight" | "dock" | "settle";

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

type MorphCardTarget = {
  x: number;
  y: number;
  rotation: number;
  scale: number;
  opacity: number;
  width: number;
  height: number;
};

type CardLayout = {
  left: number;
  top: number;
  width: number;
  height: number;
  rotation: number;
  scale: number;
  opacity: number;
};

const MORPH_SPRING = { type: "spring" as const, stiffness: 50, damping: 19, mass: 0.88 };
const DOCK_SPRING = { type: "spring" as const, stiffness: 60, damping: 21, mass: 0.86 };
const SPOTLIGHT_SPRING = { type: "spring" as const, stiffness: 56, damping: 20, mass: 0.9 };
const SETTLE_SPRING = { type: "spring" as const, stiffness: 72, damping: 24, mass: 0.82 };

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
  return defaultNatural;
}

function useContainerMetrics(ref: React.RefObject<HTMLDivElement | null>) {
  const [metrics, setMetrics] = useState({
    width: 0,
    height: 0,
    centerX: 0,
    centerY: 0,
  });

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const update = () => {
      const rect = node.getBoundingClientRect();
      setMetrics({
        width: rect.width,
        height: rect.height,
        centerX: rect.left + rect.width / 2,
        centerY: rect.top + rect.height / 2,
      });
    };

    update();
    const observer = new ResizeObserver(() => update());
    observer.observe(node);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [ref]);

  return metrics;
}

function getIntroAnchor(
  phase: PanelMorphPhase,
  handoffOrigin: PanelIntroHandoffOrigin | null | undefined,
  metrics: { centerX: number; centerY: number },
) {
  if (!handoffOrigin) {
    return { x: metrics.centerX, y: metrics.centerY };
  }

  if (phase === "scatter" || phase === "line") {
    return { x: handoffOrigin.x, y: handoffOrigin.y };
  }

  if (phase === "circle") {
    return {
      x: handoffOrigin.x * 0.28 + metrics.centerX * 0.72,
      y: handoffOrigin.y * 0.28 + metrics.centerY * 0.72,
    };
  }

  return { x: metrics.centerX, y: metrics.centerY };
}

function IntroPanelCard({
  cardKey,
  cardNode,
  naturalSize,
  layout,
  active,
  phase,
  index,
}: {
  cardKey: string;
  cardNode: ReactElement;
  naturalSize: PanelCardNaturalSize;
  layout: CardLayout;
  active: boolean;
  phase: PanelMorphPhase;
  index: number;
}) {
  const isDocking = phase === "dock" || phase === "settle";
  const syncLayout = isDocking;
  const leafNode = extractPanelCardLeaf(cardNode);
  const fitScale = Math.min(
    1,
    layout.width / Math.max(naturalSize.width, 1),
    layout.height / Math.max(naturalSize.height, 1),
  );

  const transition =
    phase === "settle"
      ? SETTLE_SPRING
      : phase === "dock"
        ? DOCK_SPRING
        : phase === "spotlight"
          ? SPOTLIGHT_SPRING
          : MORPH_SPRING;

  const shellOpacity = phase === "settle" ? 0 : 1;

  return (
    <motion.div
      layoutId={syncLayout ? `panel-intro-card-${cardKey}` : undefined}
      className={cn(
        "panel-morph-card",
        active && phase === "spotlight" && "is-spotlight-active",
        isDocking && "is-docking",
        phase === "settle" && "is-settling",
      )}
      animate={{
        left: layout.left,
        top: layout.top,
        rotate: layout.rotation,
        scale: layout.scale,
        opacity: layout.opacity * shellOpacity,
        width: layout.width,
        height: layout.height,
      }}
      transition={transition}
      style={{
        position: "fixed",
        zIndex: isDocking ? 2147482800 + index : active ? 6 : 2,
      }}
    >
      <div className={cn("panel-morph-card__shell", active && phase === "spotlight" && "is-hero")}>
        <div
          className="panel-morph-card__scale"
          style={{
            width: naturalSize.width,
            height: naturalSize.height,
            transform: `scale(${fitScale})`,
          }}
        >
          <div className="agent-panel panel-morph-card__agent-skin" aria-hidden="true">
            {React.cloneElement(leafNode, {
              className: cn(
                (leafNode.props as { className?: string }).className,
                "panel-morph-card__slot",
              ),
              "aria-hidden": true,
              tabIndex: -1,
              initial: false,
              animate: { opacity: 1, scale: 1, y: 0 },
            } as Record<string, unknown>)}
          </div>
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
  const containerRef = useRef<HTMLDivElement>(null);
  const containerMetrics = useContainerMetrics(containerRef);
  const cards = PANEL_INTRO_CARD_ORDER;
  const total = cards.length;

  const cardNodeByKey = useMemo(() => {
    const map = new Map<string, ReactElement>();
    props.panelCards.forEach((card) => map.set(card.key, card.node));
    return map;
  }, [props.panelCards]);

  const defaultNatural = { width: 168, height: 88 };
  const isMobile = props.isMobileViewport ?? containerMetrics.width < 768;
  const introAnchor = getIntroAnchor(props.phase, props.handoffOrigin, containerMetrics);

  const resolveNatural = (cardKey: string) =>
    resolveIntroCardSize(
      cardKey,
      props.naturalSizes,
      PANEL_INTRO_CARD_SIZE_FALLBACKS[cardKey] ?? defaultNatural,
    );

  const scatterPositions = useMemo(
    () =>
      cards.map((_, i) => {
        const angle = (i / total) * Math.PI * 2 - Math.PI / 2;
        const radius = 220 + (i % 3) * 36;
        const aspect =
          (PANEL_INTRO_CARD_SIZE_FALLBACKS[cards[i]?.key ?? "profile"]?.width ?? 168) /
          Math.max(PANEL_INTRO_CARD_SIZE_FALLBACKS[cards[i]?.key ?? "profile"]?.height ?? 88, 1);
        const width = props.reducedMotion ? 148 : isMobile ? 148 : 168;
        return {
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius * 0.58,
          rotation: (i - total / 2) * 7,
          scale: 0.88,
          opacity: 0.94,
          width,
          height: Math.round(width / aspect),
        };
      }),
    [cards, isMobile, props.reducedMotion, total],
  );

  const baseCardW = isMobile ? 168 : 196;

  const targets = cards.map((meta, i) => {
    const natural = resolveNatural(meta.key);
    const aspect = natural.width / Math.max(natural.height, 1);
    const activeCardW = Math.min(
      isMobile ? Math.min(containerMetrics.width - 40, 360) : Math.min(containerMetrics.width - 72, 440),
      Math.max(natural.width * 0.96, baseCardW * 1.42),
    );
    const formingCardW = Math.min(
      isMobile ? Math.min(containerMetrics.width - 56, 280) : Math.min(containerMetrics.width - 96, 320),
      Math.max(natural.width * 0.72, baseCardW * 1.08),
    );
    let target: MorphCardTarget = {
      x: 0,
      y: 0,
      rotation: 0,
      scale: 1,
      opacity: 1,
      width: baseCardW,
      height: Math.round(baseCardW / aspect),
    };

    if (props.phase === "scatter") {
      target = scatterPositions[i];
    } else if (props.phase === "line") {
      const spacing = formingCardW + (isMobile ? 12 : 16);
      const lineWidth = total * spacing;
      target = {
        x: i * spacing - lineWidth / 2 + spacing / 2,
        y: 0,
        rotation: 0,
        scale: 1,
        opacity: 1,
        width: formingCardW,
        height: Math.round(formingCardW / aspect),
      };
    } else if (props.phase === "circle") {
      const radius =
        Math.min(containerMetrics.width, containerMetrics.height) * (isMobile ? 0.28 : 0.32);
      const angle = (i / total) * 360;
      const rad = (angle * Math.PI) / 180;
      target = {
        x: Math.cos(rad) * radius,
        y: Math.sin(rad) * radius,
        rotation: angle + 90,
        scale: 1,
        opacity: 1,
        width: formingCardW,
        height: Math.round(formingCardW / aspect),
      };
    } else if (props.phase === "spotlight") {
      const spread = isMobile ? 78 : 96;
      const arcRadius = isMobile ? 196 : 248;
      const arcCenterY = isMobile ? 88 : 108;
      const offset = i - props.activeIndex;
      const normalized = ((offset % total) + total) % total;
      const signed = normalized > total / 2 ? normalized - total : normalized;
      const arcAngle = -90 + signed * (spread / Math.max(total - 1, 1));
      const arcRad = (arcAngle * Math.PI) / 180;
      const isActive = i === props.activeIndex;

      target = {
        x: Math.cos(arcRad) * arcRadius,
        y: Math.sin(arcRad) * arcRadius + arcCenterY,
        rotation: isActive ? 0 : arcAngle + 90,
        scale: isActive ? 1 : 0.84,
        opacity: isActive ? 1 : Math.max(0.34, 0.82 - Math.abs(signed) * 0.11),
        width: isActive ? activeCardW : baseCardW,
        height: isActive ? Math.round(activeCardW / aspect) : Math.round(baseCardW / aspect),
      };
    } else if (
      (props.phase === "dock" || props.phase === "settle") &&
      props.dockTargets?.[i]
    ) {
      const dock = props.dockTargets[i]!;
      target = {
        x: dock.x,
        y: dock.y,
        rotation: dock.rotation ?? 0,
        scale: 1,
        opacity: 1,
        width: dock.width,
        height: dock.height,
      };
    }

    return target;
  });

  const layouts = targets.map((target) => {
    if (props.phase === "dock" || props.phase === "settle") {
      return {
        left: target.x,
        top: target.y,
        width: target.width,
        height: target.height,
        rotation: target.rotation,
        scale: target.scale,
        opacity: target.opacity,
      };
    }

    return {
      left: introAnchor.x + target.x - target.width / 2,
      top: introAnchor.y + target.y - target.height / 2,
      width: target.width,
      height: target.height,
      rotation: target.rotation,
      scale: target.scale,
      opacity: target.opacity,
    };
  });

  const activeMeta = cards[props.activeIndex] ?? cards[0];
  const isDockStage = props.phase === "dock" || props.phase === "settle";

  const spotlightMs = props.spotlightDurationMs ?? 2800;

  return (
    <div
      ref={containerRef}
      className={cn(
        "panel-morph-intro",
        props.phase === "spotlight" && "is-spotlight-stage",
        props.phase === "scatter" && "is-scatter-stage",
        isDockStage && "is-dock-stage",
        props.phase === "settle" && "is-settle-stage",
        props.className,
      )}
      style={{ "--panel-intro-spotlight-ms": `${spotlightMs}ms` } as React.CSSProperties}
    >
      <div className="panel-morph-intro__vignette" aria-hidden="true" />
      <div className="panel-morph-intro__grain" aria-hidden="true" />
      <div className="panel-morph-intro__brand" aria-hidden="true">
        <span className="panel-morph-intro__brand-mark">Financieramente</span>
        <span className="panel-morph-intro__brand-sub">Private briefing</span>
      </div>

      <div className="panel-morph-intro__copy">
        <AnimatePresence mode="wait">
          {props.phase === "spotlight" ? (
            <motion.div
              key={`spotlight-${activeMeta.key}`}
              className="panel-morph-intro__caption"
              initial={{ opacity: 0, y: 10, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
              transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
            >
              <span className="panel-morph-intro__caption-kicker">
                {activeMeta.tag ?? "Módulo"} · {String(props.activeIndex + 1).padStart(2, "0")} /{" "}
                {String(total).padStart(2, "0")}
              </span>
              <h2 className="panel-morph-intro__caption-title">{activeMeta.label}</h2>
              <p className="panel-morph-intro__caption-text">{activeMeta.caption}</p>
            </motion.div>
          ) : props.phase === "circle" || props.phase === "line" ? (
            <motion.div
              key="forming"
              className="panel-morph-intro__caption is-forming"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
            >
              <span className="panel-morph-intro__caption-kicker">Acceso privado</span>
              <h2 className="panel-morph-intro__caption-title">Tu centro de control</h2>
              <p className="panel-morph-intro__caption-text">
                Nueve módulos. Una sola vista de tu operación financiera.
              </p>
            </motion.div>
          ) : props.phase === "dock" || props.phase === "settle" ? (
            <motion.div
              key="dock"
              className="panel-morph-intro__caption is-docking"
              initial={{ opacity: 0 }}
              animate={{ opacity: props.phase === "settle" ? 0 : 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.28 }}
            >
              <span className="panel-morph-intro__caption-kicker">Aterrizaje</span>
              <h2 className="panel-morph-intro__caption-title">Panel desplegado</h2>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

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
        {props.phase === "spotlight" ? (
          <div className="panel-morph-intro__spotlight-halo" aria-hidden="true" />
        ) : null}
        {cards.map((meta, i) => {
          const cardNode = cardNodeByKey.get(meta.key);
          if (!cardNode) return null;

          return (
            <IntroPanelCard
              key={meta.key}
              cardKey={meta.key}
              cardNode={cardNode}
              naturalSize={resolveNatural(meta.key)}
              layout={layouts[i]}
              active={i === props.activeIndex}
              phase={props.phase}
              index={i}
            />
          );
        })}
      </div>

      {props.phase === "spotlight" ? (
        <>
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
            Toca o pulsa → para continuar
          </p>
        </>
      ) : null}
    </div>
  );
}
