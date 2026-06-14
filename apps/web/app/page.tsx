'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import {
  motion,
  useMotionValue,
  useScroll,
  useSpring,
  useTransform,
} from 'framer-motion';
import SpotlightCard from '@/components/inicio/SpotlightCard';
import Counter from '@/components/inicio/Counter';
import NumbersCanvas, { type MousePos } from '@/components/inicio/NumbersCanvas';
import BrandWordmark from '@/components/marca/BrandWordmark';
import { getSessionInfo } from '@/lib/api';
import { hasCompletedIntakeAccess } from '@/lib/sesion/sessionAccess';
import { MOBILE_SHELL_MEDIA } from '@/lib/interfaz/viewport-mode';

async function resolveDiagnosisEntryRoute(): Promise<'/agent' | '/intake' | '/register'> {
  try {
    const session = await getSessionInfo();
    if (session?.id) {
      return hasCompletedIntakeAccess(session.injectedIntake) ? '/agent' : '/intake';
    }
  } catch {
    // Sin sesión válida.
  }
  return '/register';
}

const MotionLink = motion(Link);

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

// ── Easing ────────────────────────────────────────────────────────────────────
const SILK: [number, number, number, number] = [0.22, 1, 0.36, 1];
const SNAP: [number, number, number, number] = [0.4, 0, 0.2, 1];

// ── Colors ─────────────────────────────────────────────────────────────────────
const BLUE  = 'rgba(111,143,166,1)';
const GOLD  = 'rgba(164,143,79,1)';
const BLUE_DIM  = 'rgba(111,143,166,0.45)';
const GOLD_DIM  = 'rgba(164,143,79,0.40)';

// ── Label ──────────────────────────────────────────────────────────────────────
function Label({ text, color = BLUE_DIM }: { text: string; color?: string }) {
  return (
    <p style={{ margin: '0 0 24px', fontSize: 10, letterSpacing: '0.22em', color, textTransform: 'uppercase', fontWeight: 700 }}>
      {text}
    </p>
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
function ProblemSection({
  sectionRef,
  mobileShell,
}: {
  sectionRef: RefObject<HTMLDivElement | null>;
  mobileShell: boolean;
}) {
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start start', 'end end'] });

  const sp = scrollYProgress;

  const c0 = useTransform(sp, mobileShell ? [0, 0.12, 0.34, 0.48] : [0, 0.08, 0.30, 0.42], mobileShell ? [0.35, 1, 1, 0.35] : [0.12, 1, 1, 0.15]);
  const c1 = useTransform(sp, mobileShell ? [0.30, 0.40, 0.64, 0.76] : [0.33, 0.42, 0.62, 0.72], mobileShell ? [0.35, 1, 1, 0.35] : [0.12, 1, 1, 0.15]);
  const c2 = useTransform(sp, mobileShell ? [0.58, 0.68, 0.96, 1.0] : [0.65, 0.74, 0.98, 1.0], mobileShell ? [0.35, 1, 1, 0.85] : [0.12, 1, 1, 0.90]);

  const y0 = useTransform(sp, [0, 0.4], mobileShell ? ['0px', '0px'] : ['6px', '-6px']);
  const y1 = useTransform(sp, [0.1, 0.6], mobileShell ? ['0px', '0px'] : ['10px', '-10px']);
  const y2 = useTransform(sp, [0.3, 1.0], mobileShell ? ['0px', '0px'] : ['14px', '-6px']);

  const barH = useTransform(sp, [0, 1], ['0%', '100%']);
  const overlayOpacity = useTransform(sp, [0, 0.5, 1], mobileShell ? [0, 0.12, 0] : [0, 0.22, 0]);

  const colors = [c0, c1, c2];
  const ys = [y0, y1, y2];

  return (
    <div ref={sectionRef as React.RefObject<HTMLDivElement>} className="home-problem-wrapper" style={{ position: 'relative' }}>
      <div
        className="home-problem-sticky"
        style={{
        position: 'sticky',
        top: 0,
        height: '100dvh',
        display: 'flex',
        alignItems: 'center',
        overflow: 'hidden',
        background: 'transparent',
        WebkitMaskImage: 'linear-gradient(to bottom, black 72%, transparent 100%)',
        maskImage: 'linear-gradient(to bottom, black 72%, transparent 100%)',
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

        <div style={{ padding: 'clamp(24px,8vw,120px)', width: '100%', maxWidth: 900 }}>
          <Label text="El problema" color={BLUE_DIM} />

          {PROBLEM_LINES.map((line, i) => (
            <div key={i}>
              <motion.p
                style={{
                  fontSize: 'clamp(30px,5vw,50px)',
                  fontFamily: 'Georgia, "Times New Roman", serif',
                  fontWeight: 700,
                  lineHeight: 1.12,
                  letterSpacing: '-0.028em',
                  margin: 0,
                  padding: 'clamp(16px,3vw,36px) 0',
                  opacity: colors[i],
                  y: ys[i],
                  color: 'white',
                  textShadow: '0 2px 14px rgba(0,0,0,0.98), 0 0 40px rgba(0,0,0,0.90)',
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
function FeaturesSection({ sectionRef }: { sectionRef: RefObject<HTMLElement | null> }) {
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start end', 'end start'] });

  const headY = useTransform(scrollYProgress, [0, 0.5, 1], [40, 0, -30]);
  const headO = useTransform(scrollYProgress, [0, 0.15, 0.75, 1], [0, 1, 1, 0.3]);

  return (
    <section ref={sectionRef as React.RefObject<HTMLElement>} className="home-content-section" style={{
      position: 'relative',
      overflow: 'hidden',
      background: 'transparent',
      padding: 'clamp(52px,12vw,160px) clamp(24px,8vw,120px)',
    }}>

      {/* Ambient dorado — sutil */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 70% 50% at 80% 40%, rgba(100,80,20,0.05) 0%, transparent 70%)',
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
          margin: '0 0 clamp(28px,7vw,80px)',
          maxWidth: 540,
        }}>
          Lo que el agente<br />
          <em style={{ fontStyle: 'italic', color: 'rgba(255,255,255,0.55)' }}>hace por ti.</em>
        </h2>
      </motion.div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3" style={{ position: 'relative', zIndex: 1 }}>
        {FEATURES.map(({ n, title, body, accent }) => {
          return (
            <motion.div
              key={n}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.35 }}
              transition={{ duration: 0.6, ease: SILK }}
            >
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
    <section ref={ref} className="home-content-section" style={{
      background: 'transparent',
      padding: 'clamp(44px,10vw,130px) clamp(24px,8vw,120px)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Ambient azul profundo */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 60% 80% at 10% 60%, rgba(20,50,100,0.10) 0%, transparent 65%)',
      }} />

      <motion.div style={{ y: headY, opacity: headO, position: 'relative', zIndex: 1 }}>
        <Label text="En números" color={BLUE_DIM} />
      </motion.div>

      <div className="grid grid-cols-1 gap-x-8 gap-y-10 sm:gap-y-14 sm:grid-cols-3" style={{ position: 'relative', zIndex: 1 }}>
        {STATS.map(({ to, suffix, label, color }) => {
          return (
            <motion.div
              key={`${to}-${suffix}-${label}`}
              initial={{ opacity: 0, y: 32 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.35 }}
              transition={{ duration: 0.6, ease: SILK }}
            >
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
  const sectionRef = useRef<HTMLElement>(null);
  const router = useRouter();
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start end', 'end start'] });

  const headY = useTransform(scrollYProgress, [0, 0.4, 1], [40, 0, -25]);
  const headO = useTransform(scrollYProgress, [0, 0.2, 0.85, 1], [0, 1, 1, 0.3]);
  const lineH = useTransform(scrollYProgress, [0.15, 0.75], ['0%', '100%']);

  const handleStartDiagnosis = async () => {
    router.push(await resolveDiagnosisEntryRoute());
  };

  return (
    <section ref={sectionRef as React.RefObject<HTMLElement>} className="home-content-section" style={{
      background: 'transparent',
      padding: 'clamp(52px,12vw,160px) clamp(24px,8vw,120px)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Ambient cálido izquierda */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 55% 70% at 0% 50%, rgba(70,50,10,0.08) 0%, transparent 65%)',
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
          margin: '0 0 clamp(28px,7vw,80px)',
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

        {STEPS.map(({ n, title, body, dot }) => {
          return (
            <motion.div
              key={n}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.35 }}
              transition={{ duration: 0.55, ease: SILK }}
              style={{
                display: 'grid',
                gridTemplateColumns: '40px 1fr',
                gap: 'clamp(20px,3vw,44px)',
                padding: 'clamp(22px,3.5vw,40px) 0',
                position: 'relative',
                zIndex: 1,
                alignItems: 'start',
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
        onClick={() => void handleStartDiagnosis()}
        whileHover={{ opacity: 0.65 }}
        whileTap={{ scale: 0.97 }}
        style={{ marginTop: 40, background: 'none', border: 'none', cursor: 'pointer', padding: '11px 4px', fontSize: 13, fontWeight: 600, color: GOLD_DIM, display: 'inline-flex', alignItems: 'center', gap: 7, letterSpacing: '-0.01em', position: 'relative', zIndex: 1, minHeight: 44 }}
      >
        Comenzar diagnóstico <ArrowRight size={13} />
      </motion.button>
    </section>
  );
}

// ── CTA Section ────────────────────────────────────────────────────────────────
function CtaSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const router = useRouter();
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start end', 'end start'] });
  const headY = useTransform(scrollYProgress, [0, 0.5, 1], [60, 0, -40]);
  const headO = useTransform(scrollYProgress, [0, 0.2, 0.85, 1], [0, 1, 1, 0.2]);

  const handleStartDiagnosis = async () => {
    router.push(await resolveDiagnosisEntryRoute());
  };

  return (
    <section ref={sectionRef as React.RefObject<HTMLElement>} className="home-content-section" style={{
      background: 'transparent',
      padding: 'clamp(72px,16vw,220px) clamp(24px,8vw,120px)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Ambient dorado radiante */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(90,68,15,0.10) 0%, transparent 70%)',
      }} />

      <motion.div style={{ y: headY, opacity: headO, position: 'relative', zIndex: 1 }}>
        <motion.h2
          style={{
            fontSize: 'clamp(40px,10vw,120px)',
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontStyle: 'italic',
            fontWeight: 700,
            lineHeight: 0.88,
            letterSpacing: '-0.046em',
            color: 'white',
            margin: '0 0 30px',
          }}
        >
          Empieza<br />con claridad.
        </motion.h2>

        <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.35)', margin: '0 0 44px', lineHeight: 1.62, maxWidth: 360, letterSpacing: '-0.005em' }}>
          Crea tu cuenta, completa tu perfil y conversa con el agente sobre tu situación real.
        </p>

        <div className="home-cta-row">
          <motion.button
            onClick={() => void handleStartDiagnosis()}
            whileHover={{ scale: 1.02, opacity: 0.88 }}
            whileTap={{ scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'white', border: 'none', borderRadius: 999, padding: '12px 26px', fontSize: 13, fontWeight: 600, color: '#050810', cursor: 'pointer', letterSpacing: '-0.01em', minHeight: 44 }}
          >
            Comenzar diagnóstico <ArrowRight size={13} />
          </motion.button>
          <MotionLink
            href="/agent"
            whileHover={{ opacity: 0.65 }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: GOLD_DIM, padding: '11px 4px', letterSpacing: '-0.01em', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', minHeight: 44 }}
          >
            Hablar con el agente →
          </MotionLink>
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
  const [heroTiltEnabled, setHeroTiltEnabled] = useState(false);
  const [mobileShell, setMobileShell] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(MOBILE_SHELL_MEDIA).matches,
  );

  const featureSectionRef = useRef<HTMLElement>(null);
  const problemSectionRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress: canvasProgress } = useScroll({
    target: scrollRangeRef,
    offset: ['start start', 'end end'],
  });
  const { scrollYProgress: heroProgress } = useScroll({
    target: heroSectionRef,
    offset: ['start start', 'end end'],
  });
  const { scrollYProgress: featureRawP } = useScroll({
    target: featureSectionRef,
    offset: ['start end', 'end start'],
  });
  // featureDip: desktop only — on mobile it pulses the canvas mid-scroll and feels unstable.
  const featureDip = useTransform(featureRawP, [0, 0.22, 0.72, 1], [0, 1, 1, 0]);
  const canvasFeatureDip = useTransform(featureDip, (v) => (mobileShell ? 0 : v));

  const heroYRaw = useTransform(heroProgress, [0, 0.6], [0, -55]);
  const heroY = useTransform(heroYRaw, (v) => (mobileShell ? 0 : v));
  const lineOpacity = useTransform(heroProgress, [0, 0.18], [1, 0]);

  const updatePointer = useCallback((clientX: number, clientY: number) => {
    const vv = window.visualViewport;
    const w = vv?.width ?? window.innerWidth;
    const h = vv?.height ?? window.innerHeight;
    const ox = vv?.offsetLeft ?? 0;
    const oy = vv?.offsetTop ?? 0;
    const nx = clamp01((clientX - ox) / w);
    const ny = clamp01((clientY - oy) / h);
    heroMX.set(nx);
    heroMY.set(ny);
    mousePosRef.current.x = nx;
    mousePosRef.current.y = ny;
  }, [heroMX, heroMY]);

  useEffect(() => {
    const shellMq = window.matchMedia(MOBILE_SHELL_MEDIA);
    const applyShell = () => setMobileShell(shellMq.matches);
    applyShell();
    shellMq.addEventListener('change', applyShell);
    return () => shellMq.removeEventListener('change', applyShell);
  }, []);

  useEffect(() => {
    const tiltMq = window.matchMedia('(pointer: fine) and (min-width: 768px)');
    const applyTilt = () => setHeroTiltEnabled(tiltMq.matches);
    applyTilt();
    tiltMq.addEventListener('change', applyTilt);
    return () => tiltMq.removeEventListener('change', applyTilt);
  }, []);

  useEffect(() => {
    if (mobileShell) return;
    const resetPointer = () => {
      heroMX.set(0.5);
      heroMY.set(0.5);
      mousePosRef.current.x = 0.5;
      mousePosRef.current.y = 0.5;
    };
    const onTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      updatePointer(touch.clientX, touch.clientY);
    };
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', resetPointer, { passive: true });
    window.addEventListener('touchcancel', resetPointer, { passive: true });
    return () => {
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', resetPointer);
      window.removeEventListener('touchcancel', resetPointer);
    };
  }, [heroMX, heroMY, updatePointer, mobileShell]);

  const handleStartDiagnosis = async () => {
    router.push(await resolveDiagnosisEntryRoute());
  };

  return (
    <main style={{ background: 'var(--browser-chrome-color, #050810)', color: 'white', position: 'relative' }}>

      <div className="home-canvas-layer">
        <NumbersCanvas progress={canvasProgress} mouseRef={mousePosRef} featureDip={canvasFeatureDip} />
      </div>
      <div aria-hidden className="home-grain-layer" />

      {/* Chrome vignettes — sobre canvas, bajo contenido (home) */}
      <div aria-hidden className="browser-chrome-vignette-top" />
      <div aria-hidden className="browser-chrome-vignette-bottom" />

      {/* Rango de scroll para el canvas */}
      <div ref={scrollRangeRef} style={{ position: 'relative', zIndex: 2 }}>

        {/* ─── HERO ──────────────────────────────────────────────────────── */}
        <section
          ref={heroSectionRef}
          className="home-hero-full"
          style={{ position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
          onMouseMove={(e) => updatePointer(e.clientX, e.clientY)}
          onMouseLeave={() => {
            heroMX.set(0.5);
            heroMY.set(0.5);
            mousePosRef.current.x = 0.5;
            mousePosRef.current.y = 0.5;
          }}
          onTouchStart={mobileShell ? undefined : (e) => {
            const touch = e.touches[0];
            if (touch) updatePointer(touch.clientX, touch.clientY);
          }}
        >
          {/* Ambient orbs */}
          <div className="home-hero-orbs" style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none', overflow: 'hidden' }}>
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

          {/* Contenido */}
          <div style={{ position: 'relative', zIndex: 10, height: '100%' }}>
            <motion.div style={{ display: 'flex', height: '100%', flexDirection: 'column', rotateX: heroTiltEnabled ? rotX : 0, rotateY: heroTiltEnabled ? rotY : 0 }}>

              {/* Header */}
              <div className="home-page-header">
                <MotionLink
                  href="/"
                  aria-label="Financieramente"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.0, ease: SILK }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}
                >
                  <div style={{ width: 40, height: 40, borderRadius: 9, overflow: 'hidden', flexShrink: 0, boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }}>
                    <Image src="/logo-fm.svg" alt="Financieramente" width={40} height={40} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  <BrandWordmark
                    className="home-brand-wordmark"
                    financieraClassName="home-brand-financiera"
                    menteClassName="home-brand-mente"
                  />
                </MotionLink>

                <MotionLink
                  href="/agent"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.08, ease: SILK }}
                  whileHover={{ opacity: 0.72 }}
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 999, padding: '7px 18px', fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.78)', cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', minHeight: 44, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)' }}
                >
                  Entrar
                </MotionLink>
              </div>

              <div className="home-hero-spacer" />

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
                  <MotionLink
                    href="/agent"
                    whileHover={{ scale: 1.03, opacity: 0.88 }}
                    whileTap={{ scale: 0.97 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'white', border: 'none', borderRadius: 999, padding: '11px 22px', fontSize: 13, fontWeight: 600, color: '#050810', cursor: 'pointer', textDecoration: 'none', minHeight: 44 }}
                  >
                    Comenzar <ArrowRight size={13} />
                  </MotionLink>
                  <motion.button
                    onClick={() => void handleStartDiagnosis()}
                    whileHover={{ opacity: 0.65 }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'rgba(255,255,255,0.38)', padding: '11px 4px', letterSpacing: '-0.01em', display: 'inline-flex', alignItems: 'center', minHeight: 44 }}
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

        <ProblemSection sectionRef={problemSectionRef} mobileShell={mobileShell} />
        <FeaturesSection sectionRef={featureSectionRef} />
        <StatsSection />
        <StepsSection />
        <CtaSection />

      </div>

    </main>
  );
}
