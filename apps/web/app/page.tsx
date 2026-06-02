'use client';

import Image from 'next/image';
import { useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import {
  motion,
  useScroll, useTransform, useSpring,
  useMotionValue, useInView,
  type Variants,
} from 'framer-motion';
import LiveChatDemo from '../components/home/LiveChatDemo';
import SpotlightCard from '../components/home/SpotlightCard';
import Counter from '../components/home/Counter';
import NumbersCanvas from '../components/home/NumbersCanvas';

// ── Easing ────────────────────────────────────────────────────────────────────
const SILK: [number, number, number, number] = [0.22, 1, 0.36, 1];
const SNAP: [number, number, number, number] = [0.4, 0, 0.2, 1];

// ── Colors ─────────────────────────────────────────────────────────────────────
const BLUE  = 'rgba(111,143,166,1)';
const GOLD  = 'rgba(164,143,79,1)';
const BLUE_DIM  = 'rgba(111,143,166,0.45)';
const GOLD_DIM  = 'rgba(164,143,79,0.40)';

// ── Section bg tokens ─────────────────────────────────────────────────────────
const BG_INDIGO = 'linear-gradient(160deg, rgba(6,11,24,0.82) 0%, rgba(9,16,34,0.80) 100%)';
const BG_WARM   = 'linear-gradient(160deg, rgba(16,11,6,0.82) 0%, rgba(20,14,6,0.80) 100%)';
const BG_NAVY   = 'linear-gradient(160deg, rgba(4,10,20,0.82) 0%, rgba(7,14,28,0.80) 100%)';
const BG_SLATE  = 'linear-gradient(160deg, rgba(8,12,18,0.82) 0%, rgba(5,10,16,0.82) 100%)';

const blurUp: Variants = {
  hidden: { opacity: 0, y: 24, filter: 'blur(8px)' },
  visible: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.8, ease: SILK } },
};
const sg = (s = 0.12): Variants => ({ hidden: {}, visible: { transition: { staggerChildren: s } } });

// ── Label ──────────────────────────────────────────────────────────────────────
function Label({ text, color = BLUE_DIM }: { text: string; color?: string }) {
  return (
    <p style={{ margin: '0 0 24px', fontSize: 10, letterSpacing: '0.22em', color, textTransform: 'uppercase', fontWeight: 700 }}>
      {text}
    </p>
  );
}

// ── Accent line ────────────────────────────────────────────────────────────────
function AccentLine({ color = BLUE, delay = 0, progress }: { color?: string; delay?: number; progress?: any }) {
  const scaleX = progress
    ? useTransform(progress, [0, 0.3], [0, 1])
    : undefined;
  return (
    <motion.div
      style={{
        height: 1,
        background: color,
        opacity: 0.18,
        transformOrigin: 'left',
        scaleX: scaleX ?? undefined,
      }}
      {...(!progress ? {
        initial: { scaleX: 0, opacity: 0 },
        whileInView: { scaleX: 1, opacity: 0.18 },
        viewport: { once: true },
        transition: { duration: 0.9, delay, ease: SNAP },
      } : {})}
    />
  );
}

// ── Data ──────────────────────────────────────────────────────────────────────
const FEATURES = [
  { n: '01', title: 'Diagnóstico completo', body: 'Analiza ingresos, gastos, deudas y metas. En minutos tienes una radiografía honesta de tu situación.', accent: BLUE },
  { n: '02', title: 'Conversación natural', body: 'Pregunta como si hablaras con un asesor real. Sin formularios, sin hojas de cálculo, sin tecnicismos.', accent: 'rgba(180,160,90,0.7)' },
  { n: '03', title: 'Plan de acción', body: 'Recibes recomendaciones concretas y un informe descargable adaptado a tu perfil y objetivos.', accent: GOLD },
];

const STEPS = [
  { n: '01', title: 'Cuéntanos tu situación', body: 'Respondes un cuestionario breve sobre ingresos, deudas, gastos y metas. 10 minutos.', dot: BLUE },
  { n: '02', title: 'La IA analiza todo', body: 'El agente genera un diagnóstico detallado con tensiones, oportunidades y prioridades.', dot: 'rgba(255,255,255,0.30)' },
  { n: '03', title: 'Recibes claridad', body: 'Conversas con el agente, simulas escenarios y descargas tu plan de acción en PDF.', dot: GOLD },
];

const STATS = [
  { to: 18, suffix: '%', label: 'ahorro mensual potencial identificado', color: BLUE },
  { to: 10, suffix: ' min', label: 'para un diagnóstico financiero completo', color: 'rgba(255,255,255,0.8)' },
  { to: 23, suffix: '%', label: 'menos carga de deuda priorizando bien', color: GOLD },
];

const PROBLEM_LINES = [
  'Las personas no entienden sus propias finanzas.',
  'Los asesores son caros o inaccesibles.',
  'Los chatbots genéricos no conocen el contexto.',
];

// ── Problem Section — sticky scroll con 3 fases ────────────────────────────────
function ProblemSection() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });

  const sp = scrollYProgress;

  // Cada línea se activa en su tercio
  const c0 = useTransform(sp, [0, 0.08, 0.30, 0.42], [0.12, 1, 1, 0.15]);
  const c1 = useTransform(sp, [0.33, 0.42, 0.62, 0.72], [0.12, 1, 1, 0.15]);
  const c2 = useTransform(sp, [0.65, 0.74, 0.98, 1.0], [0.12, 1, 1, 0.90]);

  const y0 = useTransform(sp, [0, 0.4], ['6px', '-6px']);
  const y1 = useTransform(sp, [0.1, 0.6], ['10px', '-10px']);
  const y2 = useTransform(sp, [0.3, 1.0], ['14px', '-6px']);

  // Barra de progreso lateral
  const barH = useTransform(sp, [0, 1], ['0%', '100%']);

  // Fondo cambia de color con el scroll
  const overlayOpacity = useTransform(sp, [0, 0.5, 1], [0, 0.22, 0]);

  const colors = [c0, c1, c2];
  const ys = [y0, y1, y2];

  return (
    <div ref={ref} style={{ height: '280vh', position: 'relative' }}>
      <div style={{
        position: 'sticky',
        top: 0,
        height: '100dvh',
        display: 'flex',
        alignItems: 'center',
        overflow: 'hidden',
        background: BG_INDIGO,
        borderTop: '1px solid rgba(111,143,166,0.10)',
      }}>

        {/* Color overlay vibrante */}
        <motion.div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(ellipse 80% 60% at 20% 50%, rgba(31,60,100,0.35) 0%, transparent 70%)',
          opacity: overlayOpacity,
        }} />

        {/* Barra lateral de progreso */}
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: 'rgba(111,143,166,0.08)' }}>
          <motion.div style={{
            position: 'absolute', top: 0, left: 0, right: 0,
            background: `linear-gradient(to bottom, ${BLUE}, ${GOLD})`,
            height: barH,
          }} />
        </div>

        <div style={{ padding: 'clamp(40px,8vw,120px)', width: '100%', maxWidth: 900 }}>
          <Label text="El problema" color={BLUE_DIM} />

          {PROBLEM_LINES.map((line, i) => (
            <div key={i}>
              <motion.p
                style={{
                  fontSize: 'clamp(22px,3.6vw,50px)',
                  fontFamily: 'Georgia, "Times New Roman", serif',
                  fontWeight: 700,
                  lineHeight: 1.12,
                  letterSpacing: '-0.028em',
                  margin: 0,
                  padding: 'clamp(20px,3vw,36px) 0',
                  opacity: colors[i],
                  y: ys[i],
                  color: 'white',
                }}
              >
                {line}
              </motion.p>
              {i < PROBLEM_LINES.length - 1 && (
                <div style={{ height: 1, background: 'rgba(111,143,166,0.08)' }} />
              )}
            </div>
          ))}

          {/* Número de línea activa */}
          <motion.p style={{
            marginTop: 40,
            fontSize: 10,
            letterSpacing: '0.22em',
            color: GOLD_DIM,
            textTransform: 'uppercase',
            opacity: useTransform(sp, [0.05, 0.15], [0, 1]),
          }}>
            Scroll para avanzar
          </motion.p>
        </div>
      </div>
    </div>
  );
}

// ── Features Section ───────────────────────────────────────────────────────────
function FeaturesSection() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });

  const headY = useTransform(scrollYProgress, [0, 0.5, 1], [40, 0, -30]);
  const headO = useTransform(scrollYProgress, [0, 0.15, 0.75, 1], [0, 1, 1, 0.3]);

  return (
    <section ref={ref} style={{
      position: 'relative',
      overflow: 'hidden',
      background: BG_WARM,
      padding: 'clamp(80px,12vw,160px) clamp(24px,8vw,120px)',
      borderTop: '1px solid rgba(164,143,79,0.10)',
    }}>

      {/* Ambient dorado */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 70% 50% at 80% 40%, rgba(100,80,20,0.22) 0%, transparent 70%)',
      }} />

      <motion.div style={{ y: headY, opacity: headO, position: 'relative', zIndex: 1 }}>
        <Label text="Para ti" color={GOLD_DIM} />
        <h2 style={{
          fontSize: 'clamp(30px,5vw,68px)',
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontWeight: 700,
          lineHeight: 1.02,
          letterSpacing: '-0.034em',
          color: 'white',
          margin: '0 0 clamp(48px,7vw,80px)',
          maxWidth: 540,
        }}>
          Lo que el agente<br />
          <em style={{ fontStyle: 'italic', color: 'rgba(255,255,255,0.55)' }}>hace por ti.</em>
        </h2>
      </motion.div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3" style={{ position: 'relative', zIndex: 1 }}>
        {FEATURES.map(({ n, title, body, accent }, i) => {
          const cardRef = useRef<HTMLDivElement>(null);
          const { scrollYProgress: cardP } = useScroll({ target: cardRef, offset: ['start end', 'center center'] });
          const cardY = useTransform(cardP, [0, 1], [50, 0]);
          const cardO = useTransform(cardP, [0, 0.6], [0, 1]);
          return (
            <motion.div key={n} ref={cardRef} style={{ y: cardY, opacity: cardO }}>
              <SpotlightCard
                glow={`${accent.replace('1)', '0.18)')}`}
                className="h-full p-6 md:p-7"
              >
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', color: accent.replace('1)', '0.55)') }}>
                  {n}
                </span>
                <div style={{ width: 24, height: 2, background: accent, marginTop: 16, marginBottom: 16, borderRadius: 1, opacity: 0.6 }} />
                <h3 style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.28, letterSpacing: '-0.015em', color: 'rgba(255,255,255,0.92)', margin: '0 0 10px' }}>
                  {title}
                </h3>
                <p style={{ fontSize: 13.5, lineHeight: 1.68, color: 'rgba(255,255,255,0.40)', margin: 0 }}>{body}</p>
              </SpotlightCard>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}

// ── Stats Section ──────────────────────────────────────────────────────────────
function StatsSection() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });

  const headY = useTransform(scrollYProgress, [0, 0.4, 1], [30, 0, -20]);
  const headO = useTransform(scrollYProgress, [0, 0.2, 0.8, 1], [0, 1, 1, 0.4]);

  return (
    <section ref={ref} style={{
      background: BG_NAVY,
      padding: 'clamp(70px,10vw,130px) clamp(24px,8vw,120px)',
      borderTop: '1px solid rgba(111,143,166,0.10)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Ambient azul profundo */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 60% 80% at 10% 60%, rgba(20,50,100,0.28) 0%, transparent 65%)',
      }} />

      <motion.div style={{ y: headY, opacity: headO, position: 'relative', zIndex: 1 }}>
        <Label text="En números" color={BLUE_DIM} />
      </motion.div>

      <div className="grid grid-cols-1 gap-x-8 gap-y-14 sm:grid-cols-3" style={{ position: 'relative', zIndex: 1 }}>
        {STATS.map(({ to, suffix, label, color }, i) => {
          const statRef = useRef<HTMLDivElement>(null);
          const { scrollYProgress: sP } = useScroll({ target: statRef, offset: ['start end', 'center center'] });
          const sY = useTransform(sP, [0, 1], [40, 0]);
          const sO = useTransform(sP, [0, 0.7], [0, 1]);
          return (
            <motion.div key={i} ref={statRef} style={{ y: sY, opacity: sO }}>
              <div style={{ width: 32, height: 3, background: color, borderRadius: 2, marginBottom: 16, opacity: 0.7 }} />
              <div style={{
                fontFamily: 'Georgia, "Times New Roman", serif',
                fontSize: 'clamp(48px,7vw,88px)',
                fontWeight: 700,
                lineHeight: 1,
                letterSpacing: '-0.04em',
                color,
              }}>
                <Counter to={to} suffix={suffix} />
              </div>
              <p style={{ marginTop: 14, maxWidth: 220, fontSize: 13.5, lineHeight: 1.68, color: 'rgba(255,255,255,0.32)' }}>
                {label}
              </p>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}

// ── Steps Section ──────────────────────────────────────────────────────────────
function StepsSection() {
  const router = useRouter();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });

  const headY = useTransform(scrollYProgress, [0, 0.4, 1], [40, 0, -25]);
  const headO = useTransform(scrollYProgress, [0, 0.2, 0.85, 1], [0, 1, 1, 0.3]);
  const lineH = useTransform(scrollYProgress, [0.15, 0.75], ['0%', '100%']);

  return (
    <section ref={ref} style={{
      background: BG_SLATE,
      padding: 'clamp(80px,12vw,160px) clamp(24px,8vw,120px)',
      borderTop: '1px solid rgba(164,143,79,0.10)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Ambient cálido izquierda */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 55% 70% at 0% 50%, rgba(70,50,10,0.20) 0%, transparent 65%)',
      }} />

      <motion.div style={{ y: headY, opacity: headO, position: 'relative', zIndex: 1 }}>
        <Label text="Proceso" color={GOLD_DIM} />
        <h2 style={{
          fontSize: 'clamp(30px,5vw,68px)',
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontWeight: 700,
          lineHeight: 1.02,
          letterSpacing: '-0.034em',
          color: 'white',
          margin: '0 0 clamp(48px,7vw,80px)',
          maxWidth: 440,
        }}>
          Tres pasos<br />
          <em style={{ fontStyle: 'italic', color: 'rgba(255,255,255,0.50)' }}>hacia la claridad.</em>
        </h2>
      </motion.div>

      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* Línea conectora animada con scroll */}
        <div style={{ position: 'absolute', left: 19, top: 28, bottom: 28, width: 1, background: 'rgba(111,143,166,0.08)' }}>
          <motion.div style={{
            position: 'absolute', top: 0, left: 0, right: 0,
            background: `linear-gradient(to bottom, ${BLUE}, ${GOLD})`,
            height: lineH,
          }} />
        </div>

        {STEPS.map(({ n, title, body, dot }, i) => {
          const stepRef = useRef<HTMLDivElement>(null);
          const { scrollYProgress: sP } = useScroll({ target: stepRef, offset: ['start end', 'center center'] });
          const sY = useTransform(sP, [0, 1], [30, 0]);
          const sO = useTransform(sP, [0, 0.6], [0, 1]);
          return (
            <motion.div
              key={n}
              ref={stepRef}
              style={{
                display: 'grid',
                gridTemplateColumns: '40px 1fr',
                gap: 'clamp(20px,3vw,44px)',
                padding: 'clamp(22px,3.5vw,40px) 0',
                position: 'relative',
                zIndex: 1,
                alignItems: 'start',
                y: sY,
                opacity: sO,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 5 }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: dot,
                  boxShadow: `0 0 0 3px ${dot.replace('1)', '0.12)')}, 0 0 12px ${dot.replace('1)', '0.45)')}`,
                }} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: GOLD_DIM, letterSpacing: '0.10em', flexShrink: 0 }}>{n}</span>
                  <h3 style={{ fontSize: 'clamp(15px,1.8vw,19px)', fontWeight: 600, color: 'rgba(255,255,255,0.88)', margin: 0, lineHeight: 1.28, letterSpacing: '-0.015em' }}>{title}</h3>
                </div>
                <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.35)', lineHeight: 1.68, margin: 0, paddingLeft: 22 }}>{body}</p>
              </div>
            </motion.div>
          );
        })}
      </div>

      <motion.button
        whileInView={{ opacity: 1, y: 0 }}
        initial={{ opacity: 0, y: 16 }}
        viewport={{ once: true }}
        transition={{ delay: 0.3, duration: 0.7, ease: SILK }}
        onClick={() => router.push('/intake')}
        whileHover={{ opacity: 0.65 }}
        whileTap={{ scale: 0.97 }}
        style={{ marginTop: 40, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 13, fontWeight: 600, color: GOLD_DIM, display: 'inline-flex', alignItems: 'center', gap: 7, letterSpacing: '-0.01em', position: 'relative', zIndex: 1 }}
      >
        Comenzar diagnóstico <ArrowRight size={13} />
      </motion.button>
    </section>
  );
}

// ── Preview Section ────────────────────────────────────────────────────────────
function PreviewSection() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const headY = useTransform(scrollYProgress, [0, 0.5, 1], [40, 0, -30]);
  const headO = useTransform(scrollYProgress, [0, 0.18, 0.8, 1], [0, 1, 1, 0.3]);

  return (
    <section ref={ref} style={{
      background: BG_INDIGO,
      padding: 'clamp(80px,12vw,160px) clamp(24px,8vw,120px)',
      borderTop: '1px solid rgba(111,143,166,0.10)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 50% 60% at 90% 30%, rgba(20,45,85,0.30) 0%, transparent 65%)',
      }} />
      <motion.div style={{ y: headY, opacity: headO, position: 'relative', zIndex: 1 }}>
        <Label text="En acción" color={BLUE_DIM} />
        <h2 style={{
          fontSize: 'clamp(30px,5vw,68px)',
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontWeight: 700,
          lineHeight: 1.02,
          letterSpacing: '-0.034em',
          color: 'white',
          margin: '0 0 clamp(48px,7vw,80px)',
          maxWidth: 520,
        }}>
          Una conversación que<br />
          <em style={{ fontStyle: 'italic', color: 'rgba(255,255,255,0.50)' }}>cambia cómo ves tu dinero.</em>
        </h2>
      </motion.div>
      <motion.div
        whileInView={{ opacity: 1, y: 0 }}
        initial={{ opacity: 0, y: 30 }}
        viewport={{ once: true }}
        transition={{ duration: 0.9, ease: SILK }}
        style={{ position: 'relative', zIndex: 1 }}
      >
        <LiveChatDemo />
      </motion.div>
    </section>
  );
}

// ── CTA Section ────────────────────────────────────────────────────────────────
function CtaSection() {
  const router = useRouter();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const headY = useTransform(scrollYProgress, [0, 0.5, 1], [60, 0, -40]);
  const headO = useTransform(scrollYProgress, [0, 0.2, 0.85, 1], [0, 1, 1, 0.2]);

  return (
    <section ref={ref} style={{
      background: BG_WARM,
      padding: 'clamp(120px,16vw,220px) clamp(24px,8vw,120px)',
      borderTop: '1px solid rgba(164,143,79,0.10)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Ambient dorado radiante */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(90,68,15,0.28) 0%, transparent 70%)',
      }} />

      <motion.div style={{ y: headY, opacity: headO, position: 'relative', zIndex: 1 }}>
        <motion.h2
          style={{
            fontSize: 'clamp(52px,9vw,120px)',
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontStyle: 'italic',
            fontWeight: 700,
            lineHeight: 0.88,
            letterSpacing: '-0.046em',
            color: 'white',
            margin: '0 0 30px',
          }}
        >
          Prueba<br />el agente.
        </motion.h2>

        <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.35)', margin: '0 0 44px', lineHeight: 1.62, maxWidth: 360, letterSpacing: '-0.005em' }}>
          Un prototipo de tesis real, disponible para explorar libremente.
        </p>

        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
          <motion.button
            onClick={() => router.push('/intake')}
            whileHover={{ scale: 1.02, opacity: 0.88 }}
            whileTap={{ scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'white', border: 'none', borderRadius: 999, padding: '12px 26px', fontSize: 13, fontWeight: 600, color: '#050810', cursor: 'pointer', letterSpacing: '-0.01em' }}
          >
            Comenzar diagnóstico <ArrowRight size={13} />
          </motion.button>
          <motion.button
            onClick={() => router.push('/agent')}
            whileHover={{ opacity: 0.65 }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: GOLD_DIM, padding: 0, letterSpacing: '-0.01em' }}
          >
            Hablar con el agente →
          </motion.button>
        </div>

        <p style={{ marginTop: 56, fontSize: 10, letterSpacing: '0.16em', color: 'rgba(255,255,255,0.11)', textTransform: 'uppercase' }}>
          Proyecto de tesis — Ingeniería / Economía
        </p>
      </motion.div>
    </section>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function HomePage() {
  const router = useRouter();
  const scrollRangeRef = useRef<HTMLDivElement>(null);
  const heroSectionRef = useRef<HTMLElement>(null);

  const mousePosRef = useRef<{ x: number; y: number }>({ x: 0.5, y: 0.5 });
  const heroMX = useMotionValue(0.5);
  const heroMY = useMotionValue(0.5);
  const springCfg = { damping: 28, stiffness: 180, mass: 0.8 };
  const rotX = useSpring(useTransform(heroMY, [0, 1], [4, -4]), springCfg);
  const rotY = useSpring(useTransform(heroMX, [0, 1], [-4, 4]), springCfg);

  const { scrollYProgress: canvasProgress } = useScroll({
    target: scrollRangeRef,
    offset: ['start start', 'end end'],
  });
  const { scrollYProgress: heroProgress } = useScroll({
    target: heroSectionRef,
    offset: ['start start', 'end end'],
  });
  const heroY       = useTransform(heroProgress, [0, 0.6], [0, -55]);
  const lineOpacity = useTransform(heroProgress, [0, 0.18], [1, 0]);

  return (
    <main style={{ background: '#060b18', color: 'white', position: 'relative' }}>

      {/* Canvas fijo */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
        <NumbersCanvas progress={canvasProgress} mouseRef={mousePosRef} />
      </div>

      {/* Grain */}
      <div
        aria-hidden
        style={{
          position: 'fixed', inset: 0, zIndex: 10, pointerEvents: 'none',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.78' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23g)'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'repeat', backgroundSize: '220px 220px',
          opacity: 0.048, mixBlendMode: 'overlay',
        }}
      />

      {/* Rango de scroll para el canvas */}
      <div ref={scrollRangeRef} style={{ position: 'relative', zIndex: 1 }}>

        {/* ─── HERO ──────────────────────────────────────────────────────── */}
        <section
          ref={heroSectionRef}
          style={{ position: 'relative', height: '100dvh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
          onMouseMove={(e) => {
            const nx = e.clientX / window.innerWidth;
            const ny = e.clientY / window.innerHeight;
            heroMX.set(nx); heroMY.set(ny);
            mousePosRef.current.x = nx; mousePosRef.current.y = ny;
          }}
          onMouseLeave={() => { heroMX.set(0.5); heroMY.set(0.5); }}
        >
          {/* Ambient orbs */}
          <div style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none', overflow: 'hidden' }}>
            <motion.div
              style={{ position: 'absolute', left: '6%', top: '15%', width: 560, height: 560, borderRadius: '50%', background: 'radial-gradient(circle, rgba(111,143,166,0.16) 0%, transparent 68%)', filter: 'blur(80px)' }}
              animate={{ scale: [1, 1.20, 1], x: [0, 28, 0] }}
              transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
              style={{ position: 'absolute', right: '4%', bottom: '18%', width: 420, height: 420, borderRadius: '50%', background: 'radial-gradient(circle, rgba(164,143,79,0.14) 0%, transparent 68%)', filter: 'blur(70px)' }}
              animate={{ scale: [1, 1.25, 1], y: [0, -40, 0] }}
              transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
            />
            <motion.div
              style={{ position: 'absolute', left: '50%', top: '10%', width: 280, height: 280, borderRadius: '50%', background: 'radial-gradient(circle, rgba(31,60,100,0.18) 0%, transparent 70%)', filter: 'blur(55px)' }}
              animate={{ scale: [1, 1.40, 1], x: [0, -22, 0] }}
              transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut', delay: 5 }}
            />
            <motion.div
              style={{ position: 'absolute', left: '28%', bottom: '28%', width: 240, height: 240, borderRadius: '50%', background: 'radial-gradient(circle, rgba(90,68,15,0.12) 0%, transparent 70%)', filter: 'blur(50px)' }}
              animate={{ scale: [1, 1.45, 1] }}
              transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut', delay: 1.5 }}
            />
          </div>

          {/* Gradiente — visible desde el primer frame */}
          <div style={{
            position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none',
            background: 'linear-gradient(to bottom, rgba(6,11,24,0.78) 0%, rgba(6,11,24,0.25) 22%, rgba(6,11,24,0.06) 44%, rgba(6,11,24,0.55) 68%, rgba(6,11,24,0.92) 100%)',
          }} />
          {/* Fondo sólido detrás del texto hero para garantizar contraste */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: '38%', zIndex: 3, pointerEvents: 'none',
            background: 'linear-gradient(to top, rgba(6,11,24,0.96) 0%, rgba(6,11,24,0.70) 60%, transparent 100%)',
          }} />

          {/* Contenido */}
          <div style={{ position: 'relative', zIndex: 10, height: '100%' }}>
            <motion.div style={{ display: 'flex', height: '100%', flexDirection: 'column', rotateX: rotX, rotateY: rotY }}>

              {/* Header */}
              <div className="home-page-header" style={{ paddingTop: 'clamp(56px,9vh,88px)' }}>
                <motion.button
                  onClick={() => router.push('/')}
                  aria-label="Financieramente"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.0, ease: SILK }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  <div style={{ width: 40, height: 40, borderRadius: 9, overflow: 'hidden', flexShrink: 0, boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }}>
                    <Image src="/logo-financieramente.jpg" alt="Financieramente" width={40} height={40} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.82)', letterSpacing: '0.005em' }}>
                    Financieramente
                  </span>
                </motion.button>

                <motion.button
                  onClick={() => router.push('/agent')}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.08, ease: SILK }}
                  whileHover={{ opacity: 0.72 }}
                  style={{ background: 'none', border: '1px solid rgba(255,255,255,0.20)', borderRadius: 999, padding: '7px 16px', fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.68)', cursor: 'pointer' }}
                >
                  Entrar
                </motion.button>
              </div>

              <div style={{ flex: 1 }} />

              {/* Hero copy — visible INMEDIATAMENTE en desktop */}
              <motion.div className="home-page-hero" style={{ y: heroY }}>

                {/* Línea de acento arriba del título */}
                <motion.div
                  initial={{ scaleX: 0, opacity: 0 }}
                  animate={{ scaleX: 1, opacity: 0.7 }}
                  transition={{ duration: 0.6, delay: 0.0, ease: SNAP }}
                  style={{ width: 36, height: 2, background: BLUE, borderRadius: 1, marginBottom: 22, transformOrigin: 'left' }}
                />

                {/* Título — sin blur initial, visible desde el primer frame */}
                <h1 style={{ fontSize: 'clamp(52px,8vw,110px)', fontWeight: 700, lineHeight: 0.86, letterSpacing: '-0.048em', color: 'white', margin: '0 0 22px' }}>
                  <motion.span
                    initial={{ opacity: 0, y: 28 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.70, delay: 0.0, ease: SILK }}
                    style={{ display: 'block' }}
                  >
                    Tu dinero,
                  </motion.span>
                  <motion.em
                    initial={{ opacity: 0, y: 22 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.70, delay: 0.12, ease: SILK }}
                    style={{ display: 'block', fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 400, fontStyle: 'italic', color: 'rgba(255,255,255,0.55)' }}
                  >
                    más claro.
                  </motion.em>
                </h1>

                <motion.p
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.60, delay: 0.22, ease: SILK }}
                  style={{ fontSize: 15, color: 'rgba(255,255,255,0.42)', lineHeight: 1.58, maxWidth: 320, margin: '0 0 34px', letterSpacing: '-0.01em' }}
                >
                  Una conversación honesta sobre tus finanzas.
                </motion.p>

                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.55, delay: 0.30, ease: SILK }}
                  style={{ display: 'flex', gap: 22, alignItems: 'center', flexWrap: 'wrap' }}
                >
                  <motion.button
                    onClick={() => router.push('/agent')}
                    whileHover={{ scale: 1.03, opacity: 0.88 }}
                    whileTap={{ scale: 0.97 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'white', border: 'none', borderRadius: 999, padding: '11px 22px', fontSize: 13, fontWeight: 600, color: '#050810', cursor: 'pointer' }}
                  >
                    Comenzar <ArrowRight size={13} />
                  </motion.button>
                  <motion.button
                    onClick={() => router.push('/intake')}
                    whileHover={{ opacity: 0.65 }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'rgba(255,255,255,0.38)', padding: 0, letterSpacing: '-0.01em' }}
                  >
                    Ver diagnóstico →
                  </motion.button>
                </motion.div>
              </motion.div>

              {/* Scroll cue */}
              <motion.div style={{ opacity: lineOpacity, padding: '0 clamp(24px,8vw,120px) 30px' }}>
                <motion.div
                  initial={{ scaleY: 0, opacity: 0 }}
                  animate={{ scaleY: 1, opacity: 1 }}
                  transition={{ duration: 0.6, delay: 0.7, ease: SILK }}
                  style={{ transformOrigin: 'top', width: 1, height: 32, background: 'rgba(255,255,255,0.22)', borderRadius: 1 }}
                />
              </motion.div>

              <div className="home-page-caption">
                <span>Proyecto de tesis.</span>
                <span>Financieramente</span>
              </div>
            </motion.div>
          </div>
        </section>

        <ProblemSection />
        <FeaturesSection />
        <StatsSection />
        <StepsSection />

      </div>

      <div style={{ position: 'relative', zIndex: 1 }}>
        <PreviewSection />
        <CtaSection />
      </div>

    </main>
  );
}
