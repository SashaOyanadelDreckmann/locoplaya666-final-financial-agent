'use client';

import { useEffect, useRef } from 'react';
import type { MotionValue } from 'framer-motion';

// ── Helpers ────────────────────────────────────────────────────────────────────
const clamp  = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const remap  = (v: number, lo: number, hi: number) => clamp((v - lo) / (hi - lo));
const ease   = (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

const CELL_DESKTOP = 14;
const CELL_MOBILE  = 14;
const FS   = 11;
const MOBILE_PROGRESS_STEPS = 384;

interface Px { r: number; g: number; b: number; lum: number }
interface Cd { revIn: number; revOut: number; spd: number; phi: number }

export interface MousePos { x: number; y: number }

const PHASE = {
  inStart: 0.01,
  inEnd:   0.18,
  outStart: 0.78,
  outEnd:   0.99,
} as const;

/** Mobile: reveal + morph across the full page scroll, not just the hero. */
const MOBILE_PHASE = {
  inStart: 0.00,
  inEnd:   0.40,
  outStart: 0.84,
  outEnd:   0.99,
} as const;

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  targetW: number,
  targetH: number,
  srcW = img.naturalWidth,
  srcH = img.naturalHeight,
) {
  if (!srcW || !srcH || !targetW || !targetH) return;
  const scale = Math.max(targetW / srcW, targetH / srcH);
  const drawW = srcW * scale;
  const drawH = srcH * scale;
  ctx.drawImage(img, (targetW - drawW) / 2, (targetH - drawH) / 2, drawW, drawH);
}

function quantizeProgress(p: number) {
  return Math.round(p * MOBILE_PROGRESS_STEPS) / MOBILE_PROGRESS_STEPS;
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function NumbersCanvas({
  progress,
  mouseRef,
  featureDip,
}: {
  progress: MotionValue<number>;
  mouseRef: React.RefObject<MousePos>;
  featureDip?: MotionValue<number>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx    = canvas.getContext('2d')!;
    let raf = 0, px: Px[] = [], cd: Cd[] = [], cols = 0, rows = 0;
    let dpr = 1, isMobile = false;
    let lastCssW = 0, lastCssH = 0;
    let lastPaintP = -1;

    const img = new Image();
    img.decoding = 'async';
    if ('fetchPriority' in img) {
      (img as HTMLImageElement & { fetchPriority: string }).fetchPriority = 'high';
    }
    const onImageReady = () => {
      sample();
      paint(progress.get(), 0);
    };
    img.onload = onImageReady;
    img.src = '/images/bg-door.jpg';
    if (img.complete && img.naturalWidth > 0) onImageReady();

    function sample() {
      if (!img.complete || !img.naturalWidth) return;
      const cssW = canvas.width / dpr;
      const cssH = canvas.height / dpr;
      if (cssW <= 0 || cssH <= 0) return;
      const CELL = isMobile ? CELL_MOBILE : CELL_DESKTOP;
      cols = Math.ceil(cssW / CELL);
      rows = Math.ceil(cssH / CELL);
      if (cols <= 0 || rows <= 0) return;
      const off = document.createElement('canvas');
      off.width = cols;
      off.height = rows;
      const oc = off.getContext('2d');
      if (!oc) return;
      drawImageCover(oc, img, cols, rows);
      let data: Uint8ClampedArray;
      try {
        data = oc.getImageData(0, 0, cols, rows).data;
      } catch {
        return;
      }
      px = []; cd = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const i4 = (r * cols + c) * 4;
          const rv = data[i4], gv = data[i4+1], bv = data[i4+2];
          px.push({ r: rv, g: gv, b: bv, lum: (rv*.299 + gv*.587 + bv*.114) / 255 });
          const cf = c / Math.max(cols-1, 1);
          const rf = r / Math.max(rows-1, 1);
          const bias = (cf * 0.62 + rf * 0.38) * 0.16;
          cd.push({
            revIn:  bias + Math.random() * .34,
            revOut: bias + Math.random() * .34,
            spd:    4 + Math.random() * 10,
            phi:    Math.random() * Math.PI * 2,
          });
        }
      }
    }

    function resize() {
      const layer = canvas.parentElement;
      const w = Math.max(window.innerWidth, layer?.clientWidth ?? 0, 1);
      const h = Math.max(window.innerHeight, layer?.clientHeight ?? 0, 1);
      const nextMobile = w < 768;
      const nextDpr = Math.min(window.devicePixelRatio || 1, 2);
      const sizeThreshold = nextMobile ? 16 : 1;
      const sizeChanged =
        Math.abs(w - lastCssW) > sizeThreshold ||
        Math.abs(h - lastCssH) > sizeThreshold ||
        nextDpr !== dpr ||
        nextMobile !== isMobile;

      if (!sizeChanged) return;

      lastCssW = w;
      lastCssH = h;
      dpr = nextDpr;
      isMobile = nextMobile;
      canvas.width  = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sample();
      lastPaintP = -1;
      paint(progress.get(), 0);
    }

    function paint(rawP: number, t: number) {
      const p = isMobile ? quantizeProgress(rawP) : rawP;
      const scrollT = isMobile ? p * 120 : t;
      if (isMobile && p === lastPaintP) return;
      lastPaintP = p;

      const phase = isMobile ? MOBILE_PHASE : PHASE;
      const inP  = ease(remap(p, phase.inStart, phase.inEnd));
      const outP = ease(remap(p, phase.outStart, phase.outEnd));
      const midP = clamp(inP - outP);
      const chaosIn  = isMobile ? ease(remap(p, 0.06, 0.48)) : ease(remap(p, 0.24, 0.44));
      const chaosOut = isMobile ? ease(remap(p, 0.72, 0.92)) : ease(remap(p, 0.60, 0.80));
      const chaosP   = clamp(chaosIn - chaosOut);

      const fd = isMobile ? 0 : (featureDip?.get() ?? 0);
      const eMid   = clamp(midP * (1 - fd));
      const eChaos = clamp(chaosP * (1 - fd));

      const W = canvas.width / dpr, H = canvas.height / dpr;
      ctx.clearRect(0, 0, W, H);

      {
        const stylize = eChaos * 0.92;
        const photoAlpha = clamp(1 - eMid * 0.88);
        ctx.globalAlpha = photoAlpha;
        if (!isMobile) {
          const satBase = 1.28;
          const conBase = 1.08;
          const briBase = 0.97;
          const sepBase = 0.02;
          ctx.filter = `saturate(${satBase + 0.38 * stylize}) contrast(${conBase - 0.34 * stylize}) brightness(${briBase - 0.20 * stylize}) sepia(${sepBase + 0.04 * stylize})`;
        }
        drawImageCover(ctx, img, W, H);
        ctx.filter = 'none';
        if (photoAlpha > 0.005) {
          ctx.globalAlpha = photoAlpha * 0.62;
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, W, H);
        }
        ctx.globalAlpha = 1;
      }

      if (eMid > 0.01) {
        ctx.globalAlpha = clamp(eMid * 0.72);
        ctx.fillStyle = '#060b18';
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 1;
      }

      if (!isMobile && eMid > 0.04) {
        const smX = mouseRef?.current?.x ?? 0.5;
        const smY = mouseRef?.current?.y ?? 0.5;
        const gx = smX * W, gy = smY * H;
        const sr = Math.min(W, H) * 0.38;
        const grd = ctx.createRadialGradient(gx, gy, 0, gx, gy, sr);
        grd.addColorStop(0, `rgba(111,143,166,${0.10 * eMid})`);
        grd.addColorStop(0.5, `rgba(90,120,145,${0.04 * eMid})`);
        grd.addColorStop(1, 'rgba(111,143,166,0)');
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, W, H);
      }

      if (eMid >= 0.005 && px.length) {
        const CELL = isMobile ? CELL_MOBILE : CELL_DESKTOP;
        ctx.font = `${FS}px "Courier New",monospace`;
        ctx.textBaseline = 'top';

        const smX = isMobile ? 0.5 : (mouseRef?.current?.x ?? 0.5);
        const smY = isMobile ? 0.5 : (mouseRef?.current?.y ?? 0.5);
        const scanY    = isMobile ? -9999 : (t * 80) % H;
        const cursorX  = smX * W;
        const cursorY  = smY * H;
        const cursorR  = isMobile ? 0 : 130;

        const tiltY = isMobile ? 0 : (smX - 0.5) * 0.30;
        const tiltX = isMobile ? 0 : (smY - 0.5) * 0.18;
        const cosY = Math.cos(tiltY), sinY = Math.sin(tiltY);
        const cosX = Math.cos(tiltX), sinX = Math.sin(tiltX);

        for (let i = 0; i < px.length; i++) {
          const c  = cd[i];
          const p_ = px[i];
          const col = i % cols, row = Math.floor(i / cols);

          let alpha: number;
          let sx: number;
          let sy: number;
          let depthAlpha = 1;

          if (isMobile) {
            const stagger = ease(remap(inP, c.revIn, c.revIn + 0.48));
            const fadeOut = ease(remap(outP, c.revOut, c.revOut + 0.48));
            alpha = clamp(stagger - fadeOut);
            if (alpha < 0.02) continue;
            const gridW = cols * CELL;
            const gridH = rows * CELL;
            sx = (W - gridW) / 2 + col * CELL;
            sy = (H - gridH) / 2 + row * CELL;
          } else {
            const a_in  = ease(remap(inP,  c.revIn,  c.revIn  + .36));
            const a_out = ease(remap(outP, c.revOut, c.revOut + .36));
            alpha = clamp(a_in - a_out) * (1 - fd);
            if (alpha < .01) continue;

            const x3 = (col / cols - 0.5) * W;
            const y3 = (row / rows - 0.5) * H;
            const x3r = x3 * cosY;
            const z3r = x3 * sinY;
            const y3r = y3 * cosX - z3r * sinX;
            const z3f = y3 * sinX + z3r * cosX;
            const FOV  = Math.min(W, H) * 1.4;
            const persp = FOV / (FOV + z3f * 0.6);
            sx = W/2 + x3r * persp;
            sy = H/2 + y3r * persp;
            depthAlpha = 0.60 + 0.40 * persp;
          }

          const targetDigit = Math.round(p_.lum * 9);
          const wave = isMobile
            ? Math.sin(col * 0.31 + row * 0.47 + scrollT * 2.2 + c.phi) * 2.2
            : Math.sin(col * .27 + row * .38 + t * 2.1) * 3;
          const cycleDigit = Math.abs(Math.floor(scrollT * c.spd + c.phi * 4 + i * 3.71 + wave)) % 10;

          let digit = targetDigit;
          if (!isMobile && eChaos > .08) {
            digit = Math.random() < eChaos * .9 ? cycleDigit : targetDigit;
          } else if (isMobile) {
            const settle = ease(remap(inP, c.revIn, c.revIn + 0.50));
            const morph = clamp(chaosP * 0.92 + p * 0.38 + (1 - settle) * 0.62);
            digit = morph > 0.20 ? cycleDigit : targetDigit;
          }
          const str = String(digit);

          let rv = p_.r, gv = p_.g, bv = p_.b;
          if (!isMobile) {
            const boost = 1 + eChaos * .62;
            rv = clamp(p_.r * boost, 0, 255);
            gv = clamp(p_.g * boost, 0, 255);
            bv = clamp(p_.b * boost, 0, 255);

            const scanDist = Math.abs(sy - scanY);
            if (scanDist < 24 && eMid > .20) {
              const g = (1 - scanDist/24) * eMid * .70;
              rv = clamp(rv + 100*g, 0, 255);
              gv = clamp(gv + 105*g, 0, 255);
              bv = clamp(bv + 130*g, 0, 255);
            }

            const dCursor = Math.sqrt((sx-cursorX)**2 + (sy-cursorY)**2);
            if (dCursor < cursorR) {
              const prox = (1 - dCursor/cursorR) ** 2;
              const spot = prox * eMid;
              rv = clamp(rv*(1-spot*.55) + 111*spot, 0, 255);
              gv = clamp(gv*(1-spot*.55) + 143*spot, 0, 255);
              bv = clamp(bv*(1-spot*.55) + 166*spot, 0, 255);
            }
          }

          const shimmerAmp = isMobile ? 0.14 : 0.30;
          const shimmerT = isMobile ? scrollT : t;
          const shimmer = (1 - shimmerAmp) + shimmerAmp * Math.sin(shimmerT * 3.3 + c.phi + col * .52 + row * .87);
          const finalA  = alpha * shimmer * depthAlpha;

          if (!isMobile && eChaos > .10) {
            const abr = eChaos * 4.0;
            ctx.globalAlpha = finalA * eChaos * .50;
            ctx.fillStyle = `rgb(255,35,75)`;
            ctx.fillText(str, sx - abr, sy - abr * .5);
            ctx.fillStyle = `rgb(30,190,255)`;
            ctx.fillText(str, sx + abr, sy + abr * .5);
          }

          ctx.globalAlpha = finalA;
          ctx.fillStyle = `rgb(${Math.round(rv)},${Math.round(gv)},${Math.round(bv)})`;
          ctx.fillText(str, sx, sy);
        }

        ctx.globalAlpha = 1;
      }

      {
        const vr1 = Math.min(W,H) * 0.22;
        const vr2 = Math.max(W,H) * 0.90;
        const vg  = ctx.createRadialGradient(W/2, H/2, vr1, W/2, H/2, vr2);
        vg.addColorStop(0,   'rgba(5,8,16,0)');
        vg.addColorStop(.55, 'rgba(5,8,16,0.18)');
        vg.addColorStop(1,   'rgba(5,8,16,0.80)');
        ctx.globalAlpha = 1;
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, W, H);
      }

      {
        const tg = ctx.createLinearGradient(0, 0, 0, H * 0.22);
        tg.addColorStop(0,   'rgba(5,8,16,0.55)');
        tg.addColorStop(1,   'rgba(5,8,16,0)');
        ctx.fillStyle = tg;
        ctx.fillRect(0, 0, W, H * 0.22);
      }
    }

    resize();
    window.addEventListener('resize', resize);

    const onProgress = () => {
      const latest = progress.get();
      paint(latest, isMobile ? latest * 120 : 0);
    };

    const unsubProgress = progress.on('change', onProgress);

    function loop(ts: number) {
      raf = requestAnimationFrame(loop);
      if (isMobile) return;
      if (px.length === 0 && img.complete && img.naturalWidth > 0) sample();
      paint(progress.get(), ts / 1000);
    }

    paint(progress.get(), 0);
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      unsubProgress();
      window.removeEventListener('resize', resize);
    };
  }, [progress, mouseRef, featureDip]);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 0, display: 'block' }}
    />
  );
}
