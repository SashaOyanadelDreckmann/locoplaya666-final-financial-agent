"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { cn } from "@/lib/utils";
import {
  PANEL_INTRO_CARD_ORDER,
  type PanelIntroCardMeta,
} from "@/app/agent/panel-cards-intro.copy";

export type PanelMorphPhase = "scatter" | "line" | "circle" | "spotlight" | "dock";

export type PanelDockTarget = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
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

const INTRO_SPRING = { type: "spring" as const, stiffness: 42, damping: 16 };
const DOCK_SPRING = { type: "spring" as const, stiffness: 58, damping: 18 };

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

function IntroFlipCard({
  meta,
  index,
  layout,
  active,
  phase,
}: {
  meta: PanelIntroCardMeta;
  index: number;
  layout: { left: number; top: number; width: number; height: number; rotation: number; scale: number; opacity: number };
  active: boolean;
  phase: PanelMorphPhase;
}) {
  const showBack = phase === "spotlight" && active;
  const isDocking = phase === "dock";

  return (
    <motion.div
      className={cn(
        "panel-morph-card",
        active && phase === "spotlight" && "is-spotlight-active",
        isDocking && "is-docking",
      )}
      animate={{
        left: layout.left,
        top: layout.top,
        rotate: layout.rotation,
        scale: layout.scale,
        opacity: layout.opacity,
        width: layout.width,
        height: layout.height,
      }}
      transition={isDocking ? DOCK_SPRING : INTRO_SPRING}
      style={{
        position: "fixed",
        transformStyle: "preserve-3d",
        zIndex: isDocking ? 2147482800 + index : active ? 6 : 2,
      }}
    >
      <motion.div
        className="panel-morph-card__flip"
        animate={{ rotateY: showBack ? 180 : 0 }}
        transition={{ duration: 0.55, type: "spring", stiffness: 220, damping: 22 }}
        style={{ transformStyle: "preserve-3d" }}
      >
        <div className="panel-morph-card__face panel-morph-card__face--front">
          {meta.image ? (
            <img src={meta.image} alt="" className="panel-morph-card__image" />
          ) : (
            <div
              className="panel-morph-card__accent"
              style={{ background: meta.accent }}
              aria-hidden="true"
            />
          )}
          <div className="panel-morph-card__shade" aria-hidden="true" />
          <div className="panel-morph-card__meta">
            <span className="panel-morph-card__index">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="panel-morph-card__label">{meta.label}</span>
          </div>
        </div>

        <div className="panel-morph-card__face panel-morph-card__face--back">
          <span className="panel-morph-card__back-kicker">Panel</span>
          <span className="panel-morph-card__back-label">{meta.label}</span>
          <p className="panel-morph-card__back-caption">{meta.caption}</p>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function PanelCardsMorphIntro(props: {
  phase: PanelMorphPhase;
  activeIndex: number;
  dockTargets?: PanelDockTarget[] | null;
  reducedMotion?: boolean;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const containerMetrics = useContainerMetrics(containerRef);
  const cards = PANEL_INTRO_CARD_ORDER;
  const total = cards.length;

  const scatterPositions = useMemo(
    () =>
      cards.map((_, i) => ({
        x: (Math.random() - 0.5) * 1200,
        y: (Math.random() - 0.5) * 760,
        rotation: (Math.random() - 0.5) * 140,
        scale: 0.55,
        opacity: 0,
        width: props.reducedMotion ? 132 : 108,
        height: props.reducedMotion ? 78 : 64,
      })),
    [cards.length, props.reducedMotion],
  );

  const isMobile = containerMetrics.width > 0 && containerMetrics.width < 768;
  const baseCardW = isMobile ? 118 : 132;
  const baseCardH = isMobile ? 68 : 76;
  const activeCardW = isMobile ? 196 : 228;
  const activeCardH = isMobile ? 112 : 128;

  const targets = cards.map((_, i) => {
    let target: MorphCardTarget = {
      x: 0,
      y: 0,
      rotation: 0,
      scale: 1,
      opacity: 1,
      width: baseCardW,
      height: baseCardH,
    };

    if (props.phase === "scatter") {
      target = scatterPositions[i];
    } else if (props.phase === "line") {
      const spacing = baseCardW + (isMobile ? 8 : 12);
      const lineWidth = total * spacing;
      target = {
        x: i * spacing - lineWidth / 2 + spacing / 2,
        y: 0,
        rotation: 0,
        scale: 1,
        opacity: 1,
        width: baseCardW,
        height: baseCardH,
      };
    } else if (props.phase === "circle") {
      const radius = Math.min(containerMetrics.width, containerMetrics.height) * (isMobile ? 0.28 : 0.32);
      const angle = (i / total) * 360;
      const rad = (angle * Math.PI) / 180;
      target = {
        x: Math.cos(rad) * radius,
        y: Math.sin(rad) * radius,
        rotation: angle + 90,
        scale: 1,
        opacity: 1,
        width: baseCardW,
        height: baseCardH,
      };
    } else if (props.phase === "spotlight") {
      const spread = isMobile ? 92 : 118;
      const arcRadius = isMobile ? 220 : 280;
      const arcCenterY = isMobile ? 88 : 108;
      const offset = i - props.activeIndex;
      const normalized = ((offset % total) + total) % total;
      const signed =
        normalized > total / 2 ? normalized - total : normalized;
      const arcAngle = -90 + signed * (spread / Math.max(total - 1, 1));
      const arcRad = (arcAngle * Math.PI) / 180;
      const isActive = i === props.activeIndex;

      target = {
        x: Math.cos(arcRad) * arcRadius,
        y: Math.sin(arcRad) * arcRadius + arcCenterY,
        rotation: isActive ? 0 : arcAngle + 90,
        scale: isActive ? 1 : 0.82,
        opacity: isActive ? 1 : Math.max(0.22, 0.72 - Math.abs(signed) * 0.14),
        width: isActive ? activeCardW : baseCardW,
        height: isActive ? activeCardH : baseCardH,
      };
    } else if (props.phase === "dock" && props.dockTargets?.[i]) {
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
    if (props.phase === "dock") {
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
      left: containerMetrics.centerX + target.x - target.width / 2,
      top: containerMetrics.centerY + target.y - target.height / 2,
      width: target.width,
      height: target.height,
      rotation: target.rotation,
      scale: target.scale,
      opacity: target.opacity,
    };
  });

  const activeMeta = cards[props.activeIndex] ?? cards[0];

  return (
    <div
      ref={containerRef}
      className={cn(
        "panel-morph-intro",
        props.phase === "dock" && "is-dock-stage",
        props.className,
      )}
    >
      <div className="panel-morph-intro__vignette" aria-hidden="true" />
      <div className="panel-morph-intro__grain" aria-hidden="true" />

      <div className="panel-morph-intro__copy">
        <AnimatePresence mode="wait">
          {props.phase === "spotlight" ? (
            <motion.div
              key={`spotlight-${activeMeta.key}`}
              className="panel-morph-intro__caption"
              initial={{ opacity: 0, y: 14, filter: "blur(8px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -10, filter: "blur(6px)" }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            >
              <span className="panel-morph-intro__caption-kicker">
                {String(props.activeIndex + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
              </span>
              <h2 className="panel-morph-intro__caption-title">{activeMeta.label}</h2>
              <p className="panel-morph-intro__caption-text">{activeMeta.caption}</p>
            </motion.div>
          ) : props.phase === "circle" || props.phase === "line" ? (
            <motion.div
              key="forming"
              className="panel-morph-intro__caption is-forming"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.5 }}
            >
              <span className="panel-morph-intro__caption-kicker">Panel financiero</span>
              <h2 className="panel-morph-intro__caption-title">Tu centro de control</h2>
              <p className="panel-morph-intro__caption-text">
                Nueve bloques. Una sola vista de tu operación financiera.
              </p>
            </motion.div>
          ) : props.phase === "dock" ? (
            <motion.div
              key="dock"
              className="panel-morph-intro__caption is-docking"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <span className="panel-morph-intro__caption-kicker">Desplegando</span>
              <h2 className="panel-morph-intro__caption-title">Panel listo</h2>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="panel-morph-intro__stage">
        {cards.map((meta, i) => (
          <IntroFlipCard
            key={meta.key}
            meta={meta}
            index={i}
            layout={layouts[i]}
            active={i === props.activeIndex}
            phase={props.phase}
          />
        ))}
      </div>

      {props.phase === "spotlight" ? (
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
      ) : null}
    </div>
  );
}
