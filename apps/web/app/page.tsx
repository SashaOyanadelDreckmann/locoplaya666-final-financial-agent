'use client';

import Image from 'next/image';
import { useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { ShaderAnimation } from '@/components/ui/shader-animation';
import { motion, useScroll, useTransform, useInView, type Variants } from 'framer-motion';

// ── Easing ────────────────────────────────────────────────────────────────────
const E: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

// ── Shared variants ───────────────────────────────────────────────────────────
const up: Variants = {
  hidden: { opacity: 0, y: 32 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: E } },
};
const stagger = (s = 0.12): Variants => ({
  hidden: {},
  visible: { transition: { staggerChildren: s } },
});

// ── Sección label ─────────────────────────────────────────────────────────────
function Label({ children, color = '#6f8fa6' }: { children: string; color?: string }) {
  return (
    <p style={{ fontSize: 11, letterSpacing: '0.18em', color, textTransform: 'uppercase', fontWeight: 600, margin: '0 0 28px' }}>
      {children}
    </p>
  );
}

// ── Divider ───────────────────────────────────────────────────────────────────
function HR({ delay = 0, inView = true }) {
  return (
    <motion.div
      initial={{ scaleX: 0 }}
      animate={inView ? { scaleX: 1 } : {}}
      transition={{ duration: 0.8, delay, ease: [0.4, 0, 0.2, 1] }}
      style={{ height: 1, background: 'rgba(255,255,255,0.07)', transformOrigin: 'left', margin: '0' }}
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
  { from: 'ai' as const, text: 'Con base en tu perfil: ingreso $1.2M, gastos fijos $820K. Ajustando cuotas, puedes ahorrar un 18% mensual sin sacrificar calidad de vida.' },
  { from: 'user' as const, text: '¿Cómo mejoro mi score crediticio?' },
  { from: 'ai' as const, text: 'Tu deuda más urgente es la tarjeta a 36 meses. Priorizarla reduce tu carga financiera en 23% y mejora tu perfil crediticio.' },
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
    <section ref={ref} style={{ background: '#050810', padding: 'clamp(100px, 14vw, 180px) clamp(24px, 8vw, 120px)' }}>
      <motion.div initial="hidden" animate={inView ? 'visible' : 'hidden'} variants={stagger(0.18)}>
        <motion.div variants={up}><Label>El problema</Label></motion.div>
        {lines.map((line, i) => (
          <div key={i}>
            <motion.p
              variants={up}
              style={{ fontSize: 'clamp(22px, 3.6vw, 48px)', fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 700, lineHeight: 1.15, letterSpacing: '-0.025em', color: i === 0 ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.45)', margin: '0', padding: 'clamp(24px,3vw,40px) 0' }}
            >
              {line}
            </motion.p>
            {i < lines.length - 1 && <HR delay={0.3 + i * 0.15} inView={inView} />}
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
    <section ref={ref} style={{ background: '#050810', padding: 'clamp(80px, 12vw, 160px) clamp(24px, 8vw, 120px)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <motion.div initial="hidden" animate={inView ? 'visible' : 'hidden'} variants={stagger(0.15)}>
        <motion.div variants={up}>
          <Label>Para ti</Label>
          <h2 style={{ fontSize: 'clamp(32px, 5vw, 64px)', fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 700, lineHeight: 1.05, letterSpacing: '-0.03em', color: 'white', margin: '0 0 clamp(48px,7vw,80px)', maxWidth: 600 }}>
            Lo que el agente<br />hace por ti.
          </h2>
        </motion.div>

        {FEATURES.map(({ n, title, body }, i) => (
          <div key={n}>
            <HR delay={0.1 + i * 0.1} inView={inView} />
            <motion.div
              variants={up}
              style={{ display: 'grid', gridTemplateColumns: '40px 1fr 2fr', gap: 'clamp(16px, 3vw, 48px)', padding: 'clamp(24px, 3.5vw, 40px) 0', alignItems: 'start' }}
            >
              <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.22)', letterSpacing: '0.06em', paddingTop: 4 }}>{n}</span>
              <h3 style={{ fontSize: 'clamp(15px, 2vw, 20px)', fontWeight: 600, color: 'rgba(255,255,255,0.88)', margin: 0, lineHeight: 1.25, letterSpacing: '-0.01em' }}>{title}</h3>
              <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.40)', lineHeight: 1.65, margin: 0 }}>{body}</p>
            </motion.div>
          </div>
        ))}
        <HR delay={0.5} inView={inView} />
      </motion.div>
    </section>
  );
}

function StepsSection() {
  const router = useRouter();
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  return (
    <section ref={ref} style={{ background: '#050810', padding: 'clamp(80px, 12vw, 160px) clamp(24px, 8vw, 120px)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <motion.div initial="hidden" animate={inView ? 'visible' : 'hidden'} variants={stagger(0.15)}>
        <motion.div variants={up}>
          <Label color="#a48f4f">Proceso</Label>
          <h2 style={{ fontSize: 'clamp(32px, 5vw, 64px)', fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 700, lineHeight: 1.05, letterSpacing: '-0.03em', color: 'white', margin: '0 0 clamp(48px,7vw,80px)', maxWidth: 480 }}>
            Tres pasos<br />hacia la claridad.
          </h2>
        </motion.div>

        {STEPS.map(({ n, title, body }, i) => (
          <div key={n}>
            <HR delay={0.1 + i * 0.1} inView={inView} />
            <motion.div
              variants={up}
              style={{ display: 'grid', gridTemplateColumns: '40px 1fr 2fr', gap: 'clamp(16px, 3vw, 48px)', padding: 'clamp(24px, 3.5vw, 40px) 0', alignItems: 'start' }}
            >
              <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(164,143,79,0.50)', letterSpacing: '0.06em', paddingTop: 4 }}>{n}</span>
              <h3 style={{ fontSize: 'clamp(15px, 2vw, 20px)', fontWeight: 600, color: 'rgba(255,255,255,0.88)', margin: 0, lineHeight: 1.25, letterSpacing: '-0.01em' }}>{title}</h3>
              <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.40)', lineHeight: 1.65, margin: 0 }}>{body}</p>
            </motion.div>
          </div>
        ))}
        <HR delay={0.5} inView={inView} />

        <motion.button
          variants={up}
          onClick={() => router.push('/intake')}
          whileHover={{ opacity: 0.7 }}
          whileTap={{ scale: 0.98 }}
          style={{ marginTop: 40, display: 'inline-flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 14, fontWeight: 600, color: 'rgba(164,143,79,0.85)', letterSpacing: '-0.01em' }}
        >
          Comenzar diagnóstico <ArrowRight size={14} />
        </motion.button>
      </motion.div>
    </section>
  );
}

function PreviewSection() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  return (
    <section ref={ref} style={{ background: '#050810', padding: 'clamp(80px, 12vw, 160px) clamp(24px, 8vw, 120px)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <motion.div initial="hidden" animate={inView ? 'visible' : 'hidden'} variants={stagger(0.12)}>
        <motion.div variants={up}>
          <Label>En acción</Label>
          <h2 style={{ fontSize: 'clamp(32px, 5vw, 64px)', fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 700, lineHeight: 1.05, letterSpacing: '-0.03em', color: 'white', margin: '0 0 clamp(48px,7vw,80px)', maxWidth: 520 }}>
            Una conversación que<br />cambia cómo ves tu dinero.
          </h2>
        </motion.div>

        {/* Chat — minimal, sin container pesado */}
        <motion.div
          variants={up}
          style={{ maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 8 }}
        >
          {CHAT.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 6 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.4, delay: 0.5 + i * 0.55, ease: E }}
              style={{ display: 'flex', justifyContent: msg.from === 'user' ? 'flex-end' : 'flex-start' }}
            >
              <div style={{
                maxWidth: '80%',
                padding: '10px 14px',
                borderRadius: msg.from === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                background: msg.from === 'user' ? '#6f8fa6' : '#11151c',
                border: msg.from === 'ai' ? '1px solid rgba(255,255,255,0.06)' : 'none',
                fontSize: 14,
                lineHeight: 1.55,
                color: msg.from === 'user' ? '#fff' : 'rgba(255,255,255,0.72)',
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
    <section ref={ref} style={{ background: '#050810', padding: 'clamp(120px, 16vw, 220px) clamp(24px, 8vw, 120px)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <motion.div initial="hidden" animate={inView ? 'visible' : 'hidden'} variants={stagger(0.15)}>
        <motion.h2
          variants={up}
          style={{ fontSize: 'clamp(52px, 8vw, 110px)', fontFamily: 'Georgia, "Times New Roman", serif', fontStyle: 'italic', fontWeight: 700, lineHeight: 0.92, letterSpacing: '-0.04em', color: 'white', margin: '0 0 28px' }}
        >
          Prueba<br />el agente.
        </motion.h2>
        <motion.p variants={up} style={{ fontSize: 15, color: 'rgba(255,255,255,0.38)', margin: '0 0 40px', lineHeight: 1.6, maxWidth: 380 }}>
          Un prototipo de tesis real, disponible para explorar libremente.
        </motion.p>
        <motion.div variants={up} style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          <motion.button
            onClick={() => router.push('/intake')}
            whileHover={{ opacity: 0.75 }}
            whileTap={{ scale: 0.97 }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, borderRadius: 999, background: 'white', border: 'none', padding: '12px 26px', fontSize: 14, fontWeight: 600, color: '#050810', cursor: 'pointer', letterSpacing: '-0.01em' }}
          >
            Comenzar diagnóstico <ArrowRight size={14} />
          </motion.button>
          <motion.button
            onClick={() => router.push('/agent')}
            whileHover={{ opacity: 0.7 }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'rgba(255,255,255,0.38)', padding: 0, letterSpacing: '-0.01em' }}
          >
            Hablar con el agente →
          </motion.button>
        </motion.div>
        <motion.p variants={up} style={{ marginTop: 52, fontSize: 11, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.14)', textTransform: 'uppercase' }}>
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

  // Parallax: imagen se mueve más lento que el scroll → sensación de "recorrido"
  const imgY = useTransform(scrollY, [0, 800], [0, 140]);
  // Hero content sale hacia arriba al salir de viewport
  const heroY = useTransform(scrollY, [0, 600], [0, -80]);
  const heroOpacity = useTransform(scrollY, [0, 400], [1, 0]);
  // Shader y overlay se desvanecen con el scroll
  const shaderOpacity = useTransform(scrollY, [0, 350], [0.35, 0]);
  const arrowOpacity = useTransform(scrollY, [0, 100], [1, 0]);

  return (
    <main style={{ background: '#050810', color: 'white' }}>

      {/* ─── HERO ────────────────────────────────────────────────────────── */}
      <section style={{ position: 'relative', height: '100dvh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

        {/* Imagen con parallax — siempre en excelente definición */}
        <motion.div
          style={{
            position: 'absolute',
            inset: '-20%',
            y: imgY,
            backgroundImage: "url('/fondo4.jpg')",
            backgroundSize: 'cover',
            backgroundPosition: 'center 20%',
            filter: 'saturate(0.80) brightness(0.52)',
            zIndex: 0,
          }}
        />

        {/* Shader overlay */}
        <motion.div style={{ position: 'absolute', inset: 0, zIndex: 1, opacity: shaderOpacity, mixBlendMode: 'screen', pointerEvents: 'none' }}>
          <ShaderAnimation />
        </motion.div>

        {/* Gradiente inferior para legibilidad del texto */}
        <div style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none', background: 'linear-gradient(to bottom, rgba(5,8,16,0.20) 0%, transparent 35%, rgba(5,8,16,0.55) 70%, rgba(5,8,16,0.90) 100%)' }} />

        {/* Contenido */}
        <div style={{ position: 'relative', zIndex: 10, display: 'flex', height: '100%', flexDirection: 'column' }}>

          {/* Header */}
          <div className="home-page-header" style={{ paddingTop: 'clamp(56px, 9vh, 88px)' }}>
            <button
              onClick={() => router.push('/')}
              aria-label="Financieramente"
              style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              <div style={{ width: 40, height: 40, borderRadius: 9, overflow: 'hidden', flexShrink: 0, boxShadow: '0 4px 16px rgba(0,0,0,0.35)' }}>
                <Image src="/logo-financieramente.jpg" alt="Financieramente" width={40} height={40} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
              <span style={{ fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.80)', letterSpacing: '0.005em' }}>
                Financieramente
              </span>
            </button>

            <button
              onClick={() => router.push('/agent')}
              style={{ background: 'none', border: '1px solid rgba(255,255,255,0.22)', borderRadius: 999, padding: '7px 16px', fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.72)', cursor: 'pointer' }}
            >
              Entrar
            </button>
          </div>

          <div style={{ flex: 1 }} />

          {/* Hero copy */}
          <motion.div className="home-page-hero" style={{ y: heroY, opacity: heroOpacity }}>
            <motion.h1
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.15, ease: E }}
              style={{ fontSize: 'clamp(52px, 8vw, 100px)', fontWeight: 700, lineHeight: 0.88, letterSpacing: '-0.045em', color: 'white', margin: '0 0 22px' }}
            >
              Tu dinero,
              <br />
              <em style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 400, fontStyle: 'italic', color: 'rgba(255,255,255,0.65)' }}>
                más claro.
              </em>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.35, ease: E }}
              style={{ fontSize: 16, color: 'rgba(255,255,255,0.46)', lineHeight: 1.55, maxWidth: 340, margin: '0 0 36px', letterSpacing: '-0.01em' }}
            >
              Una conversación honesta sobre tus finanzas.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.52, ease: E }}
              style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}
            >
              <motion.button
                onClick={() => router.push('/agent')}
                whileHover={{ opacity: 0.80 }}
                whileTap={{ scale: 0.97 }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'white', border: 'none', borderRadius: 999, padding: '11px 22px', fontSize: 13, fontWeight: 600, color: '#050810', cursor: 'pointer' }}
              >
                Comenzar <ArrowRight size={13} />
              </motion.button>
              <motion.button
                onClick={() => router.push('/intake')}
                whileHover={{ opacity: 0.7 }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'rgba(255,255,255,0.46)', padding: 0, letterSpacing: '-0.01em' }}
              >
                Ver diagnóstico →
              </motion.button>
            </motion.div>
          </motion.div>

          {/* Scroll cue — minimalista */}
          <motion.div style={{ opacity: arrowOpacity, padding: '0 clamp(24px,8vw,120px) 28px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <motion.div
              animate={{ y: [0, 5, 0] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
              style={{ width: 1, height: 36, background: 'rgba(255,255,255,0.22)', borderRadius: 1 }}
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
