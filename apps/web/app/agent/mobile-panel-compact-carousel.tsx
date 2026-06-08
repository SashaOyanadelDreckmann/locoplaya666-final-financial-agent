'use client';

import React, {
  forwardRef,
  startTransition,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, type PanInfo } from 'framer-motion';
import {
  computeSnapDuration,
  DECK_GESTURE,
  dragPhaseFromPointer,
  resolveSwipeTarget,
} from './mobile-panel-deck-gesture';

export type PanelCardItem = { key: string; node: ReactElement };

export type MobilePanelDeckHandle = {
  focusByKey: (key: string) => boolean;
  focusByIndex: (index: number) => void;
  resetHome: () => void;
};

const SLOT_OFFSETS = [-2, -1, 0, 1, 2] as const;
type DeckSlotName = 'far-left' | 'near-left' | 'center' | 'near-right' | 'far-right';

const DECK_SLOT_BY_OFFSET: Record<(typeof SLOT_OFFSETS)[number], DeckSlotName> = {
  [-2]: 'far-left',
  [-1]: 'near-left',
  0: 'center',
  1: 'near-right',
  2: 'far-right',
};

const DECK_CLASS_BY_OFFSET: Record<(typeof SLOT_OFFSETS)[number], string> = {
  [-2]: 'is-deck-far-left',
  [-1]: 'is-deck-near-left is-mobile-left',
  0: 'is-mobile-front',
  1: 'is-deck-near-right is-mobile-right',
  2: 'is-deck-far-right',
};

const DRAG_LOCK_PX = 0;
const VERTICAL_CANCEL_RATIO = 0.78;
const PROFILE_HOME_INDEX = 0;

// Cards that expand into a floating overlay when tapped (informative only, no action cards)
const FLOATABLE_CARD_KEYS = new Set(['objective', 'mode', 'news', 'library']);

type FloatingState = {
  card: PanelCardItem;
  originRect: DOMRect;
};

function mod(index: number, count: number) {
  return ((index % count) + count) % count;
}

function splitDeckPhase(phase: number, count: number) {
  if (count <= 0) return { baseIndex: 0, progress: 0 };
  const base = Math.floor(phase);
  let progress = phase - base;
  if (progress < 0) progress += 1;
  return { baseIndex: mod(base, count), progress };
}

// Spring physics simulation — feels alive, natural overshoot, settles organically
function runSpringTween(
  from: number,
  to: number,
  onUpdate: (value: number) => void,
  onComplete: () => void,
  initialVelocity = 0,
  stiffness = 420,
  damping = 38
) {
  let done = false;
  let raf = 0;
  let pos = from;
  // Convert pointer px/ms velocity to phase/s (negative because swipe-left = phase increase)
  let vel = -initialVelocity * DECK_GESTURE.DRAG_SENSITIVITY * 0.001 * 60;
  let lastTime = performance.now();

  const cancel = () => {
    done = true;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };

  const tick = (now: number) => {
    if (done) return;
    const dtRaw = now - lastTime;
    lastTime = now;
    // Sub-step for stability at large dt (e.g. tab backgrounded briefly)
    const steps = Math.ceil(dtRaw / 16);
    const dt = dtRaw / steps / 1000;
    for (let i = 0; i < steps; i++) {
      const force = -stiffness * (pos - to) - damping * vel;
      vel += force * dt;
      pos += vel * dt;
    }

    const settled =
      Math.abs(pos - to) < 0.0008 && Math.abs(vel) < 0.0015;

    if (settled) {
      onUpdate(to);
      cancel();
      onComplete();
      return;
    }

    onUpdate(pos);
    raf = requestAnimationFrame(tick);
  };

  raf = requestAnimationFrame(tick);
  return { cancel };
}

function renderDeckCard(card: PanelCardItem, logicalIndex: number, slot: DeckSlotName) {
  const baseClass = (card.node.props as { className?: string }).className ?? '';
  return React.cloneElement(card.node as ReactElement<Record<string, unknown>>, {
    key: card.key,
    'data-deck-slot': slot,
    'data-deck-index': String(logicalIndex),
    className: `${baseClass} mobile-deck-card`.trim(),
  });
}

function shortestPhaseDelta(from: number, to: number, count: number) {
  if (count <= 0) return 0;
  const fromMod = mod(Math.round(from), count);
  const toMod = mod(to, count);
  let delta = toMod - fromMod;
  if (delta > count / 2) delta -= count;
  if (delta < -count / 2) delta += count;
  return delta;
}

// ---------------------------------------------------------------------------
// Floating card portal — renders the expanded card above everything else
// ---------------------------------------------------------------------------

const FLOAT_SPRING = { type: 'spring', stiffness: 420, damping: 36, mass: 0.8 } as const;
const FLOAT_BACKDROP_TRANSITION = { duration: 0.26, ease: 'easeOut' } as const;

function FloatingCardPortal({
  floating,
  onClose,
}: {
  floating: FloatingState | null;
  onClose: () => void;
}) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const handleDragEnd = useCallback(
    (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      if (!floating) return;
      // Return to deck if dragged near the panel area (top ~240px)
      if (info.point.y < floating.originRect.bottom + 100) {
        onClose();
      }
    },
    [floating, onClose]
  );

  if (!isMounted) return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cardW = Math.min(320, vw - 32);
  const targetX = (vw - cardW) / 2;
  const targetY = Math.round(vh * 0.2);

  return createPortal(
    <AnimatePresence>
      {floating && (
        <>
          {/* Backdrop */}
          <motion.div
            key="floating-backdrop"
            className="floating-card-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={FLOAT_BACKDROP_TRANSITION}
            onTap={onClose}
          />

          {/* Floating card shell */}
          <motion.div
            key="floating-shell"
            className="floating-card-shell"
            style={{ position: 'fixed', top: 0, left: 0 }}
            initial={{
              x: floating.originRect.left,
              y: floating.originRect.top,
              width: floating.originRect.width,
              opacity: 0.72,
              scale: 0.94,
              borderRadius: 14,
            }}
            animate={{
              x: targetX,
              y: targetY,
              width: cardW,
              opacity: 1,
              scale: 1,
              borderRadius: 22,
            }}
            exit={{
              x: floating.originRect.left,
              y: floating.originRect.top,
              width: floating.originRect.width,
              opacity: 0,
              scale: 0.88,
              borderRadius: 14,
            }}
            transition={FLOAT_SPRING}
            drag
            dragMomentum={false}
            dragElastic={0.1}
            onTap={onClose}
            onDragEnd={handleDragEnd}
            whileDrag={{ cursor: 'grabbing' }}
          >
            <div className="floating-card-drag-handle" aria-hidden="true" />
            <div className="floating-card-content">
              {floating.card.node}
            </div>
            <div className="floating-card-return-hint">
              Toca para volver al panel
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}

// ---------------------------------------------------------------------------
// Main circular deck component
// ---------------------------------------------------------------------------

export const MobilePanelCircularDeck = forwardRef<
  MobilePanelDeckHandle,
  {
    cards: PanelCardItem[];
    gridRef: RefObject<HTMLDivElement | null>;
    resetKey: number;
    haptic?: (ms?: number) => void;
  }
>(function MobilePanelCircularDeck(props, ref) {
  const count = props.cards.length;
  const [deckPhase, setDeckPhase] = useState(PROFILE_HOME_INDEX);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [pulseCenterSlot, setPulseCenterSlot] = useState(false);
  const [floatingCard, setFloatingCard] = useState<FloatingState | null>(null);

  const trackRef = useRef<HTMLDivElement | null>(null);
  const centerSlotRef = useRef<HTMLDivElement | null>(null);
  const deckPhaseRef = useRef(PROFILE_HOME_INDEX);
  const dragStartPhaseRef = useRef(PROFILE_HOME_INDEX);
  const stepWidthRef = useRef(92);
  const pointerRef = useRef<{ x: number; y: number; t: number; locked: boolean } | null>(null);
  const didDragRef = useRef(false);
  const animRef = useRef<{ cancel: () => void } | null>(null);
  const reducedMotionRef = useRef(false);
  const lastCenterRef = useRef(PROFILE_HOME_INDEX);
  const floorPhaseRef = useRef(PROFILE_HOME_INDEX);
  // Velocity ring buffer — tracks last 80ms of pointer movement for accurate flick detection
  const velBufferRef = useRef<{ x: number; t: number }[]>([]);

  const setGridRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (props.gridRef) {
        (props.gridRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }
    },
    [props.gridRef]
  );

  const applyDeckPhase = useCallback((phase: number, syncReact: boolean, forceSync = false) => {
    deckPhaseRef.current = phase;
    const { progress } = splitDeckPhase(phase, count);
    const step = stepWidthRef.current;
    const px = -progress * step;
    const ratio = Math.max(-0.5, Math.min(0.5, -progress));

    const track = trackRef.current;
    if (track) {
      track.style.transform = `translate3d(${px}px, 0, 0)`;
      track.style.setProperty('--deck-drag-ratio', ratio.toFixed(4));
      // Subtle 3D tilt — max ±6deg at full drag, gives depth to near cards
      track.style.setProperty('--deck-drag-tilt', `${(ratio * 6).toFixed(2)}deg`);
      track.dataset.deckPhase =
        Math.abs(ratio) < 0.012 ? 'idle' : ratio < 0 ? 'next' : 'prev';
    }

    if (syncReact) {
      const nextFloor = Math.floor(phase + 1e-6);
      if (forceSync || nextFloor !== floorPhaseRef.current) {
        floorPhaseRef.current = nextFloor;
        startTransition(() => {
          setDeckPhase(phase);
        });
      }
    }
  }, [count]);

  const syncDragPhase = useCallback(
    (phase: number) => {
      applyDeckPhase(phase, false);
      const nextFloor = Math.floor(phase + 1e-6);
      if (nextFloor !== floorPhaseRef.current) {
        floorPhaseRef.current = nextFloor;
        startTransition(() => {
          setDeckPhase(phase);
        });
      }
    },
    [applyDeckPhase]
  );

  const stopAnim = useCallback(() => {
    animRef.current?.cancel();
    animRef.current = null;
    setIsAnimating(false);
  }, []);

  const pulseCenter = useCallback(() => {
    setPulseCenterSlot(false);
    requestAnimationFrame(() => {
      setPulseCenterSlot(true);
      window.setTimeout(() => setPulseCenterSlot(false), 360);
    });
  }, []);

  const settleAtPhase = useCallback(
    (targetPhase: number, haptic = true) => {
      // Normalize to [0, count) to prevent phase drift over repeated swipes
      const normalized = count > 0 ? mod(Math.round(targetPhase), count) : 0;
      deckPhaseRef.current = normalized;
      floorPhaseRef.current = normalized;
      applyDeckPhase(normalized, true, true);
      setIsAnimating(false);

      const center = normalized;
      if (center !== lastCenterRef.current) {
        lastCenterRef.current = center;
        if (haptic) props.haptic?.(6);
        pulseCenter();
      }
    },
    [applyDeckPhase, count, props, pulseCenter]
  );

  const animateToPhase = useCallback(
    // durationMs kept for API compatibility but spring physics ignores it
    (targetPhase: number, _durationMs: number, velocity = 0, haptic = true) => {
      stopAnim();
      const from = deckPhaseRef.current;
      if (Math.abs(targetPhase - from) < 0.001) {
        settleAtPhase(targetPhase, haptic);
        return;
      }

      if (reducedMotionRef.current) {
        settleAtPhase(targetPhase, haptic);
        return;
      }

      setIsAnimating(true);
      animRef.current = runSpringTween(
        from,
        targetPhase,
        (phase) => {
          applyDeckPhase(phase, false);
          const nextFloor = Math.floor(phase + 1e-6);
          if (nextFloor !== floorPhaseRef.current) {
            floorPhaseRef.current = nextFloor;
            startTransition(() => {
              setDeckPhase(phase);
            });
          }
        },
        () => settleAtPhase(targetPhase, haptic),
        velocity
      );
    },
    [applyDeckPhase, settleAtPhase, stopAnim]
  );

  const syncStepWidth = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const styles = getComputedStyle(track);
    const step = parseFloat(styles.getPropertyValue('--mobile-deck-step')) || 92;
    if (step > 0) stepWidthRef.current = step;
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => {
      reducedMotionRef.current = mq.matches;
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    syncStepWidth();
    applyDeckPhase(deckPhaseRef.current, false);
    const ro = new ResizeObserver(() => {
      syncStepWidth();
      applyDeckPhase(deckPhaseRef.current, false);
    });
    const track = trackRef.current;
    if (track) ro.observe(track);
    return () => ro.disconnect();
  }, [applyDeckPhase, syncStepWidth, count]);

  useEffect(() => {
    stopAnim();
    deckPhaseRef.current = PROFILE_HOME_INDEX;
    floorPhaseRef.current = PROFILE_HOME_INDEX;
    lastCenterRef.current = PROFILE_HOME_INDEX;
    setDeckPhase(PROFILE_HOME_INDEX);
    applyDeckPhase(PROFILE_HOME_INDEX, true);
  }, [props.resetKey, applyDeckPhase, stopAnim]);

  const focusByIndex = useCallback(
    (index: number) => {
      if (count <= 0) return;
      const target = mod(index, count);
      const delta = shortestPhaseDelta(deckPhaseRef.current, target, count);
      const targetPhase = Math.round(deckPhaseRef.current) + delta;
      animateToPhase(targetPhase, computeSnapDuration(deckPhaseRef.current, targetPhase));
    },
    [animateToPhase, count]
  );

  useImperativeHandle(
    ref,
    () => ({
      focusByKey: (key: string) => {
        const idx = props.cards.findIndex((c) => c.key === key);
        if (idx < 0) return false;
        focusByIndex(idx);
        return true;
      },
      focusByIndex,
      resetHome: () => {
        animateToPhase(PROFILE_HOME_INDEX, computeSnapDuration(deckPhaseRef.current, PROFILE_HOME_INDEX));
      },
    }),
    [focusByIndex, props.cards]
  );

  const slots = useMemo(() => {
    const { baseIndex } = splitDeckPhase(deckPhase, count);
    return SLOT_OFFSETS.map((offset) => {
      const logicalIndex = mod(baseIndex + offset, count);
      const slotName = DECK_SLOT_BY_OFFSET[offset];
      const card = props.cards[logicalIndex];
      return {
        offset,
        slotName,
        logicalIndex,
        card,
        className: `mobile-deck-slot ${DECK_CLASS_BY_OFFSET[offset]}`.trim(),
      };
    });
  }, [count, deckPhase, props.cards]);

  const centerCard = useMemo(() => {
    const { baseIndex } = splitDeckPhase(deckPhase, count);
    return props.cards[baseIndex];
  }, [count, deckPhase, props.cards]);

  const openFloating = useCallback((card: PanelCardItem) => {
    const slotEl = centerSlotRef.current;
    if (!slotEl) return;
    const rect = slotEl.getBoundingClientRect();
    setFloatingCard({ card, originRect: rect });
  }, []);

  const closeFloating = useCallback(() => {
    setFloatingCard(null);
  }, []);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (count <= 1) return;
      if (event.button !== 0) return;
      // Interrupt any ongoing snap immediately — iOS-style: finger always wins
      stopAnim();
      didDragRef.current = false;
      velBufferRef.current = [];
      pointerRef.current = {
        x: event.clientX,
        y: event.clientY,
        t: performance.now(),
        locked: false,
      };
      dragStartPhaseRef.current = deckPhaseRef.current;
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [count, stopAnim]
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const pointer = pointerRef.current;
      if (!pointer) return;

      const dx = event.clientX - pointer.x;
      const dy = event.clientY - pointer.y;

      // Direction not yet confirmed — detect horizontal vs vertical intent
      if (!pointer.locked) {
        if (Math.abs(dx) < DRAG_LOCK_PX && Math.abs(dy) < DRAG_LOCK_PX) return;
        if (Math.abs(dy) > Math.abs(dx) * VERTICAL_CANCEL_RATIO) {
          pointerRef.current = null;
          return;
        }
        pointer.locked = true;
        didDragRef.current = true;
        setIsDragging(true);
        trackRef.current?.classList.add('is-dragging');
      }

      // Velocity ring buffer — keep only last 80ms for accurate flick detection
      const now = performance.now();
      velBufferRef.current.push({ x: event.clientX, t: now });
      velBufferRef.current = velBufferRef.current.filter((p) => now - p.t < 80);

      const step = stepWidthRef.current;
      // True circular deck — no rubber-band, wraps seamlessly in both directions
      const rawPhase = dragPhaseFromPointer(dragStartPhaseRef.current, dx, step);

      syncDragPhase(rawPhase);
    },
    [syncDragPhase]
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const pointer = pointerRef.current;
      if (!pointer) return;

      // Compute velocity from ring buffer (last 80ms window) — more accurate than start→end
      const buf = velBufferRef.current;
      let velocity = 0;
      if (buf.length >= 2) {
        const oldest = buf[0];
        const newest = buf[buf.length - 1];
        const dt = Math.max(1, newest.t - oldest.t);
        velocity = (newest.x - oldest.x) / dt;
      } else {
        const dx = event.clientX - pointer.x;
        const dt = Math.max(8, performance.now() - pointer.t);
        velocity = dx / dt;
      }
      velBufferRef.current = [];

      const dx = event.clientX - pointer.x;
      pointerRef.current = null;
      setIsDragging(false);
      trackRef.current?.classList.remove('is-dragging');

      if (!pointer.locked) return;

      const step = stepWidthRef.current;
      const current = deckPhaseRef.current;
      const start = dragStartPhaseRef.current;

      const target = resolveSwipeTarget(current, start, dx, velocity, step);
      const duration = computeSnapDuration(current, target, velocity);
      animateToPhase(target, duration, velocity);
    },
    [animateToPhase]
  );

  const onPointerCancel = useCallback(() => {
    pointerRef.current = null;
    setIsDragging(false);
    trackRef.current?.classList.remove('is-dragging');
    animateToPhase(Math.round(deckPhaseRef.current), DECK_GESTURE.SNAP_DURATION_MS);
  }, [animateToPhase]);

  const onPeekTap = useCallback(
    (dir: -1 | 1) => {
      if (count <= 1 || isDragging || isAnimating || didDragRef.current) return;
      const target = Math.round(deckPhaseRef.current) + dir;
      animateToPhase(target, computeSnapDuration(deckPhaseRef.current, target));
    },
    [animateToPhase, count, isAnimating, isDragging]
  );

  const onCenterTap = useCallback(() => {
    if (didDragRef.current || isAnimating) return;
    const card = centerCard;
    if (card && FLOATABLE_CARD_KEYS.has(card.key)) {
      openFloating(card);
    }
  }, [centerCard, isAnimating, openFloating]);

  return (
    <>
      <div
        ref={setGridRef}
        className="panel-grid is-circular-deck"
        aria-roledescription="carrusel"
        aria-label={`Panel compacto, ${centerCard?.key ?? 'inicio'}`}
      >
        <div
          ref={trackRef}
          className={`mobile-deck-track${isDragging ? ' is-dragging' : ''}${isAnimating ? ' is-animating' : ''}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          style={{ touchAction: 'none' }}
        >
          {slots.map(({ offset, slotName, logicalIndex, card, className }) => (
            <div
              key={slotName}
              ref={offset === 0 ? centerSlotRef : undefined}
              className={`${className}${offset === 0 && pulseCenterSlot ? ' is-deck-pulse' : ''}${offset === 0 && !isDragging && !isAnimating && !floatingCard ? ' is-deck-settled' : ''}${offset === 0 && card && FLOATABLE_CARD_KEYS.has(card.key) ? ' is-floatable' : ''}`}
              data-deck-slot={slotName}
              onClick={
                offset === -1
                  ? () => onPeekTap(-1)
                  : offset === 1
                    ? () => onPeekTap(1)
                    : offset === 0
                      ? onCenterTap
                      : undefined
              }
              onKeyDown={
                offset === -1 || offset === 1
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onPeekTap(offset === -1 ? -1 : 1);
                      }
                    }
                  : offset === 0
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onCenterTap();
                        }
                      }
                    : undefined
              }
              role={offset !== 0 && (offset === -1 || offset === 1) ? 'button' : undefined}
              tabIndex={offset === -1 || offset === 1 ? 0 : undefined}
              aria-label={
                offset === -1
                  ? 'Card anterior'
                  : offset === 1
                    ? 'Card siguiente'
                    : undefined
              }
            >
              {card ? renderDeckCard(card, logicalIndex, slotName) : null}
            </div>
          ))}
        </div>
        <span className="mobile-deck-sr-only" aria-live="polite">
          {centerCard?.key}
        </span>
      </div>

      <FloatingCardPortal floating={floatingCard} onClose={closeFloating} />
    </>
  );
});
