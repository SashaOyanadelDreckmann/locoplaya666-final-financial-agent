'use client';

import { useRef, useMemo } from 'react';
import { motion, useInView } from 'framer-motion';

const SILK: [number, number, number, number] = [0.22, 1, 0.36, 1];

// ── ASCII texture generator ────────────────────────────────────────────────────
// Uses the same mathematical-symbol vocabulary as the user's 20,000-peso bill art:
// ∞ √ ≈ ÷ ≠ × π = — arranged in a layered engraving pattern

const SYM = '∞√≈÷≠×π=∞∞√√∞√≈÷≠×∞÷≈∞≠×≈÷∞√∞√≈÷≠∞√≈∞÷≠×π≈∞√÷≠√∞';

function genTexture(rows: number, cols: number): string {
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => SYM[(r * 13 + c * 7) % SYM.length]).join('')
  ).join('\n');
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function BillSection() {
  const ref    = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });

  // Generate once — deterministic, no hydration mismatch
  const texture = useMemo(() => genTexture(46, 110), []);

  return (
    <section
      ref={ref}
      style={{
        background: 'rgba(5,8,16,0.72)',
        padding: 'clamp(80px,12vw,160px) clamp(24px,8vw,120px)',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        overflow: 'hidden',
      }}
    >
      {/* Section label */}
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.75, ease: SILK }}
        style={{
          margin: '0 0 36px',
          fontSize: 10,
          letterSpacing: '0.22em',
          color: 'rgba(164,143,79,0.65)',
          textTransform: 'uppercase',
          fontWeight: 600,
        }}
      >
        Valor
      </motion.p>

      {/* Bill card */}
      <motion.div
        initial={{ opacity: 0, y: 50, rotate: -4 }}
        animate={inView ? { opacity: 1, y: 0, rotate: -1.5 } : {}}
        transition={{ duration: 1.4, delay: 0.12, ease: SILK }}
        whileHover={{ rotate: 0, scale: 1.015 }}
        style={{
          position: 'relative',
          maxWidth: 680,
          borderRadius: 18,
          overflow: 'hidden',
          border: '1px solid rgba(52,160,85,0.20)',
          background:
            'linear-gradient(138deg, rgba(9,35,20,0.97) 0%, rgba(5,20,12,0.99) 55%, rgba(12,38,22,0.97) 100%)',
          boxShadow: [
            '0 0 0 1px rgba(52,160,85,0.07)',
            '0 2px 4px rgba(0,0,0,0.25)',
            '0 12px 32px rgba(0,0,0,0.50)',
            '0 32px 80px rgba(0,0,0,0.40)',
            '0 0 100px rgba(52,160,85,0.07)',
          ].join(', '),
          cursor: 'default',
          transformOrigin: 'bottom center',
          transition: 'box-shadow 0.4s ease',
        }}
      >
        {/* ── ASCII engraving texture ── */}
        <pre
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            margin: 0,
            padding: '10px 12px',
            fontFamily: '"Courier New","Lucida Console",monospace',
            fontSize: '5px',
            lineHeight: 1.22,
            letterSpacing: '0.03em',
            color: 'rgba(52,200,100,0.13)',
            whiteSpace: 'pre',
            overflow: 'hidden',
            userSelect: 'none',
            pointerEvents: 'none',
          }}
        >
          {texture}
        </pre>

        {/* Edge vignette — fades texture to darkness at borders */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(ellipse 80% 70% at 50% 50%, transparent 40%, rgba(5,20,12,0.88) 100%)',
            pointerEvents: 'none',
          }}
        />
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(to right, rgba(5,20,12,0.70) 0%, transparent 18%, transparent 82%, rgba(5,20,12,0.70) 100%)',
            pointerEvents: 'none',
          }}
        />

        {/* ── Bill content ── */}
        <div style={{ position: 'relative', zIndex: 2, padding: '28px 32px 22px' }}>

          {/* Top bar: issuer + serial */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <p style={{
                margin: 0,
                fontSize: 7.5,
                letterSpacing: '0.24em',
                color: 'rgba(52,200,100,0.42)',
                textTransform: 'uppercase',
                fontWeight: 700,
                lineHeight: 1,
              }}>
                Banco Central de Chile
              </p>
            </div>
            <p style={{
              margin: 0,
              fontSize: 7,
              letterSpacing: '0.18em',
              color: 'rgba(52,200,100,0.28)',
              fontFamily: '"Courier New",monospace',
            }}>
              ∞A÷8√≠26π×9÷∞
            </p>
          </div>

          {/* Main denomination row */}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>

            {/* Left — denomination */}
            <div>
              <p style={{
                margin: '0 0 6px',
                fontSize: 8,
                letterSpacing: '0.30em',
                color: 'rgba(52,200,100,0.32)',
                textTransform: 'uppercase',
                fontWeight: 600,
              }}>
                Veinte Mil Pesos
              </p>
              <div style={{
                fontSize: 'clamp(44px,6.5vw,70px)',
                fontFamily: 'Georgia,"Times New Roman",serif',
                fontWeight: 700,
                color: 'rgba(52,200,100,0.52)',
                lineHeight: 0.95,
                letterSpacing: '-0.04em',
              }}>
                $20.000
              </div>
            </div>

            {/* Right — decorative math cluster (security pattern) */}
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{
                fontFamily: '"Courier New",monospace',
                fontSize: 'clamp(18px,2.8vw,32px)',
                lineHeight: 1.05,
                letterSpacing: '-0.02em',
                color: 'rgba(52,200,100,0.14)',
                userSelect: 'none',
              }}>
                {'√∞π÷\n≠×≈∞\n÷√∞π'}
              </div>
            </div>
          </div>

          {/* Separator */}
          <div style={{
            margin: '18px 0 14px',
            height: 1,
            background: 'linear-gradient(to right, transparent, rgba(52,200,100,0.12) 20%, rgba(52,200,100,0.12) 80%, transparent)',
          }} />

          {/* Bottom bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{
              margin: 0,
              fontSize: 6.5,
              letterSpacing: '0.20em',
              color: 'rgba(52,200,100,0.20)',
              fontFamily: '"Courier New",monospace',
              textTransform: 'uppercase',
            }}>
              ≈÷∞≠×√π≈÷∞≠×√π≈÷∞
            </p>
            <p style={{
              margin: 0,
              fontSize: 7.5,
              letterSpacing: '0.16em',
              color: 'rgba(52,200,100,0.30)',
              textTransform: 'uppercase',
              fontWeight: 600,
            }}>
              Chile
            </p>
          </div>
        </div>

        {/* Subtle inner glow — top-left source */}
        <motion.div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(ellipse 55% 45% at 22% 30%, rgba(52,200,100,0.05) 0%, transparent 65%)',
            pointerEvents: 'none',
          }}
          animate={{ opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
        />
      </motion.div>

      {/* Caption */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={inView ? { opacity: 1 } : {}}
        transition={{ duration: 1.2, delay: 1.0, ease: SILK }}
        style={{
          margin: '28px 0 0',
          fontSize: 11.5,
          color: 'rgba(255,255,255,0.13)',
          letterSpacing: '0.02em',
          fontStyle: 'italic',
          fontFamily: 'Georgia,"Times New Roman",serif',
        }}
      >
        El equivalente a claridad financiera.
      </motion.p>
    </section>
  );
}
