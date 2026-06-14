'use client';

import { useEffect, useRef } from 'react';
import type { MotionValue } from 'framer-motion';

// ── Helpers ────────────────────────────────────────────────────────────────────
const clamp  = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const remap  = (v: number, lo: number, hi: number) => clamp((v - lo) / (hi - lo));
// Double smoothstep — very soft acceleration/deceleration (no snap)
const smooth = (t: number) => {
  const x = clamp(t);
  return x * x * x * (x * (x * 6 - 15) + 10);
};

const CELL_DESKTOP = 14;
const CELL_MOBILE  = 14;   // same cell size as desktop — FS=11 fits cleanly in 14px cell
const FS   = 11;

interface Px { r: number; g: number; b: number; lum: number }
interface Cd { revIn: number; revOut: number; spd: number; phi: number }

export interface MousePos { x: number; y: number }

/** Per-cell dissolve window — wider = each digit fades in over more scroll */
const CELL_REVEAL = 0.54;

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
    let dpr = 1, isMobile = false, lastFrameTs = 0;

    const img = new Image();
    img.src = '/images/bg-door.jpg';

    // ── Sample image at cell resolution ──────────────────────────────────────
    function sample() {
      if (!img.complete || !img.naturalWidth) return;
      // Sample using CSS pixel dimensions so grid matches visual layout
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
      if (off.width <= 0 || off.height <= 0) return;
      const oc = off.getContext('2d');
      if (!oc) return;
      drawImageCover(oc, img, cols, rows);
      let data: Uint8ClampedArray;
      try {
        data = oc.getImageData(0, 0, off.width, off.height).data;
      } catch {
        return;
      }
      px = []; cd = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const i4 = (r * cols + c) * 4;
          const rv = data[i4], gv = data[i4+1], bv = data[i4+2];
          px.push({ r: rv, g: gv, b: bv, lum: (rv*.299 + gv*.587 + bv*.114) / 255 });
          // Resolution-independent dissolve: a gentle diagonal bias driven by
          // FRACTIONAL position (identical at any column count) dominated by a
          // strong per-cell random term. This avoids the hard directional
          // column-wipe that reads as a vertical "cut" on narrow/low-column
          // screens — the reveal looks the same on mobile as on desktop.
          const cf = c / Math.max(cols-1, 1);
          const rf = r / Math.max(rows-1, 1);
          const bias = (cf * 0.62 + rf * 0.38) * 0.14; // soft diagonal, 0..0.14
          cd.push({
            revIn:  bias + Math.random() * .68,  // wide stagger → very gradual dissolve
            revOut: bias + Math.random() * .44,
            spd:    3 + Math.random() * 8,
            phi:    Math.random() * Math.PI * 2,
          });
        }
      }
    }

    function resize() {
      const layer = canvas.parentElement;
      const vv = window.visualViewport;
      const baseW = vv?.width ?? window.innerWidth;
      const baseH = vv?.height ?? window.innerHeight;
      const w = Math.max(layer?.clientWidth ?? baseW, 1);
      const h = Math.max(layer?.clientHeight ?? baseH, 1);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      isMobile = window.matchMedia('(max-width: 767px), (min-width: 768px) and (max-width: 1366px) and (orientation: portrait)').matches;
      canvas.width  = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sample();
    }
    resize();
    window.addEventListener('resize', resize);
    const vv = window.visualViewport;
    vv?.addEventListener('resize', resize);
    vv?.addEventListener('scroll', resize);
    const layer = canvas.parentElement;
    const ro = layer ? new ResizeObserver(() => resize()) : null;
    ro?.observe(layer!);
    img.onload = sample;

    // Smoothed mouse (lerped per-frame for buttery response)
    let smX = 0.5, smY = 0.5;

    // ── Render loop ───────────────────────────────────────────────────────────
    function loop(ts: number) {
      raf = requestAnimationFrame(loop);
      const p = progress.get();
      // exposure 0 = photo, 1 = full numbers (mapped to section midpoints in page.tsx)
      const inTransition = p > 0.04 && p < 0.96;
      if (isMobile && !inTransition && ts - lastFrameTs < 24) return;
      lastFrameTs = ts;
      const t = ts / 1000;

      // Smooth mouse
      const mxRaw = mouseRef?.current?.x ?? 0.5;
      const myRaw = mouseRef?.current?.y ?? 0.5;
      smX += (mxRaw - smX) * 0.055;
      smY += (myRaw - smY) * 0.055;

      // 3D tilt angles (radians) driven by mouse position
      const tiltY = (smX - 0.5) * 0.30;   // left/right rotation
      const tiltX = (smY - 0.5) * 0.18;   // up/down rotation

      const exposure = clamp(p);
      const fd = featureDip?.get() ?? 0;
      const eMid   = clamp(smooth(exposure) * (1 - fd));
      const eChaos = clamp(smooth(remap(exposure, 0.76, 0.96)) * (1 - fd));

      // Work in CSS pixels — ctx is already scaled by dpr from resize()
      const W = canvas.width / dpr, H = canvas.height / dpr;
      ctx.clearRect(0, 0, W, H);

      // ── Background image — morph into numbers ──────────────────────────────
      // Photo fades very slowly; digits bloom on top so the morph feels organic.
      {
        const stylize = eChaos * 0.72;
        const morphT = smooth(eMid);
        const photoAlpha = clamp(1 - morphT * 0.72);
        ctx.globalAlpha = photoAlpha;
        ctx.filter = `saturate(${0.88 + 0.28*stylize}) contrast(${1.02 - 0.22*stylize}) brightness(${0.94 - 0.14*stylize}) sepia(${0.03 + 0.03*stylize})`;
        drawImageCover(ctx, img, W, H);
        ctx.filter = 'none';
        // Light matte — eases out early so the photo doesn't go muddy mid-morph
        if (photoAlpha > 0.005) {
          const matte = photoAlpha * (0.28 + 0.22 * (1 - morphT));
          ctx.globalAlpha = matte;
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, W, H);
        }
        ctx.globalAlpha = 1;
      }

      // Dark base creeps in gently — never hard-cuts the photo
      if (eMid > 0.008) {
        ctx.globalAlpha = clamp(smooth(eMid) * 0.48);
        ctx.fillStyle = '#050810';
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 1;
      }

      // ── Cursor spotlight radial (brand steel-blue) ─────────────────────────
      if (eMid > 0.04) {
        const gx = smX * W, gy = smY * H;
        const sr = Math.min(W, H) * 0.38;
        const grd = ctx.createRadialGradient(gx, gy, 0, gx, gy, sr);
        grd.addColorStop(0, `rgba(111,143,166,${0.10 * eMid})`);
        grd.addColorStop(0.5, `rgba(90,120,145,${0.04 * eMid})`);
        grd.addColorStop(1, 'rgba(111,143,166,0)');
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, W, H);
      }

      // ── Digits with 3D perspective projection ──────────────────────────────
      if (eMid >= 0.005 && px.length) {
        const CELL = isMobile ? CELL_MOBILE : CELL_DESKTOP;
        ctx.font = `${FS}px "Courier New",monospace`;
        ctx.textBaseline = 'top';

        const scanY    = (t * 80) % H;
        const cursorX  = smX * W;
        const cursorY  = smY * H;
        const cursorR  = 130;

        // Pre-compute trig for 3D rotation
        const cosY = Math.cos(tiltY), sinY = Math.sin(tiltY);
        const cosX = Math.cos(tiltX), sinX = Math.sin(tiltX);

        for (let i = 0; i < px.length; i++) {
          const c  = cd[i];
          const p_ = px[i];

          // Reveal envelope per cell — driven by section-mapped exposure
          const a_in  = smooth(remap(exposure, c.revIn,  c.revIn  + CELL_REVEAL));
          const fadeOut = 1 - exposure;
          const a_out = smooth(remap(fadeOut, c.revOut, c.revOut + CELL_REVEAL * 0.72));
          const alpha = clamp(a_in - a_out) * (1 - fd);
          if (alpha < .008) continue;

          const col = i % cols, row = Math.floor(i / cols);

          // 3D: centered cell coordinate → rotate → project
          const x3 = (col / cols - 0.5) * W;
          const y3 = (row / rows - 0.5) * H;

          // Rotate Y (left-right tilt)
          const x3r = x3 * cosY;
          const z3r = x3 * sinY;

          // Rotate X (up-down tilt)
          const y3r = y3 * cosX - z3r * sinX;
          const z3f = y3 * sinX + z3r * cosX;

          // Perspective divide — FOV controls depth intensity
          const FOV  = Math.min(W, H) * 1.4;
          const persp = FOV / (FOV + z3f * 0.6);

          const sx = W/2 + x3r * persp;
          const sy = H/2 + y3r * persp;

          // Depth-based alpha dimming (back of grid = slightly fainter)
          const depthAlpha = 0.60 + 0.40 * persp;

          // Digit choice
          const targetDigit = Math.round(p_.lum * 9);
          const wave = Math.sin(col*.27 + row*.38 + t*2.1) * 3;
          const cycleDigit = Math.abs(Math.floor(t*c.spd + c.phi*4 + i*3.71 + wave)) % 10;
          const digit = eChaos > .14
            ? (Math.random() < eChaos*.75 ? cycleDigit : targetDigit)
            : targetDigit;
          const str = String(digit);

          // Base color from image pixel
          const boost = 1 + eChaos * .62;
          let rv = clamp(p_.r * boost, 0, 255);
          let gv = clamp(p_.g * boost, 0, 255);
          let bv = clamp(p_.b * boost, 0, 255);

          // Scanline glow — sweeping horizontal light
          const scanDist = Math.abs(sy - scanY);
          if (scanDist < 24 && eMid > .20) {
            const g = (1 - scanDist/24) * eMid * .70;
            rv = clamp(rv + 100*g, 0, 255);
            gv = clamp(gv + 105*g, 0, 255);
            bv = clamp(bv + 130*g, 0, 255);
          }

          // Cursor proximity glow — brand steel-blue hot spot
          const dCursor = Math.sqrt((sx-cursorX)**2 + (sy-cursorY)**2);
          if (dCursor < cursorR) {
            const prox = (1 - dCursor/cursorR) ** 2;
            const spot = prox * eMid;
            rv = clamp(rv*(1-spot*.55) + 111*spot, 0, 255);
            gv = clamp(gv*(1-spot*.55) + 143*spot, 0, 255);
            bv = clamp(bv*(1-spot*.55) + 166*spot, 0, 255);
          }

          // Mobile: softer shimmer so low-alpha digits don't flicker during long morph
          const shimmerAmp = isMobile ? 0.08 : 0.18;
          const shimmer = (1 - shimmerAmp) + shimmerAmp * Math.sin(t*2.6 + c.phi + col*.52 + row*.87);
          const finalA  = alpha * shimmer * depthAlpha;

          // ── Chromatic aberration during chaos ─────────────────────────────
          if (eChaos > .10) {
            const abr = eChaos * 4.0 * persp;
            ctx.globalAlpha = finalA * eChaos * .50;
            ctx.fillStyle = `rgb(255,35,75)`;
            ctx.fillText(str, sx - abr, sy - abr * .5);
            ctx.fillStyle = `rgb(30,190,255)`;
            ctx.fillText(str, sx + abr, sy + abr * .5);
          }

          // Main digit
          ctx.globalAlpha = finalA;
          ctx.fillStyle = `rgb(${Math.round(rv)},${Math.round(gv)},${Math.round(bv)})`;
          ctx.fillText(str, sx, sy);
        }

        ctx.globalAlpha = 1;
      }

      // ── Cinematic vignette ─────────────────────────────────────────────────
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

      // ── Top-edge dark bar (helps header readability) ────────────────────────
      {
        const tg = ctx.createLinearGradient(0, 0, 0, H * 0.22);
        tg.addColorStop(0,   'rgba(5,8,16,0.55)');
        tg.addColorStop(1,   'rgba(5,8,16,0)');
        ctx.fillStyle = tg;
        ctx.fillRect(0, 0, W, H * 0.22);
      }
    }

    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      vv?.removeEventListener('resize', resize);
      vv?.removeEventListener('scroll', resize);
      ro?.disconnect();
    };
  }, [progress, mouseRef, featureDip]);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 0, display: 'block' }}
    />
  );
}
