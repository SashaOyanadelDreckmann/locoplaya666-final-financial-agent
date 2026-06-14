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
const ASCII_LINE_HEIGHT = 10;

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

function mutateAsciiAtSplit(element: HTMLElement, splitPercent: number, streamId: number, originalMap: Map<number, string>) {
  const original = originalMap.get(streamId) || '';
  const lines = original.split('\n');
  if (lines.length === 0) return;

  const colCount = lines[0]?.length ?? 0;
  if (colCount === 0) return;

  const splitCol = (splitPercent / 100) * colCount;
  const band = Math.max(3, Math.round(colCount * 0.08));
  let out = '';

  for (let row = 0; row < lines.length; row += 1) {
    const line = lines[row] ?? '';
    let rowOut = '';
    for (let col = 0; col < line.length; col += 1) {
      const edgeDistance = Math.abs(col - splitCol);
      if (edgeDistance <= band) {
        const chaos = 1 - edgeDistance / band;
        if (Math.random() < 0.35 + chaos * 0.5) {
          rowOut += ASCII_CHARS[Math.floor(Math.random() * ASCII_CHARS.length)];
          continue;
        }
      }
      rowOut += line[col] ?? ' ';
    }
    out += rowOut;
    if (row < lines.length - 1) out += '\n';
  }

  element.textContent = out;
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

function deriveMetrics(
  containerWidth: number,
  cardWidthRatio = 0.58,
  compactStage = false,
): ScannerMetrics {
  const safeWidth = Math.max(240, containerWidth);
  const cardWidth = Math.max(168, Math.min(safeWidth - 24, Math.round(safeWidth * cardWidthRatio)));
  const cardHeight = Math.round(cardWidth * 0.625);
  const cardGap = Math.max(12, Math.round(cardWidth * 0.1));
  const stageHeight = compactStage ? cardHeight : cardHeight + 28;
  return { containerWidth: safeWidth, cardWidth, cardHeight, stageHeight, cardGap };
}

function deriveAsciiGrid(cardWidth: number, cardHeight: number) {
  const asciiWidth = Math.max(18, Math.floor(cardWidth / 6.5));
  const asciiHeight = Math.max(10, Math.ceil(cardHeight / ASCII_LINE_HEIGHT));
  return { asciiWidth, asciiHeight };
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
}: ScannerCardStreamProps<T>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const cardLineRef = useRef<HTMLDivElement>(null);
  const particleCanvasRef = useRef<HTMLCanvasElement>(null);
  const scannerCanvasRef = useRef<HTMLCanvasElement>(null);
  const originalAscii = useRef(new Map<number, string>());
  const streamId = useId().replace(/:/g, '');

  const [metrics, setMetrics] = useState<ScannerMetrics>(() =>
    deriveMetrics(320, cardWidthRatio, quietMode),
  );
  const [isScanning, setIsScanning] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(activeIndex);

  const itemCount = items.length;
  const loopRepeat = quietMode
    ? 1
    : (repeat ?? (itemCount <= 1 ? 1 : itemCount <= 4 ? 3 : 2));

  const streamCards = useMemo(() => {
    if (itemCount === 0) return [];
    const totalCards = itemCount * loopRepeat;
    const { asciiWidth, asciiHeight } = deriveAsciiGrid(metrics.cardWidth, metrics.cardHeight);
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
  }, [itemCount, items, loopRepeat, metrics.cardHeight, metrics.cardWidth, quietMode]);

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
      setMetrics(deriveMetrics(width, cardWidthRatio, quietMode));
    };

    updateMetrics();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateMetrics);
      observer.observe(node);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', updateMetrics);
    return () => window.removeEventListener('resize', updateMetrics);
  }, [cardWidthRatio, quietMode]);

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

    let morphFrameTick = 0;

    streamCards.forEach((card) => originalAscii.current.set(card.streamId, card.ascii));

    const metricsKey = `${metrics.cardWidth}x${metrics.cardHeight}x${metrics.cardGap}`;
    if (cardStreamState.current.metricsKey !== metricsKey) {
      cardStreamState.current.metricsKey = metricsKey;
      cardStreamState.current.cardLineWidth = getCardStep() * streamCards.length;
      centerOnSourceIndex(activeIndex, true);
    }

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
        }
        delete wrapper.dataset.scanned;
      });
      container.style.removeProperty('--scanner-center-x');
    };

    const settleQuietCarousel = () => {
      resetCardClipsToNormal();
      setIsScanning(false);
      setIsTransitioning(false);
      scannerState.current.isScanning = false;
    };

    const beginQuietTransition = () => {
      if (!quietMode) return;
      setIsTransitioning(true);
      setIsScanning(true);
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
      const cardRight = cardLeft + cardWidth;
      let clampedSplit: number;
      if (cardRight <= scannerX + 0.5) {
        clampedSplit = 100;
      } else if (cardLeft >= scannerX - 0.5) {
        clampedSplit = 0;
      } else {
        clampedSplit = ((scannerX - cardLeft) / cardWidth) * 100;
      }
      clampedSplit = Math.max(0, Math.min(100, clampedSplit));

      const morphState =
        clampedSplit >= 99.5 ? 'code' : clampedSplit <= 0.5 ? 'normal' : 'split';
      wrapper.dataset.morphState = morphState;

      const inMorphZone = morphState === 'split';
      const morphWave = Math.sin((clampedSplit / 100) * Math.PI);
      const velocity = cardStreamState.current.morphVelocity ?? 0;
      const softness = Math.min(8, 4 + velocity * 0.06);
      const softHalf = softness * 0.42;
      const cardCenter = cardLeft + cardWidth / 2;
      const distNorm = Math.abs(cardCenter - scannerX) / Math.max(cardWidth, 1);
      const focusScale = morphState === 'normal' ? Math.max(0.968, 1 - distNorm * 0.025) : morphState === 'code' ? 0.962 : Math.max(0.952, 1 - distNorm * 0.05);
      const morphBlur = inMorphZone ? 0.22 + morphWave * 0.65 + velocity * 0.02 : 0;
      const beamOpacity = inMorphZone ? 0.08 + morphWave * 0.36 : 0;
      const codeMix = morphState === 'code' ? 1 : morphState === 'normal' ? 0 : 0.72 + morphWave * 0.28;

      wrapper.style.setProperty('--scan-split', `${clampedSplit}%`);
      wrapper.style.setProperty('--scan-softness', `${softness.toFixed(1)}%`);
      wrapper.style.setProperty('--scan-soft-half', `${softHalf.toFixed(1)}%`);
      wrapper.style.setProperty('--card-focus-scale', focusScale.toFixed(4));
      wrapper.style.setProperty('--morph-beam-opacity', beamOpacity.toFixed(3));
      normalCard.style.setProperty('--scan-split', `${clampedSplit}%`);
      normalCard.style.setProperty('--morph-blur', morphBlur.toFixed(3));

      if (morphState === 'code') {
        normalCard.style.setProperty('opacity', '0');
        normalCard.style.setProperty('visibility', 'hidden');
      } else {
        normalCard.style.removeProperty('opacity');
        normalCard.style.removeProperty('visibility');
      }

      if (asciiCard) {
        asciiCard.style.setProperty('--scan-split', `${clampedSplit}%`);
        asciiCard.style.setProperty('--code-mix', codeMix.toFixed(3));
      }

      if (!asciiCard || !asciiContent) return clampedSplit;

      const streamId = Number(wrapper.dataset.streamId || '0');
      if (morphState === 'code') {
        asciiContent.textContent = originalAscii.current.get(streamId) || '';
      } else if (inMorphZone) {
        morphFrameTick += 1;
        if (morphFrameTick % 2 === 0) {
          mutateAsciiAtSplit(asciiContent, clampedSplit, streamId, originalAscii.current);
        }
      } else if (morphState === 'normal') {
        asciiContent.textContent = originalAscii.current.get(streamId) || '';
      }

      return clampedSplit;
    };

    const updateCardEffects = () => {
      const nextIndex = resolveFocusedSourceIndex();
      setFocusedIndex(nextIndex);

      const draggingOrAnimating =
        cardStreamState.current.isDragging || transitionRef.current.isAnimating;

      if (quietMode && !draggingOrAnimating) {
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
          const split = applyQuietMorph(
            wrapper,
            normalCard,
            asciiCard,
            asciiContent ?? null,
            cardLeft,
            cardWidth,
            scannerX,
          );
          if (split > 6 && split < 94) anyCardIsScanning = true;
          if (wrapper.dataset.morphState === 'code' || wrapper.dataset.morphState === 'split') {
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
      const duration = quietMode ? 720 : 480;
      transitionRef.current.isAnimating = true;
      beginQuietTransition();

      const tick = (now: number) => {
        const progress = Math.min(1, (now - startTime) / duration);
        const eased = quietMode
          ? 1 - (1 - progress) ** 2.65
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
                    ['--tx-scanner-card-height' as string]: `${metrics.cardHeight}px`,
                    ['--tx-scanner-ascii-lines' as string]: String(
                      deriveAsciiGrid(metrics.cardWidth, metrics.cardHeight).asciiHeight,
                    ),
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
