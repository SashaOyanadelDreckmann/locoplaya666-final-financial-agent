'use client';

import React, {
  forwardRef,
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

import { CardStack, type CardStackItem } from '@/components/ui/card-stack';

export type PanelCardItem = { key: string; node: ReactElement };

export type MobilePanelDeckHandle = {
  focusByKey: (key: string) => boolean;
  focusByIndex: (index: number) => void;
  resetHome: () => void;
};

const PROFILE_HOME_INDEX = 0;

const FLOATABLE_CARD_KEYS = new Set(['objective', 'mode', 'news', 'library']);

const PANEL_CARD_LABELS: Record<string, string> = {
  profile: 'Perfil',
  objective: 'Objetivo',
  mode: 'Modo',
  transactions: 'Transacciones',
  budget: 'Presupuesto',
  interview: 'Entrevista',
  news: 'Noticias',
  library: 'Biblioteca',
  recents: 'Recientes',
};

type FloatingState = {
  card: PanelCardItem;
  originRect: DOMRect;
};

function mod(index: number, count: number) {
  return ((index % count) + count) % count;
}

function useMobileCardStackSize() {
  const [size, setSize] = useState({ width: 300, height: 92 });

  useEffect(() => {
    const compute = () => {
      const vw = window.innerWidth;
      // Wide landscape tiles — most of the viewport width, low height.
      const cardW = Math.round(Math.min(360, Math.max(260, vw * 0.78)));
      const cardH = Math.round(Math.min(100, Math.max(84, cardW * 0.3)));
      setSize({ width: cardW, height: cardH });
    };

    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, []);

  return size;
}

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
          <motion.div
            key="floating-backdrop"
            className="floating-card-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={FLOAT_BACKDROP_TRANSITION}
            onTap={onClose}
          />

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
            <div className="floating-card-content">{floating.card.node}</div>
            <div className="floating-card-return-hint">Toca para volver al panel</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}

function renderStackCard(card: PanelCardItem, active: boolean) {
  const baseClass = (card.node.props as { className?: string }).className ?? '';
  return (
    <div
      className={`mobile-panel-stack-card${active && FLOATABLE_CARD_KEYS.has(card.key) ? ' is-floatable' : ''}`}
      data-panel-card-key={card.key}
    >
      {React.cloneElement(card.node as ReactElement<Record<string, unknown>>, {
        key: card.key,
        className: `${baseClass} mobile-stack-card-inner`.trim(),
      })}
    </div>
  );
}

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
  const [activeIndex, setActiveIndex] = useState(PROFILE_HOME_INDEX);
  const [floatingCard, setFloatingCard] = useState<FloatingState | null>(null);
  const lastCenterRef = useRef(PROFILE_HOME_INDEX);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const cardSize = useMobileCardStackSize();

  const setGridRef = useCallback(
    (node: HTMLDivElement | null) => {
      stageRef.current = node;
      if (props.gridRef) {
        (props.gridRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }
    },
    [props.gridRef]
  );

  useEffect(() => {
    setActiveIndex(PROFILE_HOME_INDEX);
    lastCenterRef.current = PROFILE_HOME_INDEX;
  }, [props.resetKey]);

  const stackItems = useMemo<CardStackItem[]>(
    () =>
      props.cards.map((card) => ({
        id: card.key,
        title: PANEL_CARD_LABELS[card.key] ?? card.key,
      })),
    [props.cards]
  );

  const cardByKey = useMemo(() => {
    const map = new Map<string, PanelCardItem>();
    props.cards.forEach((card) => map.set(card.key, card));
    return map;
  }, [props.cards]);

  const focusByIndex = useCallback(
    (index: number) => {
      if (count <= 0) return;
      setActiveIndex(mod(index, count));
    },
    [count]
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
        focusByIndex(PROFILE_HOME_INDEX);
      },
    }),
    [focusByIndex, props.cards]
  );

  const openFloating = useCallback((card: PanelCardItem) => {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    setFloatingCard({ card, originRect: rect });
  }, []);

  const closeFloating = useCallback(() => {
    setFloatingCard(null);
  }, []);

  const handleChangeIndex = useCallback(
    (index: number) => {
      setActiveIndex(index);
      if (index !== lastCenterRef.current) {
        lastCenterRef.current = index;
        props.haptic?.(6);
      }
    },
    [props]
  );

  const handleCardActivate = useCallback(
    (_index: number, item: CardStackItem, wasAlreadyActive: boolean) => {
      if (!wasAlreadyActive) return;
      if (!FLOATABLE_CARD_KEYS.has(String(item.id))) return;
      const card = cardByKey.get(String(item.id));
      if (card) openFloating(card);
    },
    [cardByKey, openFloating]
  );

  const centerKey = stackItems[activeIndex]?.id ?? 'profile';

  return (
    <>
      <div
        ref={setGridRef}
        className="panel-grid is-card-stack"
        aria-roledescription="carrusel"
        aria-label={`Panel compacto, ${centerKey}`}
      >
        <CardStack
          items={stackItems}
          index={activeIndex}
          onChangeIndex={handleChangeIndex}
          onCardActivate={handleCardActivate}
          maxVisible={5}
          cardWidth={cardSize.width}
          cardHeight={cardSize.height}
          stageMinHeight={cardSize.height}
          stagePaddingPx={0}
          stageOffsetX={36}
          overlap={0.48}
          spreadDeg={20}
          perspectivePx={900}
          depthPx={36}
          tiltXDeg={3}
          activeLiftPx={8}
          activeScale={1.015}
          inactiveScale={0.88}
          springStiffness={300}
          springDamping={30}
          loop
          showDots={false}
          showSpotlight={false}
          className="mobile-panel-card-stack"
          cardClassName="mobile-panel-stack-shell"
          renderCard={(item, state) => {
            const card = cardByKey.get(String(item.id));
            if (!card) return null;
            return renderStackCard(card, state.active);
          }}
        />
        <span className="mobile-deck-sr-only" aria-live="polite">
          {centerKey}
        </span>
      </div>

      <FloatingCardPortal floating={floatingCard} onClose={closeFloating} />
    </>
  );
});
