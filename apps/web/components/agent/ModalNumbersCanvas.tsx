'use client';

import { useEffect, useRef } from 'react';

const CELL = 18;
const FS = 10;

type ModalNumbersCanvasProps = {
  shuffleTrigger: number;
  transitionPhase?: 'idle' | 'authorizing' | 'flood' | 'library-reveal' | 'chat-reveal';
  pulse?: number;
};

export default function ModalNumbersCanvas({
  shuffleTrigger,
  transitionPhase = 'idle',
  pulse = 0,
}: ModalNumbersCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chaosRef = useRef(0);
  const shuffleSeenRef = useRef(shuffleTrigger);

  useEffect(() => {
    if (shuffleSeenRef.current !== shuffleTrigger) {
      shuffleSeenRef.current = shuffleTrigger;
      chaosRef.current = 1;
    }
  }, [shuffleTrigger]);

  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    const context = canvasEl.getContext('2d');
    if (!context) return;
    const canvas = canvasEl as HTMLCanvasElement;
    const ctx = context as CanvasRenderingContext2D;

    let raf = 0;
    let lastPaint = 0;
    let mouseX = 0.5;
    let mouseY = 0.5;
    let smX = 0.5;
    let smY = 0.5;

    interface Cell {
      phi: number;
      targetDigit: number;
      drift: number;
      offset: number;
    }
    let cells: Cell[] = [];
    let cols = 0;
    let rows = 0;
    let W = 0;
    let H = 0;
    let ro: ResizeObserver | null = null;
    let resizeFallback: (() => void) | null = null;

    function setup() {
      W = canvas.offsetWidth || 800;
      H = canvas.offsetHeight || 600;
      canvas.width = W;
      canvas.height = H;
      cols = Math.ceil(W / CELL);
      rows = Math.ceil(H / CELL);
      cells = Array.from({ length: cols * rows }, () => ({
        phi: Math.random() * Math.PI * 2,
        targetDigit: Math.floor(Math.random() * 10),
        drift: 0.32 + Math.random() * 0.9,
        offset: Math.random() * Math.PI * 2,
      }));
    }

    setup();

    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => setup());
      ro.observe(canvas);
    } else {
      resizeFallback = () => setup();
      window.addEventListener('resize', resizeFallback);
    }

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseX = (e.clientX - rect.left) / (rect.width || 1);
      mouseY = (e.clientY - rect.top) / (rect.height || 1);
    };
    const parent = canvas.closest('.transactions-modal') ?? document;
    parent.addEventListener('mousemove', handleMouseMove as EventListener);

    function loop(ts: number) {
      raf = requestAnimationFrame(loop);
      const t = ts / 1000;
      const isOrderedPhase =
        transitionPhase === 'library-reveal' || transitionPhase === 'chat-reveal';

      if (ts - lastPaint < 120) return;
      lastPaint = ts;

      chaosRef.current = Math.max(0, chaosRef.current - 0.008);
      const phaseBoost =
        transitionPhase === 'flood'
          ? 0.95
          : transitionPhase === 'authorizing'
            ? 0.5
            : transitionPhase === 'library-reveal'
              ? 0.14
              : transitionPhase === 'chat-reveal'
                ? 0.08
                : 0;
      const chaos = Math.min(1, chaosRef.current + phaseBoost);

      smX += (mouseX - smX) * 0.052;
      smY += (mouseY - smY) * 0.052;

      ctx.clearRect(0, 0, W, H);

      const bg = ctx.createLinearGradient(0, 0, W, H);
      bg.addColorStop(0, '#06101d');
      bg.addColorStop(0.45, '#071420');
      bg.addColorStop(1, '#040a13');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      if (isOrderedPhase) {
        ctx.fillStyle = 'rgba(129, 159, 194, 0.18)';
        for (let gx = 0; gx < W; gx += 6) {
          for (let gy = 0; gy < H; gy += 6) {
            ctx.fillRect(gx, gy, 1, 1);
          }
        }
      }

      const scanSpeed =
        transitionPhase === 'flood' ? 134 : transitionPhase === 'authorizing' ? 84 : isOrderedPhase ? 26 : 52;
      const scanY = (t * scanSpeed + pulse * 11) % H;
      const cursorX = smX * W;
      const cursorY = smY * H;
      const spotR = Math.min(W, H) * 0.28;
      const halo = ctx.createRadialGradient(cursorX, cursorY, 0, cursorX, cursorY, spotR * 1.35);
      halo.addColorStop(0, 'rgba(106, 161, 212, 0.12)');
      halo.addColorStop(0.34, 'rgba(106, 161, 212, 0.06)');
      halo.addColorStop(1, 'rgba(106, 161, 212, 0)');
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, W, H);

      ctx.textBaseline = 'top';

      for (let i = 0; i < cells.length; i++) {
        const c = cells[i];
        const col = i % cols;
        const row = Math.floor(i / cols);
        const sx = col * CELL + 2;
        const sy = row * CELL + 1;

        const shimmer = 0.44 + 0.56 * Math.sin(t * 0.65 * c.drift + c.phi + col * 0.12 + row * 0.16 + pulse * 0.04);
        const cellPulse = 0.5 + 0.5 * Math.sin(t * 0.45 + c.offset + row * 0.03);

        const d =
          chaos > 0.08 && !isOrderedPhase && Math.random() < chaos * 0.2
            ? Math.floor(Math.random() * 10)
            : (c.targetDigit + (cellPulse > 0.92 ? 1 : 0)) % 10;

        let alpha = (isOrderedPhase ? 0.08 : 0.05) + shimmer * (isOrderedPhase ? 0.07 : 0.11) + cellPulse * 0.02;

        const sd = Math.abs(sy - scanY);
        if (sd < 24) alpha += (1 - sd / 24) * 0.16;

        const dist = Math.hypot(sx - cursorX, sy - cursorY);
        let prox = 0;
        if (dist < spotR) {
          prox = (1 - dist / spotR) ** 2;
          alpha += prox * 0.24;
        }

        if (chaos > 0.08) alpha += chaos * (isOrderedPhase ? 0.02 : 0.08);
        if (transitionPhase === 'chat-reveal') alpha += 0.03;

        let r = 90;
        let g = 128;
        let b = 168;
        if (prox > 0) {
          r = Math.round(r + (132 - r) * prox);
          g = Math.round(g + (190 - g) * prox);
          b = Math.round(b + (236 - b) * prox);
        }
        if (chaos > 0.08) {
          r = Math.min(255, Math.round(r + (224 - r) * chaos * 0.08));
        }

        const fontScale =
          transitionPhase === 'flood' ? 1.12 : transitionPhase === 'authorizing' ? 1.04 : isOrderedPhase ? 0.92 : 1;
        ctx.font = `600 ${Math.round(FS * fontScale)}px "Courier New", monospace`;
        ctx.globalAlpha = Math.min(0.78, Math.max(0.04, alpha));
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillText(String(d), sx, sy);
      }

      ctx.globalAlpha = 1;

      // Vignette — lighter on mobile so it doesn't read as a dark panel block
      const isMobileCanvas = window.matchMedia(
        '(max-width: 767px), (min-width: 768px) and (max-width: 1366px) and (orientation: portrait)',
      ).matches;
      const vg = ctx.createRadialGradient(
        W / 2, H / 2, Math.min(W, H) * (isMobileCanvas ? 0.22 : 0.14),
        W / 2, H / 2, Math.max(W, H) * (isMobileCanvas ? 0.92 : 0.84),
      );
      vg.addColorStop(0, 'rgba(7,16,30,0)');
      vg.addColorStop(0.55, isMobileCanvas ? 'rgba(7,16,30,0.04)' : 'rgba(7,16,30,0.14)');
      vg.addColorStop(1, isMobileCanvas ? 'rgba(7,16,30,0.18)' : 'rgba(7,16,30,0.86)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
    }

    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      if (resizeFallback) window.removeEventListener('resize', resizeFallback);
      parent.removeEventListener('mousemove', handleMouseMove as EventListener);
    };
  }, [pulse, transitionPhase]);

  return (
    <canvas
      ref={canvasRef}
      className="tx-numbers-canvas"
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        display: 'block',
        pointerEvents: 'none',
        borderRadius: 'inherit',
      }}
    />
  );
}
