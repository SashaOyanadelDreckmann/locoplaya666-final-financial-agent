'use client';

import React, {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as THREE from 'three';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { cn } from '@/lib/compartido/utils';

const ASCII_CHARS =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789(){}[]<>;:,._-+=!@#$%^&*|\\/\"\'`~?';
const TRANSITION_CODE_CHARS = '0123456789';
const TRANSITION_CODE_SYMBOLS = ':;.,|/+-=*#';
const ASCII_LINE_HEIGHT = 10;
/** Measured ratio for ui-monospace / Menlo at small sizes (1ch < 1em). */
const QUIET_MONO_CHAR_WIDTH_RATIO = 0.6;

function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function generateCode(width: number, height: number): string {
  let text = '';
  for (let i = 0; i < width * height; i += 1) {
    text += ASCII_CHARS[Math.floor(Math.random() * ASCII_CHARS.length)];
  }
  let out = '';
  for (let i = 0; i < height; i += 1) {
    out += `${text.substring(i * width, (i + 1) * width)}\n`;
  }
  return out;
}

function generateTransitionCode(width: number, height: number): string {
  const pool = `${TRANSITION_CODE_CHARS}${TRANSITION_CODE_SYMBOLS}`;
  let text = '';
  for (let i = 0; i < width * height; i += 1) {
    const useDigit = Math.random() < 0.74;
    text += useDigit
      ? TRANSITION_CODE_CHARS[Math.floor(Math.random() * TRANSITION_CODE_CHARS.length)]
      : pool[Math.floor(Math.random() * pool.length)];
  }
  let out = '';
  for (let i = 0; i < height; i += 1) {
    out += `${text.substring(i * width, (i + 1) * width)}\n`;
  }
  return out;
}

function generateSeededCode(width: number, height: number, seed: string): string {
  const pool = `${seed}|${ASCII_CHARS}`;
  let state = hashString(seed || 'card');
  let out = '';
  for (let row = 0; row < height; row += 1) {
    let line = '';
    for (let col = 0; col < width; col += 1) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      line += pool[state % pool.length] ?? '.';
    }
    out += `${line}\n`;
  }
  return out;
}

export type ScannerStreamCard = {
  id: string | number;
  surfaceStyle?: Record<string, string>;
  codeSeed?: string;
};

export type ScannerCardStreamProps<T extends ScannerStreamCard> = {
  items: T[];
  activeIndex?: number;
  onActiveIndexChange?: (index: number) => void;
  renderCard: (item: T, index: number, isFocused: boolean) => ReactNode;
  className?: string;
  prefersReducedMotion?: boolean;
  initialSpeed?: number;
  direction?: -1 | 1;
  repeat?: number;
  friction?: number;
  scanEffect?: 'clip' | 'scramble';
  showNav?: boolean;
  navStatusLabel?: (active: number, total: number) => string;
  /** Stable carousel: no auto-scroll or heavy particles; scanner clip on transitions only */
  quietMode?: boolean;
  /** Fraction of container width used for card width (default 0.58) */
  cardWidthRatio?: number;
  /** Card height as a fraction of card width (default 0.625) */
  cardHeightRatio?: number;
  /** Hard cap for card width in px */
  maxCardWidth?: number;
};

type ScannerMetrics = {
  containerWidth: number;
  cardWidth: number;
  cardHeight: number;
  stageHeight: number;
  cardGap: number;
};

function canUseWebGl(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl') ?? canvas.getContext('experimental-webgl'));
  } catch {
    return false;
  }
}

function isInteractiveDragTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      'button, a, input, textarea, select, label, [role="button"], [contenteditable="true"], [data-scanner-no-drag]',
    ),
  );
}

function deriveMetrics(
  containerWidth: number,
  cardWidthRatio = 0.58,
  compactStage = false,
  cardHeightRatio = 0.625,
  maxCardWidth?: number,
): ScannerMetrics {
  const safeWidth = Math.max(240, containerWidth);
  const widthCap = maxCardWidth ?? safeWidth - 24;
  const cardWidth = Math.max(140, Math.min(widthCap, Math.round(safeWidth * cardWidthRatio)));
  const cardHeight = Math.round(cardWidth * cardHeightRatio);
  const cardGap = Math.max(10, Math.round(cardWidth * 0.09));
  const stageHeight = compactStage ? cardHeight : cardHeight + 28;
  return { containerWidth: safeWidth, cardWidth, cardHeight, stageHeight, cardGap };
}

function deriveAsciiGrid(cardWidth: number, cardHeight: number) {
  const asciiWidth = Math.max(18, Math.floor(cardWidth / 6.5));
  const asciiHeight = Math.max(10, Math.ceil(cardHeight / ASCII_LINE_HEIGHT));
  return { asciiWidth, asciiHeight };
}

function deriveQuietAsciiLayout(cardWidth: number, cardHeight: number) {
  const asciiHeight = Math.max(10, Math.floor(cardHeight / ASCII_LINE_HEIGHT));
  const lineHeight = cardHeight / asciiHeight;
  const asciiWidth = Math.max(
    32,
    Math.min(96, Math.round(cardWidth / (5.25 * QUIET_MONO_CHAR_WIDTH_RATIO))),
  );
  const fontSize = cardWidth / (asciiWidth * QUIET_MONO_CHAR_WIDTH_RATIO);
  return { asciiWidth, asciiHeight, fontSize, lineHeight };
}

function syncQuietAsciiContentSize(
  asciiContent: HTMLElement,
  cardWidth: number,
  cardHeight: number,
  regenerate = true,
) {
  const layout = deriveQuietAsciiLayout(cardWidth, cardHeight);
  asciiContent.style.transform = 'none';
  asciiContent.style.width = `${cardWidth}px`;
  asciiContent.style.height = `${cardHeight}px`;
  asciiContent.style.fontSize = `${layout.fontSize}px`;
  asciiContent.style.lineHeight = `${layout.lineHeight}px`;
  if (regenerate) {
    asciiContent.textContent = generateTransitionCode(layout.asciiWidth, layout.asciiHeight);
  }

  const applyScale = () => {
    const naturalWidth = asciiContent.scrollWidth;
    const naturalHeight = asciiContent.scrollHeight;
    const scaleX = naturalWidth > 0 ? cardWidth / naturalWidth : 1;
    const scaleY = naturalHeight > 0 ? cardHeight / naturalHeight : 1;

    if (Math.abs(scaleX - 1) > 0.015 || Math.abs(scaleY - 1) > 0.015) {
      asciiContent.style.transform = `scale(${scaleX}, ${scaleY})`;
      asciiContent.style.transformOrigin = 'top left';
    } else {
      asciiContent.style.removeProperty('transform');
    }
  };

  if (typeof window !== 'undefined') {
    window.requestAnimationFrame(applyScale);
  } else {
    applyScale();
  }
}

function clearQuietAsciiInlineStyles(asciiContent: HTMLElement | null | undefined) {
  if (!asciiContent) return;
  asciiContent.style.removeProperty('transform');
  asciiContent.style.removeProperty('width');
  asciiContent.style.removeProperty('height');
  asciiContent.style.removeProperty('font-size');
  asciiContent.style.removeProperty('line-height');
}

export function ScannerCardStream<T extends ScannerStreamCard>({
  items,
  activeIndex = 0,
  onActiveIndexChange,
  renderCard,
  className,
  prefersReducedMotion = false,
  initialSpeed = 72,
  direction = -1,
  repeat,
  friction = 0.95,
  scanEffect = 'scramble',
  showNav = true,
  navStatusLabel,
  quietMode = false,
  cardWidthRatio = 0.58,
  cardHeightRatio = 0.625,
  maxCardWidth,
}: ScannerCardStreamProps<T>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const cardLineRef = useRef<HTMLDivElement>(null);
  const particleCanvasRef = useRef<HTMLCanvasElement>(null);
  const scannerCanvasRef = useRef<HTMLCanvasElement>(null);
  const originalAscii = useRef(new Map<number, string>());
  const streamId = useId().replace(/:/g, '');

  const [metrics, setMetrics] = useState<ScannerMetrics>(() =>
    deriveMetrics(320, cardWidthRatio, quietMode, cardHeightRatio, maxCardWidth),
  );
  const [isScanning, setIsScanning] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isSettling, setIsSettling] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(activeIndex);

  const quietAsciiLayout = useMemo(
    () => (quietMode ? deriveQuietAsciiLayout(metrics.cardWidth, metrics.cardHeight) : null),
    [metrics.cardHeight, metrics.cardWidth, quietMode],
  );

  const itemCount = items.length;
  const loopRepeat = quietMode
    ? 1
    : (repeat ?? (itemCount <= 1 ? 1 : itemCount <= 4 ? 3 : 2));

  const streamCards = useMemo(() => {
    if (itemCount === 0) return [];
    const totalCards = itemCount * loopRepeat;
    const asciiGrid = quietAsciiLayout ?? deriveAsciiGrid(metrics.cardWidth, metrics.cardHeight);
    const { asciiWidth, asciiHeight } = asciiGrid;
    return Array.from({ length: totalCards }, (_, i) => {
      const item = items[i % itemCount];
      const seed = item.codeSeed ?? String(item.id);
      return {
        streamId: i,
        sourceIndex: i % itemCount,
        item,
        ascii: quietMode
          ? generateSeededCode(asciiWidth, asciiHeight, seed)
          : generateCode(asciiWidth, asciiHeight),
      };
    });
  }, [itemCount, items, loopRepeat, metrics.cardHeight, metrics.cardWidth, quietAsciiLayout, quietMode]);

  const cardStreamState = useRef({
    position: 0,
    velocity: 0,
    direction,
    isDragging: false,
    lastMouseX: 0,
    lastTime: performance.now(),
    cardLineWidth: 0,
    friction,
    metricsKey: '',
    morphVelocity: 0,
  });

  const scannerState = useRef({ isScanning: false });
  const transitionRef = useRef({ isAnimating: false, snapFrameId: 0 });
  const isSettlingRef = useRef(false);
  const animateToIndexRef = useRef<(sourceIndex: number, onComplete?: () => void) => void>(() => {});
  const updateCardEffectsRef = useRef<(() => void) | null>(null);

  const cancelSnapAnimation = useCallback(() => {
    if (transitionRef.current.snapFrameId) {
      window.cancelAnimationFrame(transitionRef.current.snapFrameId);
      transitionRef.current.snapFrameId = 0;
    }
    transitionRef.current.isAnimating = false;
  }, []);

  const getScannerX = useCallback(() => {
    const width = rootRef.current?.offsetWidth ?? metrics.containerWidth;
    return width / 2;
  }, [metrics.containerWidth]);

  const getCardStep = useCallback(
    () => metrics.cardWidth + metrics.cardGap,
    [metrics.cardGap, metrics.cardWidth],
  );

  const getTargetPositionForIndex = useCallback(
    (sourceIndex: number) => {
      const container = rootRef.current;
      if (!container || itemCount === 0) return 0;
      const cardStep = getCardStep();
      const scannerX = container.offsetWidth / 2;
      const baseIndex = Math.max(0, Math.min(itemCount - 1, sourceIndex));
      const targetStreamIndex = quietMode ? baseIndex : itemCount + baseIndex;
      const cardCenter = targetStreamIndex * cardStep + metrics.cardWidth / 2;
      return scannerX - cardCenter;
    },
    [getCardStep, itemCount, metrics.cardWidth, quietMode],
  );

  const applyCarouselPosition = useCallback(
    (sourceIndex: number) => {
      const cardLine = cardLineRef.current;
      if (!cardLine || itemCount === 0) return;
      const nextPosition = getTargetPositionForIndex(sourceIndex);
      cardStreamState.current.position = nextPosition;
      cardStreamState.current.velocity = 0;
      cardLine.style.transform = `translateX(${nextPosition}px)`;
      setFocusedIndex(Math.max(0, Math.min(itemCount - 1, sourceIndex)));
    },
    [getTargetPositionForIndex, itemCount],
  );

  const centerOnSourceIndex = useCallback(
    (sourceIndex: number, immediate = false) => {
      if (itemCount === 0) return;

      const baseIndex = Math.max(0, Math.min(itemCount - 1, sourceIndex));
      if (quietMode && !immediate && !prefersReducedMotion) {
        animateToIndexRef.current(baseIndex);
        return;
      }

      applyCarouselPosition(baseIndex);
      window.requestAnimationFrame(() => updateCardEffectsRef.current?.());
    },
    [applyCarouselPosition, itemCount, prefersReducedMotion, quietMode],
  );

  const resolveFocusedSourceIndex = useCallback(() => {
    const cardLine = cardLineRef.current;
    const container = rootRef.current;
    if (!cardLine || !container || itemCount === 0) return 0;

    const scannerX = container.offsetWidth / 2;
    const cardStep = getCardStep();
    const position = cardStreamState.current.position;

    if (quietMode) {
      const raw = (scannerX - position - metrics.cardWidth / 2) / cardStep;
      return Math.max(0, Math.min(itemCount - 1, Math.round(raw)));
    }

    let closestIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;

    streamCards.forEach((card, streamIndex) => {
      const cardLeft = position + streamIndex * cardStep;
      const cardCenter = cardLeft + metrics.cardWidth / 2;
      const distance = Math.abs(cardCenter - scannerX);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = card.sourceIndex;
      }
    });

    return closestIndex;
  }, [getCardStep, itemCount, metrics.cardWidth, quietMode, streamCards]);

  const goToRelative = useCallback(
    (delta: number) => {
      if (itemCount === 0) return;
      const nextIndex = (focusedIndex + delta + itemCount) % itemCount;
      if (quietMode && !prefersReducedMotion) {
        animateToIndexRef.current(nextIndex, () => onActiveIndexChange?.(nextIndex));
        return;
      }
      centerOnSourceIndex(nextIndex, true);
      onActiveIndexChange?.(nextIndex);
    },
    [centerOnSourceIndex, focusedIndex, itemCount, onActiveIndexChange, prefersReducedMotion, quietMode],
  );

  useEffect(() => {
    const node = rootRef.current;
    if (!node) return undefined;

    const updateMetrics = () => {
      const width = node.offsetWidth;
      if (width <= 0) return;
      setMetrics(deriveMetrics(width, cardWidthRatio, quietMode, cardHeightRatio, maxCardWidth));
    };

    updateMetrics();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateMetrics);
      observer.observe(node);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', updateMetrics);
    return () => window.removeEventListener('resize', updateMetrics);
  }, [cardHeightRatio, cardWidthRatio, maxCardWidth, quietMode]);

  useLayoutEffect(() => {
    if (!quietMode || itemCount === 0) return;
    const container = rootRef.current;
    if (!container || container.offsetWidth <= 0) return;
    applyCarouselPosition(activeIndex);
    updateCardEffectsRef.current?.();
  }, [activeIndex, applyCarouselPosition, itemCount, metrics.cardGap, metrics.cardWidth, metrics.containerWidth, metrics.stageHeight, quietMode]);

  useEffect(() => {
    if (itemCount === 0 || quietMode) return;
    centerOnSourceIndex(activeIndex, true);
  }, [activeIndex, centerOnSourceIndex, itemCount, metrics.cardGap, metrics.cardWidth, quietMode]);

  useEffect(() => {
    const cardLine = cardLineRef.current;
    const container = rootRef.current;
    if (!cardLine || !container || itemCount === 0) return undefined;

    streamCards.forEach((card) => originalAscii.current.set(card.streamId, card.ascii));

    const metricsKey = `${metrics.cardWidth}x${metrics.cardHeight}x${metrics.cardGap}`;
    if (cardStreamState.current.metricsKey !== metricsKey) {
      cardStreamState.current.metricsKey = metricsKey;
      cardStreamState.current.cardLineWidth = getCardStep() * streamCards.length;
      centerOnSourceIndex(activeIndex, true);
    }

    let quietScrambleTimer: number | null = null;

    const resetCardClipsToNormal = () => {
      cardLine.querySelectorAll<HTMLElement>('.tx-scanner-card-wrapper').forEach((wrapper) => {
        const normalCard = wrapper.querySelector<HTMLElement>('.tx-scanner-card-normal');
        const asciiCard = wrapper.querySelector<HTMLElement>('.tx-scanner-card-ascii');
        const asciiContent = asciiCard?.querySelector<HTMLElement>('pre');
        wrapper.style.removeProperty('--scan-split');
        wrapper.style.removeProperty('--scan-softness');
        wrapper.style.removeProperty('--scan-soft-half');
        wrapper.style.removeProperty('--card-focus-scale');
        wrapper.style.removeProperty('--morph-beam-opacity');
        delete wrapper.dataset.morphState;
        if (normalCard) {
          normalCard.style.removeProperty('--clip-right');
          normalCard.style.removeProperty('--scan-split');
          normalCard.style.removeProperty('--morph-blur');
          normalCard.style.removeProperty('opacity');
          normalCard.style.removeProperty('visibility');
        }
        if (asciiCard) {
          asciiCard.style.removeProperty('--clip-left');
          asciiCard.style.removeProperty('--scan-split');
          asciiCard.style.removeProperty('--code-mix');
          asciiCard.style.removeProperty('opacity');
        }
        if (asciiContent) {
          const streamId = Number(wrapper.dataset.streamId || '0');
          asciiContent.textContent = originalAscii.current.get(streamId) || '';
          clearQuietAsciiInlineStyles(asciiContent);
        }
        delete wrapper.dataset.scanned;
      });
      container.style.removeProperty('--scanner-center-x');
    };

    const settleQuietCarousel = () => {
      if (quietScrambleTimer !== null) {
        window.clearInterval(quietScrambleTimer);
        quietScrambleTimer = null;
      }
      if (isSettlingRef.current) return;
      if (quietMode && !prefersReducedMotion) {
        isSettlingRef.current = true;
        setIsSettling(true);
        window.setTimeout(() => {
          resetCardClipsToNormal();
          rootRef.current?.removeAttribute('data-transitioning');
          setIsSettling(false);
          isSettlingRef.current = false;
          setIsTransitioning(false);
          setIsScanning(false);
          scannerState.current.isScanning = false;
        }, 520);
        return;
      }
      resetCardClipsToNormal();
      rootRef.current?.removeAttribute('data-transitioning');
      setIsScanning(false);
      setIsTransitioning(false);
      scannerState.current.isScanning = false;
    };

    const tickQuietScramble = () => {
      if (!cardLine || prefersReducedMotion) return;
      cardLine.querySelectorAll<HTMLElement>('.tx-scanner-card-wrapper').forEach((wrapper) => {
        if (wrapper.dataset.morphState !== 'code') return;
        const asciiContent = wrapper.querySelector<HTMLElement>('.tx-scanner-ascii-content');
        if (!asciiContent) return;
        const cardHeight = wrapper.clientHeight || metrics.cardHeight;
        const cardWidth = wrapper.clientWidth || metrics.cardWidth;
        syncQuietAsciiContentSize(asciiContent, cardWidth, cardHeight);
      });
    };

    const startQuietScramble = () => {
      if (!quietMode || prefersReducedMotion) return;
      if (quietScrambleTimer !== null) {
        window.clearInterval(quietScrambleTimer);
      }
      tickQuietScramble();
      quietScrambleTimer = window.setInterval(tickQuietScramble, 46);
    };

    const beginQuietTransition = () => {
      if (!quietMode) return;
      rootRef.current?.setAttribute('data-transitioning', 'true');
      setIsTransitioning(true);
      setIsScanning(true);
      startQuietScramble();
    };

    const runScrambleEffect = (element: HTMLElement, cardId: number) => {
      if (prefersReducedMotion || element.dataset.scrambling === 'true') return;
      element.dataset.scrambling = 'true';
      const originalText = originalAscii.current.get(cardId) || '';
      const { asciiWidth, asciiHeight } = deriveAsciiGrid(metrics.cardWidth, metrics.cardHeight);
      let scrambleCount = 0;
      const maxScrambles = quietMode ? 5 : 8;
      const interval = window.setInterval(() => {
        element.textContent = generateCode(asciiWidth, asciiHeight);
        scrambleCount += 1;
        if (scrambleCount >= maxScrambles) {
          window.clearInterval(interval);
          element.textContent = originalText;
          delete element.dataset.scrambling;
        }
      }, quietMode ? 42 : 30);
    };

    const applyQuietMorph = (
      wrapper: HTMLElement,
      normalCard: HTMLElement,
      asciiCard: HTMLElement | null,
      asciiContent: HTMLElement | null,
      cardLeft: number,
      cardWidth: number,
      scannerX: number,
    ) => {
      const root = container.closest('.tx-scanner-stream-root');
      const morphActive =
        transitionRef.current.isAnimating ||
        cardStreamState.current.isDragging ||
        root?.classList.contains('is-transitioning') === true ||
        root?.getAttribute('data-transitioning') === 'true';
      const settling = root?.classList.contains('is-settling') === true;
      const streamId = Number(wrapper.dataset.streamId || '0');
      const cardRight = cardLeft + cardWidth;
      const containerWidth = container.offsetWidth;
      const isVisible = cardRight > -8 && cardLeft < containerWidth + 8;

      if (settling) {
        const hit = wrapper.querySelector('.tx-scanner-card-hit');
        const isFocusedHit = hit?.classList.contains('is-focused') ?? false;
        if (!isFocusedHit) {
          wrapper.dataset.morphState = 'normal';
          wrapper.style.removeProperty('--scan-split');
          wrapper.style.removeProperty('--card-focus-scale');
          normalCard.style.removeProperty('opacity');
          normalCard.style.removeProperty('visibility');
          normalCard.style.removeProperty('--morph-blur');
          normalCard.style.removeProperty('--scan-split');
          asciiCard?.style.removeProperty('--scan-split');
          asciiCard?.style.setProperty('--code-mix', '0');
          return 0;
        }
        wrapper.dataset.morphState = 'settling';
        wrapper.style.removeProperty('--scan-split');
        wrapper.style.removeProperty('--card-focus-scale');
        normalCard.style.removeProperty('--morph-blur');
        normalCard.style.removeProperty('--scan-split');
        asciiCard?.style.removeProperty('--scan-split');
        asciiCard?.style.setProperty('--code-mix', '0.82');
        if (asciiContent) {
          asciiContent.textContent = originalAscii.current.get(streamId) || '';
        }
        return 100;
      }

      if (morphActive && isVisible) {
        wrapper.dataset.morphState = 'code';
        wrapper.style.removeProperty('--card-focus-scale');
        wrapper.style.removeProperty('--scan-split');
        normalCard.style.setProperty('opacity', '0');
        normalCard.style.setProperty('visibility', 'hidden');
        normalCard.style.removeProperty('--clip-right');
        normalCard.style.removeProperty('--scan-split');
        normalCard.style.removeProperty('--morph-blur');
        asciiCard?.style.removeProperty('--clip-left');
        asciiCard?.style.removeProperty('--scan-split');
        asciiCard?.style.setProperty('--code-mix', '0.82');
        if (asciiContent) {
          syncQuietAsciiContentSize(
            asciiContent,
            cardWidth,
            wrapper.clientHeight || metrics.cardHeight,
          );
        }
        return 100;
      }

      wrapper.dataset.morphState = 'normal';
      wrapper.style.removeProperty('--scan-split');
      wrapper.style.removeProperty('--card-focus-scale');
      normalCard.style.removeProperty('opacity');
      normalCard.style.removeProperty('visibility');
      normalCard.style.removeProperty('--morph-blur');
      normalCard.style.removeProperty('--scan-split');
      normalCard.style.removeProperty('--clip-right');
      asciiCard?.style.removeProperty('--scan-split');
      asciiCard?.style.removeProperty('--clip-left');
      asciiCard?.style.setProperty('--code-mix', '0');
      if (asciiContent) {
        const streamId = Number(wrapper.dataset.streamId || '0');
        asciiContent.textContent = originalAscii.current.get(streamId) || '';
        clearQuietAsciiInlineStyles(asciiContent);
      }
      return 0;
    };

    const updateCardEffects = () => {
      const nextIndex = resolveFocusedSourceIndex();
      setFocusedIndex(nextIndex);

      const draggingOrAnimating =
        cardStreamState.current.isDragging || transitionRef.current.isAnimating;

      if (quietMode && !draggingOrAnimating && !isSettlingRef.current) {
        settleQuietCarousel();
        return;
      }

      if (quietMode) {
        setIsTransitioning(true);
      }

      const scannerX = getScannerX();
      if (quietMode) {
        container.style.setProperty('--scanner-center-x', `${scannerX}px`);
      }

      const scannerWidth = quietMode ? 0 : 6;
      const scannerLeft = scannerX - scannerWidth / 2;
      const scannerRight = scannerX + scannerWidth / 2;
      let anyCardIsScanning = false;

      cardLine.querySelectorAll<HTMLElement>('.tx-scanner-card-wrapper').forEach((wrapper) => {
        const rect = wrapper.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const cardLeft = rect.left - containerRect.left;
        const cardRight = rect.right - containerRect.left;
        const cardWidth = rect.width;
        const normalCard = wrapper.querySelector<HTMLElement>('.tx-scanner-card-normal');
        const asciiCard = wrapper.querySelector<HTMLElement>('.tx-scanner-card-ascii');
        const asciiContent = asciiCard?.querySelector<HTMLElement>('pre');

        if (!normalCard) return;

        if (quietMode) {
          applyQuietMorph(
            wrapper,
            normalCard,
            asciiCard,
            asciiContent ?? null,
            cardLeft,
            cardWidth,
            scannerX,
          );
          if (wrapper.dataset.morphState === 'code' || wrapper.dataset.morphState === 'settling') {
            anyCardIsScanning = true;
          }
          return;
        }

        if (!asciiCard || !asciiContent) return;

        if (cardLeft < scannerRight && cardRight > scannerLeft) {
          anyCardIsScanning = true;
          const streamId = Number(wrapper.dataset.streamId || '0');
          if (scanEffect === 'scramble' && wrapper.dataset.scanned !== 'true') {
            runScrambleEffect(asciiContent, streamId);
          }
          wrapper.dataset.scanned = 'true';
          const intersectLeft = Math.max(scannerLeft - cardLeft, 0);
          const intersectRight = Math.min(scannerRight - cardLeft, cardWidth);
          normalCard.style.setProperty('--clip-right', `${(intersectLeft / cardWidth) * 100}%`);
          asciiCard.style.setProperty('--clip-left', `${(intersectRight / cardWidth) * 100}%`);
        } else {
          delete wrapper.dataset.scanned;
          if (cardRight < scannerLeft) {
            normalCard.style.setProperty('--clip-right', '100%');
            asciiCard.style.setProperty('--clip-left', '100%');
          } else {
            normalCard.style.setProperty('--clip-right', '0%');
            asciiCard.style.setProperty('--clip-left', '0%');
          }
        }
      });

      const showScanLine = quietMode ? false : anyCardIsScanning;
      setIsScanning(showScanLine);
      scannerState.current.isScanning = showScanLine;
    };

    updateCardEffectsRef.current = updateCardEffects;

    animateToIndexRef.current = (sourceIndex: number, onComplete?: () => void) => {
      cancelSnapAnimation();
      const baseIndex = Math.max(0, Math.min(itemCount - 1, sourceIndex));
      const targetPosition = getTargetPositionForIndex(baseIndex);

      if (prefersReducedMotion) {
        cardStreamState.current.position = targetPosition;
        cardLine.style.transform = `translateX(${targetPosition}px)`;
        setFocusedIndex(baseIndex);
        settleQuietCarousel();
        onComplete?.();
        return;
      }

      const start = cardStreamState.current.position;
      const startTime = performance.now();
      const duration = quietMode ? 860 : 480;
      transitionRef.current.isAnimating = true;
      beginQuietTransition();

      const tick = (now: number) => {
        const progress = Math.min(1, (now - startTime) / duration);
        const eased = quietMode
          ? 1 - (1 - progress) ** 3.1
          : 1 - (1 - progress) ** 3;
        const prevPosition = cardStreamState.current.position;
        const nextPosition = start + (targetPosition - start) * eased;
        cardStreamState.current.morphVelocity = Math.abs(nextPosition - prevPosition);
        cardStreamState.current.position = nextPosition;
        cardLine.style.transform = `translateX(${nextPosition}px)`;
        updateCardEffects();

        if (progress < 1) {
          transitionRef.current.snapFrameId = window.requestAnimationFrame(tick);
          return;
        }

        transitionRef.current.snapFrameId = 0;
        transitionRef.current.isAnimating = false;
        cardStreamState.current.position = targetPosition;
        cardLine.style.transform = `translateX(${targetPosition}px)`;
        setFocusedIndex(baseIndex);
        settleQuietCarousel();
        onComplete?.();
      };

      transitionRef.current.snapFrameId = window.requestAnimationFrame(tick);
    };

    const handleMouseDown = (event: MouseEvent | TouchEvent) => {
      if ('button' in event && event.button !== 0) return;
      if (isInteractiveDragTarget(event.target)) return;
      event.preventDefault();
      cancelSnapAnimation();
      if (quietMode) beginQuietTransition();
      const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
      cardStreamState.current.isDragging = true;
      cardStreamState.current.lastMouseX = clientX;
      cardStreamState.current.lastTime = performance.now();
      const transform = window.getComputedStyle(cardLine).transform;
      if (transform !== 'none') {
        const matrix = new DOMMatrix(transform);
        cardStreamState.current.position = matrix.m41;
      }
    };

    const handleMouseMove = (event: MouseEvent | TouchEvent) => {
      if (!cardStreamState.current.isDragging) return;
      event.preventDefault();
      const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
      const deltaX = clientX - cardStreamState.current.lastMouseX;
      cardStreamState.current.morphVelocity = Math.abs(deltaX);
      cardStreamState.current.position += deltaX;
      cardStreamState.current.lastMouseX = clientX;
      cardLine.style.transform = `translateX(${cardStreamState.current.position}px)`;
      updateCardEffects();
    };

    const handleMouseUp = () => {
      if (!cardStreamState.current.isDragging) return;
      cardStreamState.current.isDragging = false;
      cardStreamState.current.velocity = 0;
      const nextIndex = resolveFocusedSourceIndex();
      if (quietMode && !prefersReducedMotion) {
        animateToIndexRef.current(nextIndex, () => onActiveIndexChange?.(nextIndex));
        return;
      }
      centerOnSourceIndex(nextIndex, true);
      onActiveIndexChange?.(nextIndex);
    };

    let wheelSnapTimer: number | null = null;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      cancelSnapAnimation();
      if (quietMode) beginQuietTransition();
      const scrollSpeed = 16;
      const delta = event.deltaY > 0 ? scrollSpeed : -scrollSpeed;
      cardStreamState.current.position += delta;
      cardLine.style.transform = `translateX(${cardStreamState.current.position}px)`;
      updateCardEffects();
      if (wheelSnapTimer !== null) window.clearTimeout(wheelSnapTimer);
      wheelSnapTimer = window.setTimeout(() => {
        wheelSnapTimer = null;
        const nextIndex = resolveFocusedSourceIndex();
        if (quietMode && !prefersReducedMotion) {
          animateToIndexRef.current(nextIndex, () => onActiveIndexChange?.(nextIndex));
          return;
        }
        setFocusedIndex(nextIndex);
        onActiveIndexChange?.(nextIndex);
      }, 140);
    };

    cardLine.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    cardLine.addEventListener('touchstart', handleMouseDown, { passive: false });
    window.addEventListener('touchmove', handleMouseMove, { passive: false });
    window.addEventListener('touchend', handleMouseUp);
    cardLine.addEventListener('wheel', handleWheel, { passive: false });

    if (quietMode) {
      window.requestAnimationFrame(() => {
        settleQuietCarousel();
        updateCardEffects();
      });
      return () => {
        if (wheelSnapTimer !== null) window.clearTimeout(wheelSnapTimer);
        if (quietScrambleTimer !== null) window.clearInterval(quietScrambleTimer);
        cancelSnapAnimation();
        updateCardEffectsRef.current = null;
        animateToIndexRef.current = () => {};
        cardLine.removeEventListener('mousedown', handleMouseDown);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        cardLine.removeEventListener('touchstart', handleMouseDown);
        window.removeEventListener('touchmove', handleMouseMove);
        window.removeEventListener('touchend', handleMouseUp);
        cardLine.removeEventListener('wheel', handleWheel);
      };
    }

    const particleCanvas = particleCanvasRef.current;
    const scannerCanvas = scannerCanvasRef.current;
    if (!scannerCanvas) return undefined;

    let animationFrameId = 0;
    let renderer: THREE.WebGLRenderer | null = null;
    let geometry: THREE.BufferGeometry | null = null;
    let material: THREE.ShaderMaterial | null = null;
    let texture: THREE.CanvasTexture | null = null;
    let renderParticles: ((currentTime: number) => void) | null = null;

    const stageWidth = container.offsetWidth;
    const stageHeight = metrics.stageHeight;
    const particleCount = prefersReducedMotion || !canUseWebGl() ? 0 : 180;

    scannerCanvas.width = stageWidth;
    scannerCanvas.height = stageHeight;
    const ctx = scannerCanvas.getContext('2d');
    if (!ctx) return undefined;

    if (particleCanvas && particleCount > 0) {
      try {
      const scene = new THREE.Scene();
      const camera = new THREE.OrthographicCamera(
        -stageWidth / 2,
        stageWidth / 2,
        stageHeight / 2,
        -stageHeight / 2,
        1,
        1000,
      );
      camera.position.z = 100;
      renderer = new THREE.WebGLRenderer({ canvas: particleCanvas, alpha: true, antialias: true });
      renderer.setSize(stageWidth, stageHeight);
      renderer.setClearColor(0x000000, 0);

      geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(particleCount * 3);
      const velocities = new Float32Array(particleCount);
      const alphas = new Float32Array(particleCount);

      const texCanvas = document.createElement('canvas');
      texCanvas.width = 100;
      texCanvas.height = 100;
      const texCtx = texCanvas.getContext('2d');
      if (texCtx) {
        const half = 50;
        const gradient = texCtx.createRadialGradient(half, half, 0, half, half, half);
        gradient.addColorStop(0.025, '#fff');
        gradient.addColorStop(0.1, 'hsl(217, 61%, 33%)');
        gradient.addColorStop(0.25, 'hsl(217, 64%, 6%)');
        gradient.addColorStop(1, 'transparent');
        texCtx.fillStyle = gradient;
        texCtx.beginPath();
        texCtx.arc(half, half, half, 0, Math.PI * 2);
        texCtx.fill();
      }
      texture = new THREE.CanvasTexture(texCanvas);

      for (let i = 0; i < particleCount; i += 1) {
        positions[i * 3] = (Math.random() - 0.5) * stageWidth * 2;
        positions[i * 3 + 1] = (Math.random() - 0.5) * stageHeight;
        velocities[i] = Math.random() * 40 + 20;
        alphas[i] = (Math.random() * 8 + 2) / 10;
      }

      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));
      material = new THREE.ShaderMaterial({
        uniforms: { pointTexture: { value: texture } },
        vertexShader:
          'attribute float alpha; varying float vAlpha; void main() { vAlpha = alpha; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_PointSize = 10.0; gl_Position = projectionMatrix * mvPosition; }',
        fragmentShader:
          'uniform sampler2D pointTexture; varying float vAlpha; void main() { gl_FragColor = vec4(1.0, 1.0, 1.0, vAlpha) * texture2D(pointTexture, gl_PointCoord); }',
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        vertexColors: false,
      });
      const particles = new THREE.Points(geometry, material);
      scene.add(particles);

      const animateParticles = (currentTime: number) => {
        if (!renderer || !geometry || !material) return;
        const time = currentTime * 0.001;
        const pos = geometry.attributes.position.array as Float32Array;
        const alphaAttr = geometry.attributes.alpha.array as Float32Array;
        for (let i = 0; i < particleCount; i += 1) {
          pos[i * 3] += velocities[i] * 0.012;
          if (pos[i * 3] > stageWidth / 2 + 80) pos[i * 3] = -stageWidth / 2 - 80;
          pos[i * 3 + 1] += Math.sin(time + i * 0.1) * 0.35;
          alphaAttr[i] = Math.max(0.1, Math.min(1, alphaAttr[i] + (Math.random() - 0.5) * 0.05));
        }
        geometry.attributes.position.needsUpdate = true;
        geometry.attributes.alpha.needsUpdate = true;
        renderer.render(scene, camera);
      };

      renderParticles = animateParticles;
      } catch {
        renderParticles = null;
      }
    }

    const baseMaxParticles = prefersReducedMotion ? 0 : 280;
    const scanTargetMaxParticles = 900;
    const scannerParticles: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      radius: number;
      alpha: number;
      life: number;
      decay: number;
    }> = [];
    let currentMaxParticles = baseMaxParticles;

    const createScannerParticle = () => ({
      x: getScannerX() + (Math.random() - 0.5) * 3,
      y: Math.random() * stageHeight,
      vx: Math.random() * 0.6 + 0.15,
      vy: (Math.random() - 0.5) * 0.25,
      radius: Math.random() * 0.5 + 0.35,
      alpha: Math.random() * 0.35 + 0.55,
      life: 1,
      decay: Math.random() * 0.02 + 0.005,
    });

    for (let i = 0; i < baseMaxParticles; i += 1) scannerParticles.push(createScannerParticle());

    const animate = (currentTime: number) => {
      cardStreamState.current.lastTime = currentTime;

      const { position, cardLineWidth } = cardStreamState.current;
      const containerWidth = container.offsetWidth;
      if (position < -cardLineWidth) cardStreamState.current.position = containerWidth;
      else if (position > containerWidth) cardStreamState.current.position = -cardLineWidth;

      cardLine.style.transform = `translateX(${cardStreamState.current.position}px)`;
      updateCardEffects();

      if (typeof renderParticles === 'function') renderParticles(currentTime);

      ctx.clearRect(0, 0, stageWidth, stageHeight);
      const targetCount = scannerState.current.isScanning ? scanTargetMaxParticles : baseMaxParticles;
      currentMaxParticles += (targetCount - currentMaxParticles) * 0.05;
      while (scannerParticles.length < currentMaxParticles) scannerParticles.push(createScannerParticle());
      while (scannerParticles.length > currentMaxParticles) scannerParticles.pop();
      scannerParticles.forEach((particle) => {
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.life -= particle.decay;
        if (particle.life <= 0 || particle.x > stageWidth) Object.assign(particle, createScannerParticle());
        ctx.globalAlpha = particle.alpha * particle.life;
        ctx.fillStyle = 'rgba(220, 210, 255, 0.9)';
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        ctx.fill();
      });

      animationFrameId = window.requestAnimationFrame(animate);
    };

    animationFrameId = window.requestAnimationFrame(animate);

    return () => {
      if (wheelSnapTimer !== null) window.clearTimeout(wheelSnapTimer);
      if (quietScrambleTimer !== null) window.clearInterval(quietScrambleTimer);
      window.cancelAnimationFrame(animationFrameId);
      cardLine.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      cardLine.removeEventListener('touchstart', handleMouseDown);
      window.removeEventListener('touchmove', handleMouseMove);
      window.removeEventListener('touchend', handleMouseUp);
      cardLine.removeEventListener('wheel', handleWheel);
      geometry?.dispose();
      material?.dispose();
      texture?.dispose();
      renderer?.dispose();
    };
  }, [
    activeIndex,
    cancelSnapAnimation,
    centerOnSourceIndex,
    friction,
    getCardStep,
    getScannerX,
    getTargetPositionForIndex,
    itemCount,
    metrics.cardGap,
    metrics.cardHeight,
    metrics.cardWidth,
    metrics.stageHeight,
    onActiveIndexChange,
    prefersReducedMotion,
    quietMode,
    resolveFocusedSourceIndex,
    scanEffect,
    streamCards,
  ]);

  if (itemCount === 0) return null;

  const statusCopy =
    navStatusLabel?.(focusedIndex + 1, itemCount) ?? `${focusedIndex + 1} / ${itemCount}`;

  return (
    <div
      ref={rootRef}
      className={cn(
        'tx-scanner-stream-root',
        quietMode && 'is-quiet',
        isTransitioning && 'is-transitioning',
        isSettling && 'is-settling',
        className,
      )}
      data-scanner-id={streamId}
      data-quiet={quietMode ? 'true' : 'false'}
      data-transitioning={isTransitioning ? 'true' : 'false'}
      style={{ ['--tx-scanner-stage-height' as string]: `${metrics.stageHeight}px` }}
    >
      <div
        className="tx-scanner-stage"
        style={{ height: metrics.stageHeight }}
        aria-label={quietMode ? 'Biblioteca de productos' : 'Biblioteca de productos en escaneo'}
      >
        {!quietMode && !prefersReducedMotion ? (
          <canvas
            ref={particleCanvasRef}
            className="tx-scanner-particle-canvas"
            style={{ height: metrics.stageHeight }}
            aria-hidden="true"
          />
        ) : null}
        {!quietMode ? (
          <canvas
            ref={scannerCanvasRef}
            className="tx-scanner-fx-canvas"
            style={{ height: metrics.stageHeight }}
            aria-hidden="true"
          />
        ) : null}
        {!quietMode && !prefersReducedMotion ? (
          <div
            className={cn(
              'tx-scanner-line',
              isScanning ? 'is-active' : '',
              prefersReducedMotion ? 'is-reduced' : 'animate-scan-pulse',
            )}
            style={{ height: metrics.cardHeight }}
            aria-hidden="true"
          />
        ) : null}
        <div className="tx-scanner-track" style={{ height: metrics.cardHeight }}>
          <div
            ref={cardLineRef}
            className="tx-scanner-card-line"
            style={{ gap: metrics.cardGap }}
          >
            {streamCards.map((card) => {
              const isFocused = card.sourceIndex === focusedIndex;
              const asciiLayout = quietAsciiLayout ?? deriveAsciiGrid(metrics.cardWidth, metrics.cardHeight);
              return (
                <div
                  key={`${card.item.id}-${card.streamId}`}
                  className="tx-scanner-card-wrapper"
                  data-stream-id={card.streamId}
                  data-source-index={card.sourceIndex}
                  style={{
                    ...(card.item.surfaceStyle ?? {}),
                    width: metrics.cardWidth,
                    height: metrics.cardHeight,
                    ['--tx-scanner-card-width' as string]: `${metrics.cardWidth}px`,
                    ['--tx-scanner-card-height' as string]: `${metrics.cardHeight}px`,
                    ['--tx-scanner-ascii-cols' as string]: String(asciiLayout.asciiWidth),
                    ['--tx-scanner-ascii-lines' as string]: String(asciiLayout.asciiHeight),
                    ...(quietAsciiLayout
                      ? {
                          ['--tx-scanner-ascii-font-size' as string]: `${quietAsciiLayout.fontSize}px`,
                          ['--tx-scanner-ascii-line-height' as string]: `${quietAsciiLayout.lineHeight}px`,
                        }
                      : {}),
                  }}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    className={cn('tx-scanner-card-hit', isFocused && 'is-focused')}
                    aria-label={`Seleccionar producto ${card.sourceIndex + 1}`}
                    aria-current={isFocused ? 'true' : undefined}
                    onClick={() => {
                      if (card.sourceIndex === focusedIndex) return;
                      if (quietMode && !prefersReducedMotion) {
                        animateToIndexRef.current(card.sourceIndex, () =>
                          onActiveIndexChange?.(card.sourceIndex),
                        );
                        return;
                      }
                      centerOnSourceIndex(card.sourceIndex, true);
                      onActiveIndexChange?.(card.sourceIndex);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      if (quietMode && !prefersReducedMotion) {
                        animateToIndexRef.current(card.sourceIndex, () =>
                          onActiveIndexChange?.(card.sourceIndex),
                        );
                        return;
                      }
                      centerOnSourceIndex(card.sourceIndex, true);
                      onActiveIndexChange?.(card.sourceIndex);
                    }}
                  >
                    <div className="tx-scanner-card-normal">
                      {renderCard(card.item, card.sourceIndex, isFocused)}
                    </div>
                    {!prefersReducedMotion ? (
                      <div
                        className={cn(
                          'tx-scanner-card-ascii',
                          quietMode && !isTransitioning && 'is-dormant',
                        )}
                        aria-hidden="true"
                      >
                        <pre className="tx-scanner-ascii-content">{card.ascii}</pre>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {showNav ? (
        <div className="tx-scanner-nav">
          <button
            type="button"
            className="tx-scanner-nav-btn"
            aria-label="Producto anterior"
            onClick={() => goToRelative(-1)}
          >
            <ChevronLeft className="tx-scanner-nav-icon" aria-hidden="true" />
          </button>
          <div className="tx-scanner-dots" aria-hidden="true">
            {items.map((item, index) => (
              <button
                key={item.id}
                type="button"
                className={cn('tx-scanner-dot', index === focusedIndex && 'is-active')}
                aria-label={`Ir al producto ${index + 1}`}
                onClick={() => {
                  if (index === focusedIndex) return;
                  if (quietMode && !prefersReducedMotion) {
                    animateToIndexRef.current(index, () => onActiveIndexChange?.(index));
                    return;
                  }
                  centerOnSourceIndex(index, true);
                  onActiveIndexChange?.(index);
                }}
              />
            ))}
          </div>
          <span className="tx-scanner-nav-status">{statusCopy}</span>
          <button
            type="button"
            className="tx-scanner-nav-btn"
            aria-label="Producto siguiente"
            onClick={() => goToRelative(1)}
          >
            <ChevronRight className="tx-scanner-nav-icon" aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
