'use client';

import Image from 'next/image';
import { useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { ShaderAnimation } from '@/components/ui/shader-animation';
import { motion, useScroll, useTransform, useInView, type Variants } from 'framer-motion';

// ── Easing ────────────────────────────────────────────────────────────────────
const SILK: [number, number, number, number] = [0.22, 1, 0.36, 1];   // suave, preciso
const SNAP: [number, number, number, number] = [0.4, 0, 0.2, 1];      // limpio

// ── Variantes — blur-reveal (Apple editorial) ─────────────────────────────────
const blurUp: Variants = {
  hidden: { opacity: 0, y: 28, filter: 'blur(10px)' },
  visible: {
    opacity: 1, y: 0, filter: 'blur(0px)',
    transition: { duration: 0.85, ease: SILK },
  },
};

// Para líneas de texto: cortina desde abajo
const curtain: Variants = {
  hidden: { clipPath: 'inset(0 0 100% 0)', opacity: 0 },
  visible: {
    clipPath: 'inset(0 0 0% 0)', opacity: 1,
    transition: { duration: 0.7, ease: SILK },
  },
};

// Stagger container
const sg = (s = 0.12): Variants => ({ hidden: {}, visible: { transition: { staggerChildren: s } } });

// ── Label ──────────────────────────────────────────────────────────────────────
function Label({ text, color = '#6f8fa6' }: { text: string; color?: string }) {
  return (
    <p style={{ margin: '0 0 28px', fontSize: 10, letterSpacing: '0.20em', color, textTransform: 'uppercase', fontWeight: 600 }}>
      {text}
    </p>
  );
}

// ── HR animado ────────────────────────────────────────────────────────────────
function AnimHR({ delay = 0, inView = true }) {
  return (
    <motion.div
      initial={{ scaleX: 0, opacity: 0 }}
      animate={inView ? { scaleX: 1, opacity: 1 } : {}}
      transition={{ duration: 0.9, delay, ease: SNAP }}
      style={{ height: 1, background: 'rgba(255,255,255,0.07)', transformOrigin: 'left' }}
    />
  );
}

// ── Data ──────────────────────────────────────────────────────────────────────
const FEATURES = [
  { n: '01', title: 'Diagnóstico completo', body: 'Analiza ingresos, gastos, deudas y metas. En minutos tienes una radiografía honesta de tu situación.' },
  { n: '02', title: 'Conversación natural', body: 'Pregunta como si hablaras con un asesor real. Sin formularios, sin hojas de cálculo, sin tecnicismos.' },
  { n: '03', title: 'Plan de acción', body: 'Recibes recomendaciones concretas y un informe descargable adaptado a tu perfil y objetivos.' },
];

const STEPS = [
  { n: '01', title: 'Cuéntanos tu situación', body: 'Respondes un cuestionario breve sobre ingresos, deudas, gastos y metas. 10 minutos.' },
  { n: '02', title: 'La IA analiza todo', body: 'El agente genera un diagnóstico detallado con tensiones, oportunidades y prioridades.' },
  { n: '03', title: 'Recibes claridad', body: 'Conversas con el agente, simulas escenarios y descargas tu plan de acción en PDF.' },
];

const CHAT = [
  { from: 'user' as const, text: '¿Cuánto debería ahorrar al mes?' },
  { from: 'ai' as const,   text: 'Con base en tu perfil: ingreso $1.2M, gastos fijos $820K. Ajustando cuotas, puedes ahorrar un 18% mensual sin sacrificar calidad de vida.' },
  { from: 'user' as const, text: '¿Cómo mejoro mi score crediticio?' },
  { from: 'ai' as const,   text: 'Tu deuda más urgente es la tarjeta a 36 meses. Priorizarla reduce tu carga financiera en 23% y mejora tu perfil crediticio.' },
];

// ── Sections ──────────────────────────────────────────────────────────────────

function ProblemSection() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  const lines = [
    'Las personas no entienden sus propias finanzas.',
    'Los asesores son caros o inaccesibles.',
    'Los chatbots genéricos no conocen el contexto.',
  ];

  return (
    <section ref={ref} style={{ background: '#050810', padding: 'clamp(100px,14vw,180px) clamp(24px,8vw,120px)' }}>
      <motion.div initial="hidden" animate={inView ? 'visible' : 'hidden'} variants={sg(0.22)}>
        <motion.div variants={blurUp}><Label text="El problema" /></motion.div>

        {lines.map((line, i) => (
          <div key={i}>
            <motion.div
              variants={curtain}
              style={{ overflow: 'hidden', padding: 'clamp(22px,3vw,38px) 0' }}
            >
              <p style={{
                fontSize: 'clamp(21px,3.4vw,46px)',
                fontFamily: 'Georgia, "Times New Roman", serif',
                fontWeight: 700,
                lineHeight: 1.13,
                letterSpacing: '-0.025em',
                color: i === 0 ? 'rgba(255,255,255,0.90)' : 'rgba(255,255,255,0.38)',
                margin: 0,
                transition: 'color 0.4s',
              }}>
                {line}
              </p>
            </motion.div>
            {i < lines.length - 1 && <AnimHR delay={0.25 + i * 0.12} inView={inView} />}
          </div>
        ))}
      </motion.div>
    </section>
  );
}

function FeaturesSection() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section ref={ref} style={{ background: '#050810', padding: 'clamp(80px,12vw,160px) clamp(24px,8vw,120px)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <motion.div initial="hidden" animate={inView ? 'visible' : 'hidden'} variants={sg(0.14)}>
        <motion.div variants={blurUp}>
          <Label text="Para ti" />
          <h2 style={{ fontSize: 'clamp(30px,5vw,64px)', fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 700, lineHeight: 1.05, letterSpacing: '-0.032em', color: 'white', margin: '0 0 clamp(48px,7vw,80px)', maxWidth: 560 }}>
            Lo que el agente<br />hace por ti.
          </h2>
        </motion.div>

        {FEATURES.map(({ n, title, body }, i) => (
          <div key={n}>
            <AnimHR delay={0.08 + i * 0.1} inView={inView} />
            <motion.div
              variants={blurUp}
              style={{ display: 'grid', gridTemplateColumns: '44px 1fr 2fr', gap: 'clamp(12px,3vw,48px)', padding: 'clamp(22px,3.5vw,40px) 0', alignItems: 'start' }}
            >
              <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.18)', letterSpacing: '0.08em', paddingTop: 4 }}>{n}</span>
              <h3 style={{ fontSize: 'clamp(14px,1.8vw,19px)', fontWeight: 600, color: 'rgba(255,255,255,0.88)', margin: 0, lineHeight: 1.28, letterSpacing: '-0.015em' }}>{title}</h3>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.36)', lineHeight: 1.68, margin: 0 }}>{body}</p>
            </motion.div>
          </div>
        ))}
        <AnimHR delay={0.45} inView={inView} />
      </motion.div>
    </section>
  );
}

function StepsSection() {
  const router = useRouter();
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section ref={ref} style={{ background: '#050810', padding: 'clamp(80px,12vw,160px) clamp(24px,8vw,120px)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <motion.div initial="hidden" animate={inView ? 'visible' : 'hidden'} variants={sg(0.14)}>
        <motion.div variants={blurUp}>
          <Label text="Proceso" color="#a48f4f" />
          <h2 style={{ fontSize: 'clamp(30px,5vw,64px)', fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 700, lineHeight: 1.05, letterSpacing: '-0.032em', color: 'white', margin: '0 0 clamp(48px,7vw,80px)', maxWidth: 460 }}>
            Tres pasos<br />hacia la claridad.
          </h2>
        </motion.div>

        {STEPS.map(({ n, title, body }, i) => (
          <div key={n}>
            <AnimHR delay={0.08 + i * 0.1} inView={inView} />
            <motion.div
              variants={blurUp}
              style={{ display: 'grid', gridTemplateColumns: '44px 1fr 2fr', gap: 'clamp(12px,3vw,48px)', padding: 'clamp(22px,3.5vw,40px) 0', alignItems: 'start' }}
            >
              <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(164,143,79,0.45)', letterSpacing: '0.08em', paddingTop: 4 }}>{n}</span>
              <h3 style={{ fontSize: 'clamp(14px,1.8vw,19px)', fontWeight: 600, color: 'rgba(255,255,255,0.88)', margin: 0, lineHeight: 1.28, letterSpacing: '-0.015em' }}>{title}</h3>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.36)', lineHeight: 1.68, margin: 0 }}>{body}</p>
            </motion.div>
          </div>
        ))}
        <AnimHR delay={0.45} inView={inView} />

        <motion.button
          variants={blurUp}
          onClick={() => router.push('/intake')}
          whileHover={{ opacity: 0.65 }}
          whileTap={{ scale: 0.97 }}
          style={{ marginTop: 40, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 13, fontWeight: 600, color: 'rgba(164,143,79,0.80)', display: 'inline-flex', alignItems: 'center', gap: 7, letterSpacing: '-0.01em' }}
        >
          Comenzar diagnóstico <ArrowRight size={13} />
        </motion.button>
      </motion.div>
    </section>
  );
}

function PreviewSection() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section ref={ref} style={{ background: '#050810', padding: 'clamp(80px,12vw,160px) clamp(24px,8vw,120px)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <motion.div initial="hidden" animate={inView ? 'visible' : 'hidden'} variants={sg(0.12)}>
        <motion.div variants={blurUp}>
          <Label text="En acción" />
          <h2 style={{ fontSize: 'clamp(30px,5vw,64px)', fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 700, lineHeight: 1.05, letterSpacing: '-0.032em', color: 'white', margin: '0 0 clamp(48px,7vw,80px)', maxWidth: 520 }}>
            Una conversación que<br />cambia cómo ves tu dinero.
          </h2>
        </motion.div>

        <motion.div variants={blurUp} style={{ maxWidth: 460, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {CHAT.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10, filter: 'blur(6px)' }}
              animate={inView ? { opacity: 1, y: 0, filter: 'blur(0px)' } : {}}
              transition={{ duration: 0.55, delay: 0.55 + i * 0.55, ease: SILK }}
              style={{ display: 'flex', justifyContent: msg.from === 'user' ? 'flex-end' : 'flex-start' }}
            >
              <div style={{
                maxWidth: '80%',
                padding: '10px 14px',
                borderRadius: msg.from === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                background: msg.from === 'user' ? '#6f8fa6' : '#11151c',
                border: msg.from === 'ai' ? '1px solid rgba(255,255,255,0.06)' : 'none',
                fontSize: 13.5,
                lineHeight: 1.55,
                color: msg.from === 'user' ? '#fff' : 'rgba(255,255,255,0.68)',
                letterSpacing: '-0.01em',
              }}>
                {msg.text}
              </div>
            </motion.div>
          ))}
        </motion.div>
      </motion.div>
    </section>
  );
}

function CtaSection() {
  const router = useRouter();
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section ref={ref} style={{ background: '#050810', padding: 'clamp(120px,16vw,220px) clamp(24px,8vw,120px)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <motion.div initial="hidden" animate={inView ? 'visible' : 'hidden'} variants={sg(0.16)}>
        <motion.h2
          variants={blurUp}
          style={{ fontSize: 'clamp(52px,9vw,120px)', fontFamily: 'Georgia, "Times New Roman", serif', fontStyle: 'italic', fontWeight: 700, lineHeight: 0.90, letterSpacing: '-0.045em', color: 'white', margin: '0 0 30px' }}
        >
          Prueba<br />el agente.
        </motion.h2>

        <motion.p variants={blurUp} style={{ fontSize: 15, color: 'rgba(255,255,255,0.36)', margin: '0 0 44px', lineHeight: 1.62, maxWidth: 360, letterSpacing: '-0.005em' }}>
          Un prototipo de tesis real, disponible para explorar libremente.
        </motion.p>

        <motion.div variants={blurUp} style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
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
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'rgba(255,255,255,0.34)', padding: 0, letterSpacing: '-0.01em' }}
          >
            Hablar con el agente →
          </motion.button>
        </motion.div>

        <motion.p variants={blurUp} style={{ marginTop: 56, fontSize: 10, letterSpacing: '0.16em', color: 'rgba(255,255,255,0.13)', textTransform: 'uppercase' }}>
          Proyecto de tesis — Ingeniería / Economía
        </motion.p>
      </motion.div>
    </section>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const router = useRouter();
  const { scrollY } = useScroll();

  // Parallax imagen: se mueve más lento → sensación de recorrido a través de ella
  const imgY = useTransform(scrollY, [0, 900], [0, 160]);
  const heroY = useTransform(scrollY, [0, 600], [0, -70]);
  const heroOpacity = useTransform(scrollY, [0, 380], [1, 0]);
  const shaderOpacity = useTransform(scrollY, [0, 300], [0.28, 0]);
  const lineOpacity = useTransform(scrollY, [0, 80], [1, 0]);

  return (
    <main style={{ background: '#050810', color: 'white' }}>

      {/* ─── HERO ────────────────────────────────────────────────────────── */}
      <section style={{ position: 'relative', height: '100dvh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

        {/* ── Imagen con parallax y look editorial mate ── */}
        <motion.div
          style={{
            position: 'absolute',
            inset: '-22%',
            y: imgY,
            backgroundImage: "url('/fondo4.jpg')",
            backgroundSize: 'cover',
            backgroundPosition: 'center 18%',
            // Look editorial mate: desaturado, contraste bajo (levanta los negros → efecto mate),
            // sepia suave para tono de película
            filter: 'saturate(0.18) contrast(0.68) brightness(0.58) sepia(0.22)',
            zIndex: 0,
          }}
        />

        {/* Grano de película — textura de puntos muy finos */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none',
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.022) 1px, transparent 1px)',
          backgroundSize: '3px 3px',
          mixBlendMode: 'overlay',
        }} />

        {/* Viñeta editorial */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none',
          background: 'radial-gradient(ellipse at 50% 40%, transparent 25%, rgba(0,0,0,0.65) 100%)',
        }} />

        {/* Tono cálido de película */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none',
          background: 'rgba(210,195,170,0.04)',
        }} />

        {/* Shader overlay sutil */}
        <motion.div style={{ position: 'absolute', inset: 0, zIndex: 2, opacity: shaderOpacity, mixBlendMode: 'screen', pointerEvents: 'none' }}>
          <ShaderAnimation />
        </motion.div>

        {/* Gradiente de profundidad: texto abajo visible */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none',
          background: 'linear-gradient(to bottom, rgba(5,8,16,0.18) 0%, transparent 30%, rgba(5,8,16,0.50) 68%, rgba(5,8,16,0.92) 100%)',
        }} />

        {/* Contenido */}
        <div style={{ position: 'relative', zIndex: 10, display: 'flex', height: '100%', flexDirection: 'column' }}>

          {/* Header */}
          <div className="home-page-header" style={{ paddingTop: 'clamp(56px,9vh,88px)' }}>
            <motion.button
              onClick={() => router.push('/')}
              aria-label="Financieramente"
              initial={{ opacity: 0, filter: 'blur(8px)' }}
              animate={{ opacity: 1, filter: 'blur(0px)' }}
              transition={{ duration: 0.8, delay: 0.05, ease: SILK }}
              style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              <div style={{ width: 40, height: 40, borderRadius: 9, overflow: 'hidden', flexShrink: 0, boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }}>
                <Image src="/logo-financieramente.jpg" alt="Financieramente" width={40} height={40} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
              <span style={{ fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.78)', letterSpacing: '0.005em' }}>
                Financieramente
              </span>
            </motion.button>

            <motion.button
              onClick={() => router.push('/agent')}
              initial={{ opacity: 0, filter: 'blur(8px)' }}
              animate={{ opacity: 1, filter: 'blur(0px)' }}
              transition={{ duration: 0.8, delay: 0.12, ease: SILK }}
              whileHover={{ opacity: 0.72 }}
              style={{ background: 'none', border: '1px solid rgba(255,255,255,0.22)', borderRadius: 999, padding: '7px 16px', fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.70)', cursor: 'pointer' }}
            >
              Entrar
            </motion.button>
          </div>

          <div style={{ flex: 1 }} />

          {/* Hero copy */}
          <motion.div className="home-page-hero" style={{ y: heroY, opacity: heroOpacity }}>

            <motion.h1
              initial={{ opacity: 0, y: 30, filter: 'blur(14px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{ duration: 1.0, delay: 0.20, ease: SILK }}
              style={{ fontSize: 'clamp(52px,8vw,104px)', fontWeight: 700, lineHeight: 0.88, letterSpacing: '-0.046em', color: 'white', margin: '0 0 24px' }}
            >
              Tu dinero,
              <br />
              <motion.em
                initial={{ opacity: 0, y: 20, filter: 'blur(10px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                transition={{ duration: 0.9, delay: 0.42, ease: SILK }}
                style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 400, fontStyle: 'italic', color: 'rgba(255,255,255,0.60)' }}
              >
                más claro.
              </motion.em>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, filter: 'blur(8px)' }}
              animate={{ opacity: 1, filter: 'blur(0px)' }}
              transition={{ duration: 0.8, delay: 0.60, ease: SILK }}
              style={{ fontSize: 15, color: 'rgba(255,255,255,0.42)', lineHeight: 1.58, maxWidth: 320, margin: '0 0 36px', letterSpacing: '-0.01em' }}
            >
              Una conversación honesta sobre tus finanzas.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, filter: 'blur(6px)' }}
              animate={{ opacity: 1, filter: 'blur(0px)' }}
              transition={{ duration: 0.7, delay: 0.76, ease: SILK }}
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
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'rgba(255,255,255,0.40)', padding: 0, letterSpacing: '-0.01em' }}
              >
                Ver diagnóstico →
              </motion.button>
            </motion.div>
          </motion.div>

          {/* Scroll cue — línea vertical pulsante */}
          <motion.div
            style={{ opacity: lineOpacity, padding: '0 clamp(24px,8vw,120px) 30px' }}
          >
            <motion.div
              initial={{ scaleY: 0, opacity: 0 }}
              animate={{ scaleY: 1, opacity: 1 }}
              transition={{ duration: 0.6, delay: 1.1, ease: SILK }}
              style={{ transformOrigin: 'top', width: 1, height: 32, background: 'rgba(255,255,255,0.28)', borderRadius: 1 }}
            />
          </motion.div>

          <div className="home-page-caption">
            <span>Proyecto de tesis.</span>
            <span>Financieramente</span>
          </div>
        </div>
      </section>

      {/* ─── SECTIONS ────────────────────────────────────────────────────── */}
      <ProblemSection />
      <FeaturesSection />
      <StepsSection />
      <PreviewSection />
      <CtaSection />

    </main>
  );
}
