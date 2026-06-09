'use client';

import React, {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as THREE from 'three';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { cn } from '@/lib/utils';

const ASCII_CHARS =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789(){}[]<>;:,._-+=!@#$%^&*|\\/\"\'`~?';

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

export type ScannerStreamCard = {
  id: string | number;
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
  /** Matte carousel: no scanner FX, no auto-scroll, stable at rest */
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

function deriveMetrics(containerWidth: number, cardWidthRatio = 0.58): ScannerMetrics {
  const safeWidth = Math.max(240, containerWidth);
  const cardWidth = Math.max(168, Math.min(safeWidth - 24, Math.round(safeWidth * cardWidthRatio)));
  const cardHeight = Math.round(cardWidth * 0.625);
  const cardGap = Math.max(12, Math.round(cardWidth * 0.1));
  const stageHeight = cardHeight + 28;
  return { containerWidth: safeWidth, cardWidth, cardHeight, stageHeight, cardGap };
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

  const [metrics, setMetrics] = useState<ScannerMetrics>(() => deriveMetrics(320, cardWidthRatio));
  const [isScanning, setIsScanning] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(activeIndex);

  const itemCount = items.length;
  const loopRepeat = repeat ?? (itemCount <= 1 ? 1 : itemCount <= 4 ? 3 : 2);

  const streamCards = useMemo(() => {
    if (itemCount === 0) return [];
    const totalCards = itemCount * loopRepeat;
    const asciiWidth = Math.max(18, Math.floor(metrics.cardWidth / 6.5));
    const asciiHeight = Math.max(10, Math.floor(metrics.cardHeight / 13));
    return Array.from({ length: totalCards }, (_, i) => ({
      streamId: i,
      sourceIndex: i % itemCount,
      item: items[i % itemCount],
      ascii: generateCode(asciiWidth, asciiHeight),
    }));
  }, [itemCount, items, loopRepeat, metrics.cardHeight, metrics.cardWidth]);

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
  });

  const scannerState = useRef({ isScanning: false });

  const getScannerX = useCallback(() => {
    const width = rootRef.current?.offsetWidth ?? metrics.containerWidth;
    return width / 2;
  }, [metrics.containerWidth]);

  const getCardStep = useCallback(
    () => metrics.cardWidth + metrics.cardGap,
    [metrics.cardGap, metrics.cardWidth],
  );

  const centerOnSourceIndex = useCallback(
    (sourceIndex: number, immediate = false) => {
      const cardLine = cardLineRef.current;
      const container = rootRef.current;
      if (!cardLine || !container || itemCount === 0) return;

      const cardStep = getCardStep();
      const scannerX = container.offsetWidth / 2;
      const baseIndex = Math.max(0, Math.min(itemCount - 1, sourceIndex));
      const targetStreamIndex = itemCount + baseIndex;
      const cardCenter = targetStreamIndex * cardStep + metrics.cardWidth / 2;
      const nextPosition = scannerX - cardCenter;

      cardStreamState.current.position = nextPosition;
      cardStreamState.current.velocity = 0;
      cardLine.style.transform = `translateX(${nextPosition}px)`;
      setFocusedIndex(baseIndex);
    },
    [getCardStep, initialSpeed, itemCount, metrics.cardWidth],
  );

  const resolveFocusedSourceIndex = useCallback(() => {
    const cardLine = cardLineRef.current;
    const container = rootRef.current;
    if (!cardLine || !container || itemCount === 0) return 0;

    const scannerX = container.offsetWidth / 2;
    const cardStep = getCardStep();
    const position = cardStreamState.current.position;
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
  }, [getCardStep, itemCount, metrics.cardWidth, streamCards]);

  const goToRelative = useCallback(
    (delta: number) => {
      if (itemCount === 0) return;
      const nextIndex = (focusedIndex + delta + itemCount) % itemCount;
      centerOnSourceIndex(nextIndex, true);
      onActiveIndexChange?.(nextIndex);
    },
    [centerOnSourceIndex, focusedIndex, itemCount, onActiveIndexChange],
  );

  useEffect(() => {
    const node = rootRef.current;
    if (!node) return undefined;

    const updateMetrics = () => {
      const width = node.offsetWidth;
      if (width <= 0) return;
      setMetrics(deriveMetrics(width, cardWidthRatio));
    };

    updateMetrics();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateMetrics);
      observer.observe(node);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', updateMetrics);
    return () => window.removeEventListener('resize', updateMetrics);
  }, [cardWidthRatio]);

  useEffect(() => {
    if (itemCount === 0) return;
    centerOnSourceIndex(activeIndex, true);
  }, [activeIndex, centerOnSourceIndex, itemCount, metrics.cardWidth, metrics.cardGap]);

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

    const runScrambleEffect = (element: HTMLElement, cardId: number) => {
      if (prefersReducedMotion || element.dataset.scrambling === 'true') return;
      element.dataset.scrambling = 'true';
      const originalText = originalAscii.current.get(cardId) || '';
      const asciiWidth = Math.max(18, Math.floor(metrics.cardWidth / 6.5));
      const asciiHeight = Math.max(10, Math.floor(metrics.cardHeight / 13));
      let scrambleCount = 0;
      const maxScrambles = 8;
      const interval = window.setInterval(() => {
        element.textContent = generateCode(asciiWidth, asciiHeight);
        scrambleCount += 1;
        if (scrambleCount >= maxScrambles) {
          window.clearInterval(interval);
          element.textContent = originalText;
          delete element.dataset.scrambling;
        }
      }, 30);
    };

    const updateCardEffects = () => {
      if (quietMode) {
        const nextIndex = resolveFocusedSourceIndex();
        setFocusedIndex(nextIndex);
        return;
      }

      const scannerX = getScannerX();
      const scannerWidth = 6;
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
        if (!normalCard || !asciiCard || !asciiContent) return;

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

      setIsScanning(anyCardIsScanning);
      scannerState.current.isScanning = anyCardIsScanning;
      setFocusedIndex(resolveFocusedSourceIndex());
    };

    const handleMouseDown = (event: MouseEvent | TouchEvent) => {
      if ('button' in event && event.button !== 0) return;
      event.preventDefault();
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
      cardStreamState.current.position += deltaX;
      cardStreamState.current.lastMouseX = clientX;
      cardLine.style.transform = `translateX(${cardStreamState.current.position}px)`;
      updateCardEffects();
    };

    const snapToFocusedCard = () => {
      const nextIndex = resolveFocusedSourceIndex();
      centerOnSourceIndex(nextIndex, true);
      setFocusedIndex(nextIndex);
      onActiveIndexChange?.(nextIndex);
    };

    const handleMouseUp = () => {
      if (!cardStreamState.current.isDragging) return;
      cardStreamState.current.isDragging = false;
      cardStreamState.current.velocity = 0;
      snapToFocusedCard();
    };

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const scrollSpeed = 16;
      const delta = event.deltaY > 0 ? scrollSpeed : -scrollSpeed;
      cardStreamState.current.position += delta;
      cardLine.style.transform = `translateX(${cardStreamState.current.position}px)`;
      updateCardEffects();
      const nextIndex = resolveFocusedSourceIndex();
      setFocusedIndex(nextIndex);
      onActiveIndexChange?.(nextIndex);
    };

    cardLine.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    cardLine.addEventListener('touchstart', handleMouseDown, { passive: false });
    window.addEventListener('touchmove', handleMouseMove, { passive: false });
    window.addEventListener('touchend', handleMouseUp);
    cardLine.addEventListener('wheel', handleWheel, { passive: false });

    if (quietMode) {
      updateCardEffects();
      return () => {
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
    centerOnSourceIndex,
    friction,
    getCardStep,
    getScannerX,
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
      className={cn('tx-scanner-stream-root', quietMode && 'is-quiet', className)}
      data-scanner-id={streamId}
      data-quiet={quietMode ? 'true' : 'false'}
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
        {!quietMode ? (
          <div
            className={cn(
              'tx-scanner-line',
              isScanning ? 'is-active' : '',
              prefersReducedMotion ? 'is-reduced' : 'animate-scan-pulse',
            )}
            style={{ height: metrics.cardHeight + 12 }}
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
                  style={{ width: metrics.cardWidth, height: metrics.cardHeight }}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    className={cn('tx-scanner-card-hit', isFocused && 'is-focused')}
                    aria-label={`Seleccionar producto ${card.sourceIndex + 1}`}
                    aria-current={isFocused ? 'true' : undefined}
                    onClick={() => {
                      centerOnSourceIndex(card.sourceIndex, true);
                      onActiveIndexChange?.(card.sourceIndex);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      centerOnSourceIndex(card.sourceIndex, true);
                      onActiveIndexChange?.(card.sourceIndex);
                    }}
                  >
                    <div className="tx-scanner-card-normal">
                      {renderCard(card.item, card.sourceIndex, isFocused)}
                    </div>
                    {!quietMode ? (
                      <div className="tx-scanner-card-ascii" aria-hidden="true">
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
