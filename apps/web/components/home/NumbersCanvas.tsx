'use client';

import { useEffect, useRef } from 'react';
import type { MotionValue } from 'framer-motion';

// ── helpers ────────────────────────────────────────────────────────────────────
const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const remap = (v: number, lo: number, hi: number) => clamp((v - lo) / (hi - lo));
const ease  = (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

const CELL = 14;  // px — tamaño de celda de carácter
const FS   = 11;  // px — tamaño de fuente

interface Px { r: number; g: number; b: number; lum: number }
interface Cd { revIn: number; revOut: number; spd: number; phi: number }

// ── Fases del scroll (p = 0 → 1) ──────────────────────────────────────────────
// 0.00 – 0.12 : imagen pura
// 0.12 – 0.42 : los dígitos entran columna a columna (izq → der)
// 0.42 – 0.58 : zona peak — dígitos cambian rápido y caóticamente
// 0.58 – 0.88 : los dígitos se van (izq → der igual)
// 0.88 – 1.00 : imagen pura de nuevo

export default function NumbersCanvas({ progress }: { progress: MotionValue<number> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx    = canvas.getContext('2d')!;
    let raf = 0;
    let px: Px[] = [];
    let cd: Cd[] = [];
    let cols = 0;
    let rows = 0;

    /* ── Imagen ─────────────────────────────────────────────── */
    const img = new Image();
    img.src = '/fondo4.jpg';

    /* ── Pixel sampling — muestrear imagen a resolución de celda ─── */
    function sample() {
      if (!img.complete || !img.naturalWidth) return;
      cols = Math.ceil(canvas.width  / CELL);
      rows = Math.ceil(canvas.height / CELL);

      const off = document.createElement('canvas');
      off.width  = cols;
      off.height = rows;
      const oc = off.getContext('2d')!;
      oc.drawImage(img, 0, 0, cols, rows);
      const data = oc.getImageData(0, 0, cols, rows).data;

      px = [];
      cd = [];

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const i4 = (r * cols + c) * 4;
          const rv = data[i4], gv = data[i4 + 1], bv = data[i4 + 2];
          const lum = (rv * 0.299 + gv * 0.587 + bv * 0.114) / 255;
          px.push({ r: rv, g: gv, b: bv, lum });

          const cf = c / Math.max(cols - 1, 1); // 0 (izq) → 1 (der)
          cd.push({
            revIn:  cf * 0.62 + Math.random() * 0.07,
            revOut: cf * 0.62 + Math.random() * 0.07,
            spd:    4 + Math.random() * 10,
            phi:    Math.random() * Math.PI * 2,
          });
        }
      }
    }

    /* ── Resize ─────────────────────────────────────────────── */
    function resize() {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
      sample();
    }

    resize();
    window.addEventListener('resize', resize);
    img.onload = sample;

    /* ── Loop de render ─────────────────────────────────────── */
    function loop(ts: number) {
      raf = requestAnimationFrame(loop);

      const t = ts / 1000;
      const p = progress.get(); // scroll progress 0 → 1

      // Progreso de entrada y salida
      const inP  = ease(remap(p, 0.12, 0.42)); // 0 → 1 mientras entran los números
      const outP = ease(remap(p, 0.58, 0.88)); // 0 → 1 mientras salen los números
      const midP = clamp(inP - outP);           // 1 en la zona peak de números

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      /* ── Imagen de fondo — siempre presente, se desvanece con los dígitos */
      ctx.save();
      ctx.globalAlpha = clamp(1 - midP * 0.93);
      ctx.filter = 'saturate(1.45) contrast(0.65) brightness(0.52) sepia(0.06)';
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      ctx.filter = 'none';
      ctx.restore();

      if (midP < 0.005 || !px.length) return;

      /* ── Dígitos ───────────────────────────────────────────── */
      ctx.font = `${FS}px "Courier New",monospace`;
      ctx.textBaseline = 'top';

      // Línea de scanline que barre verticalmente (efecto digital premium)
      const scanY = (t * 85) % canvas.height;

      for (let i = 0; i < px.length; i++) {
        const c  = cd[i];
        const p_ = px[i];

        // Envolvente de alfa por columna
        const a_in  = ease(remap(inP,  c.revIn,  c.revIn  + 0.30));
        const a_out = ease(remap(outP, c.revOut, c.revOut + 0.30));
        const alpha = clamp(a_in - a_out);
        if (alpha < 0.01) continue;

        const col = i % cols;
        const row = Math.floor(i / cols);
        const x   = col * CELL + 1;
        const y   = row * CELL + 1;

        // Dígito objetivo = luminosidad del pixel → 0-9
        const targetDigit = Math.round(p_.lum * 9);

        // Dígito ciclando (ondulante para efecto orgánico)
        const wave = Math.sin(col * 0.27 + row * 0.38 + t * 2.1) * 3;
        const cycleDigit = Math.abs(Math.floor(t * c.spd + c.phi * 4 + i * 3.71 + wave)) % 10;

        // Mezcla: al inicio aparece el dígito destino, en el peak cicla caóticamente
        const digit = midP > 0.58
          ? cycleDigit
          : midP > 0.15
            ? (Math.random() < midP * 1.5 ? cycleDigit : targetDigit)
            : targetDigit;

        // Color = color del pixel, amplificado en el peak
        const boost = 1 + midP * 0.75;
        let rv = clamp(p_.r * boost, 0, 255);
        let gv = clamp(p_.g * boost, 0, 255);
        let bv = clamp(p_.b * boost, 0, 255);

        // Glow de scanline sobre los dígitos cercanos a la línea
        const dist = Math.abs(y - scanY);
        if (dist < 20 && midP > 0.22) {
          const g = (1 - dist / 20) * midP * 0.60;
          rv = clamp(rv + 95 * g, 0, 255);
          gv = clamp(gv + 95 * g, 0, 255);
          bv = clamp(bv + 95 * g, 0, 255);
        }

        // Shimmer sinusoidal — cada celda pulsa a su propio ritmo
        const shimmer = 0.70 + 0.30 * Math.sin(t * 3.3 + c.phi + col * 0.52 + row * 0.87);

        ctx.fillStyle = `rgba(${Math.round(rv)},${Math.round(gv)},${Math.round(bv)},${alpha * shimmer})`;
        ctx.fillText(String(digit), x, y);
      }
    }

    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [progress]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        display: 'block',
      }}
    />
  );
}
