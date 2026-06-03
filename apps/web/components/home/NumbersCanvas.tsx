'use client';

import { useEffect, useRef } from 'react';
import type { MotionValue } from 'framer-motion';

// ── Helpers ────────────────────────────────────────────────────────────────────
const clamp  = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const remap  = (v: number, lo: number, hi: number) => clamp((v - lo) / (hi - lo));
const ease   = (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

const CELL = 14;
const FS   = 11;

interface Px { r: number; g: number; b: number; lum: number }
interface Cd { revIn: number; revOut: number; spd: number; phi: number }

export interface MousePos { x: number; y: number }

const PHASE = {
  inStart: 0.01,
  inEnd:   0.18,
  outStart: 0.93,
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
  const drawW = srcW * scale, drawH = srcH * scale;
  ctx.drawImage(img, (targetW - drawW) / 2, (targetH - drawH) / 2, drawW, drawH);
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function NumbersCanvas({
  progress,
  mouseRef,
}: {
  progress: MotionValue<number>;
  mouseRef: React.RefObject<MousePos>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx    = canvas.getContext('2d')!;
    let raf = 0, px: Px[] = [], cd: Cd[] = [], cols = 0, rows = 0;

    const img = new Image();
    img.src = '/images/bg-door.jpg';

    // ── Sample image at cell resolution ──────────────────────────────────────
    function sample() {
      if (!img.complete || !img.naturalWidth) return;
      cols = Math.ceil(canvas.width  / CELL);
      rows = Math.ceil(canvas.height / CELL);
      const off = document.createElement('canvas');
      off.width = cols; off.height = rows;
      const oc = off.getContext('2d')!;
      drawImageCover(oc, img, cols, rows);
      const data = oc.getImageData(0, 0, cols, rows).data;
      px = []; cd = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const i4 = (r * cols + c) * 4;
          const rv = data[i4], gv = data[i4+1], bv = data[i4+2];
          px.push({ r: rv, g: gv, b: bv, lum: (rv*.299 + gv*.587 + bv*.114) / 255 });
          const cf = c / Math.max(cols-1, 1);
          cd.push({
            revIn:  cf * .62 + Math.random() * .07,
            revOut: cf * .62 + Math.random() * .07,
            spd:    4 + Math.random() * 10,
            phi:    Math.random() * Math.PI * 2,
          });
        }
      }
    }

    function resize() {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
      sample();
    }
    resize();
    window.addEventListener('resize', resize);
    img.onload = sample;

    // Smoothed mouse (lerped per-frame for buttery response)
    let smX = 0.5, smY = 0.5;

    // ── Render loop ───────────────────────────────────────────────────────────
    function loop(ts: number) {
      raf = requestAnimationFrame(loop);
      const t = ts / 1000;
      const p = progress.get();

      // Smooth mouse
      const mxRaw = mouseRef?.current?.x ?? 0.5;
      const myRaw = mouseRef?.current?.y ?? 0.5;
      smX += (mxRaw - smX) * 0.055;
      smY += (myRaw - smY) * 0.055;

      // 3D tilt angles (radians) driven by mouse position
      const tiltY = (smX - 0.5) * 0.30;   // left/right rotation
      const tiltX = (smY - 0.5) * 0.18;   // up/down rotation

      // Scroll phases
      const inP  = ease(remap(p, PHASE.inStart, PHASE.inEnd));
      const outP = ease(remap(p, PHASE.outStart, PHASE.outEnd));
      const midP = clamp(inP - outP);
      const chaosIn  = ease(remap(p, 0.24, 0.44));
      const chaosOut = ease(remap(p, 0.60, 0.80));
      const chaosP   = clamp(chaosIn - chaosOut);

      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      // ── Background image — matte cinematic ─────────────────────────────────
      {
        const stylize = chaosP * 0.92;
        const photoAlpha = clamp(1 - midP * 0.92);
        ctx.globalAlpha = photoAlpha;
        ctx.filter = `saturate(${0.84 + 0.38*stylize}) contrast(${1.04 - 0.34*stylize}) brightness(${0.92 - 0.20*stylize}) sepia(${0.04 + 0.04*stylize})`;
        drawImageCover(ctx, img, W, H);
        ctx.filter = 'none';
        // Matte overlay — matches .app-shell::before rgba(0,0,0,0.76)
        if (photoAlpha > 0.005) {
          ctx.globalAlpha = photoAlpha * 0.78;
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, W, H);
        }
        ctx.globalAlpha = 1;
      }

      // Dark fill replaces photo as numbers take over
      if (midP > 0.01) {
        ctx.globalAlpha = clamp(midP * 0.96);
        ctx.fillStyle = '#060b18';
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 1;
      }

      // ── Cursor spotlight radial (brand steel-blue) ─────────────────────────
      if (midP > 0.04) {
        const gx = smX * W, gy = smY * H;
        const sr = Math.min(W, H) * 0.38;
        const grd = ctx.createRadialGradient(gx, gy, 0, gx, gy, sr);
        grd.addColorStop(0, `rgba(111,143,166,${0.10 * midP})`);
        grd.addColorStop(0.5, `rgba(90,120,145,${0.04 * midP})`);
        grd.addColorStop(1, 'rgba(111,143,166,0)');
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, W, H);
      }

      // ── Digits with 3D perspective projection ──────────────────────────────
      if (midP >= 0.005 && px.length) {
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

          // Reveal envelope per column
          const a_in  = ease(remap(inP,  c.revIn,  c.revIn  + .30));
          const a_out = ease(remap(outP, c.revOut, c.revOut + .30));
          const alpha = clamp(a_in - a_out);
          if (alpha < .01) continue;

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
          const digit = chaosP > .08
            ? (Math.random() < chaosP*.9 ? cycleDigit : targetDigit)
            : targetDigit;
          const str = String(digit);

          // Base color from image pixel
          const boost = 1 + chaosP * .62;
          let rv = clamp(p_.r * boost, 0, 255);
          let gv = clamp(p_.g * boost, 0, 255);
          let bv = clamp(p_.b * boost, 0, 255);

          // Scanline glow — sweeping horizontal light
          const scanDist = Math.abs(sy - scanY);
          if (scanDist < 24 && midP > .20) {
            const g = (1 - scanDist/24) * midP * .70;
            rv = clamp(rv + 100*g, 0, 255);
            gv = clamp(gv + 105*g, 0, 255);
            bv = clamp(bv + 130*g, 0, 255); // cooler blue tint on scanline
          }

          // Cursor proximity glow — brand steel-blue hot spot
          const dCursor = Math.sqrt((sx-cursorX)**2 + (sy-cursorY)**2);
          if (dCursor < cursorR) {
            const prox = (1 - dCursor/cursorR) ** 2;
            const spot = prox * midP;
            rv = clamp(rv*(1-spot*.55) + 111*spot, 0, 255);
            gv = clamp(gv*(1-spot*.55) + 143*spot, 0, 255);
            bv = clamp(bv*(1-spot*.55) + 166*spot, 0, 255);
          }

          const shimmer = .70 + .30*Math.sin(t*3.3 + c.phi + col*.52 + row*.87);
          const finalA  = alpha * shimmer * depthAlpha;

          // ── Chromatic aberration during chaos ─────────────────────────────
          if (chaosP > .10) {
            const abr = chaosP * 4.0 * persp;
            ctx.globalAlpha = finalA * chaosP * .50;
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
    };
  }, [progress, mouseRef]);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 0, display: 'block' }}
    />
  );
}
