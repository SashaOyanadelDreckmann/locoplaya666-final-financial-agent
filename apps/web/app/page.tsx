'use client';

import Image from 'next/image';
import { useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight, ChevronDown,
  BarChart2, MessageCircle, FileText,
  Bot, Shield, Globe,
} from 'lucide-react';
import { ShaderAnimation } from '@/components/ui/shader-animation';
import { motion, useScroll, useTransform, useInView, type Variants } from 'framer-motion';

// ── Shared animation variants ────────────────────────────────────────────────

const EASE: [number, number, number, number] = [0.34, 1.56, 0.64, 1];
const EASE_CLEAN: [number, number, number, number] = [0.4, 0, 0.2, 1];

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
};

const fadeLeft: Variants = {
  hidden: { opacity: 0, x: -40 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.7, ease: EASE } },
};

const staggerFast: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.15 } },
};

const staggerSlow: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.28 } },
};

// ── Blurred background (fondo4.jpg con heavy blur) ───────────────────────────

function BlurredBg() {
  return (
    <>
      <div
        style={{
          position: 'absolute',
          inset: -40,
          backgroundImage: "url('/fondo4.jpg')",
          backgroundSize: 'cover',
          backgroundPosition: 'center top',
          filter: 'blur(56px) saturate(0.5) brightness(0.18)',
          zIndex: 0,
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(5,8,16,0.62)',
          zIndex: 0,
          pointerEvents: 'none',
        }}
      />
    </>
  );
}

// ── Static content ────────────────────────────────────────────────────────────

const PAIN_POINTS = [
  {
    text: 'Las personas no entienden sus propias finanzas.',
    sub: 'La educación financiera sigue siendo una deuda pendiente.',
  },
  {
    text: 'Los asesores son caros o inaccesibles.',
    sub: 'El asesoramiento personalizado no escala para todos.',
  },
  {
    text: 'Los chatbots genéricos no conocen el contexto.',
    sub: 'UF, AFP, CMF — el idioma local importa.',
  },
];

const FEATURES = [
  {
    num: '01',
    Icon: BarChart2,
    title: 'Diagnóstico financiero completo',
    desc: 'Analiza ingresos, gastos, deudas y metas. En minutos tienes una radiografía honesta de tu situación.',
    color: '#6f8fa6',
  },
  {
    num: '02',
    Icon: MessageCircle,
    title: 'Conversación natural con IA',
    desc: 'Pregunta como si hablaras con un asesor real. Sin formularios, sin hojas de cálculo, sin tecnicismos.',
    color: '#8a9f78',
  },
  {
    num: '03',
    Icon: FileText,
    title: 'Plan de acción personalizado',
    desc: 'Recibes recomendaciones concretas y un informe descargable adaptado a tu perfil y objetivos.',
    color: '#a48f4f',
  },
];

const STEPS = [
  {
    num: '01',
    title: 'Cuéntanos tu situación',
    desc: 'Respondes un cuestionario breve sobre ingresos, deudas, gastos y metas. 10 minutos, sin hojas de cálculo.',
    dot: '#6f8fa6',
    ring: 'rgba(111,143,166,0.3)',
  },
  {
    num: '02',
    title: 'La IA analiza todo',
    desc: 'El agente procesa tu perfil financiero completo y genera un diagnóstico detallado con tensiones y oportunidades.',
    dot: '#8a9f78',
    ring: 'rgba(138,159,120,0.3)',
  },
  {
    num: '03',
    title: 'Recibes claridad',
    desc: 'Conversas con el agente, simulas escenarios y descargas tu plan de acción en PDF.',
    dot: '#a48f4f',
    ring: 'rgba(164,143,79,0.3)',
  },
];

const CHAT_MESSAGES = [
  { from: 'user' as const, text: '¿Cuánto debería ahorrar al mes?' },
  {
    from: 'ai' as const,
    text: 'Con base en tu perfil: ingreso $1.2M, gastos fijos $820K. Ajustando cuotas, puedes ahorrar un 18% mensual sin sacrificar calidad de vida.',
  },
  { from: 'user' as const, text: '¿Cómo mejoro mi score crediticio?' },
  {
    from: 'ai' as const,
    text: 'Tu deuda más urgente es la tarjeta a 36 meses. Priorizarla reduce tu carga financiera en 23% y mejora tu perfil crediticio.',
  },
];

const TRUST = [
  { Icon: Shield, label: 'Datos privados', sub: 'Tu información nunca se comparte ni vende.' },
  { Icon: Globe, label: 'Contexto chileno', sub: 'Diseñado para la realidad local: UF, APV, CMF.' },
  { Icon: Bot, label: 'Agente IA real', sub: 'No es un FAQ. Razona sobre tu situación específica.' },
];

// ── Sub-sections ──────────────────────────────────────────────────────────────

function ProblemSection() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section
      ref={ref}
      style={{ position: 'relative', overflow: 'hidden', padding: 'clamp(80px, 10vw, 140px) clamp(24px, 6vw, 80px)' }}
    >
      <BlurredBg />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <motion.p
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ duration: 0.5 }}
          style={{ fontSize: 11, letterSpacing: '0.18em', color: '#6f8fa6', textTransform: 'uppercase', marginBottom: 52, fontWeight: 600 }}
        >
          El problema
        </motion.p>
        <motion.div
          variants={staggerSlow}
          initial="hidden"
          animate={inView ? 'visible' : 'hidden'}
          style={{ display: 'flex', flexDirection: 'column', gap: 52 }}
        >
          {PAIN_POINTS.map(({ text, sub }) => (
            <motion.div key={text} variants={fadeLeft}>
              <p style={{ fontSize: 'clamp(26px, 4.5vw, 54px)', fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.025em', color: 'rgba(255,255,255,0.90)', margin: '0 0 10px', maxWidth: 720 }}>
                {text}
              </p>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.32)', lineHeight: 1.5 }}>{sub}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section
      ref={ref}
      style={{ background: '#060810', padding: 'clamp(80px, 10vw, 140px) clamp(24px, 6vw, 80px)', position: 'relative', overflow: 'hidden' }}
    >
      <div style={{ position: 'absolute', top: '30%', left: '50%', transform: 'translateX(-50%)', width: '60vw', height: '60vw', maxWidth: 700, maxHeight: 700, borderRadius: '50%', background: 'radial-gradient(circle, rgba(111,143,166,0.05) 0%, transparent 70%)', pointerEvents: 'none' }} />

      <motion.p
        initial={{ opacity: 0 }}
        animate={inView ? { opacity: 1 } : {}}
        transition={{ duration: 0.5 }}
        style={{ fontSize: 11, letterSpacing: '0.18em', color: '#6f8fa6', textTransform: 'uppercase', marginBottom: 14, fontWeight: 600 }}
      >
        Capacidades
      </motion.p>
      <motion.h2
        initial={{ opacity: 0, y: 20 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6, delay: 0.1, ease: EASE }}
        style={{ fontSize: 'clamp(26px, 4vw, 48px)', fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.02em', color: 'white', margin: '0 0 60px', maxWidth: 540 }}
      >
        Lo que el agente hace por ti.
      </motion.h2>

      <motion.div
        variants={staggerFast}
        initial="hidden"
        animate={inView ? 'visible' : 'hidden'}
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}
      >
        {FEATURES.map(({ num, Icon, title, desc, color }) => {
          const rgb = color === '#6f8fa6' ? '111,143,166' : color === '#8a9f78' ? '138,159,120' : '164,143,79';
          return (
            <motion.div
              key={num}
              variants={fadeUp}
              whileHover={{ y: -8, scale: 1.02 }}
              transition={{ type: 'spring', stiffness: 280, damping: 22 }}
              style={{ position: 'relative', background: 'rgba(18,24,34,0.55)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 22, padding: '28px 28px 34px', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', overflow: 'hidden' }}
            >
              <span style={{ position: 'absolute', top: 22, right: 22, fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.09)', letterSpacing: '0.06em' }}>{num}</span>
              <div style={{ width: 42, height: 42, borderRadius: 13, background: `rgba(${rgb},0.13)`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 22 }}>
                <Icon size={18} color={color} />
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,0.90)', margin: '0 0 8px', lineHeight: 1.3 }}>{title}</h3>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.38)', lineHeight: 1.65, margin: 0 }}>{desc}</p>
            </motion.div>
          );
        })}
      </motion.div>
    </section>
  );
}

function StepsSection() {
  const router = useRouter();
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section
      ref={ref}
      style={{ position: 'relative', overflow: 'hidden', padding: 'clamp(80px, 10vw, 140px) clamp(24px, 6vw, 80px)' }}
    >
      <BlurredBg />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <motion.p
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ duration: 0.5 }}
          style={{ fontSize: 11, letterSpacing: '0.18em', color: '#a48f4f', textTransform: 'uppercase', marginBottom: 14, fontWeight: 600 }}
        >
          Proceso
        </motion.p>
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.1, ease: EASE }}
          style={{ fontSize: 'clamp(26px, 4vw, 48px)', fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.02em', color: 'white', margin: '0 0 60px', maxWidth: 500 }}
        >
          Tres pasos hacia la claridad.
        </motion.h2>

        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
          <div style={{ position: 'absolute', left: 4, top: 12, bottom: 52, width: 1, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
            <motion.div
              initial={{ scaleY: 0 }}
              animate={inView ? { scaleY: 1 } : {}}
              transition={{ duration: 1.5, delay: 0.4, ease: EASE_CLEAN }}
              style={{ height: '100%', background: 'linear-gradient(to bottom, #6f8fa6, #a48f4f)', transformOrigin: 'top' }}
            />
          </div>

          {STEPS.map(({ num, title, desc, dot, ring }, i) => (
            <motion.div
              key={num}
              initial={{ opacity: 0, y: 30 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.3 + i * 0.2, ease: EASE }}
              style={{ display: 'flex', gap: 'clamp(24px, 4vw, 48px)', alignItems: 'flex-start', paddingBottom: i < STEPS.length - 1 ? 52 : 0 }}
            >
              <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', paddingTop: 6 }}>
                <div style={{ width: 9, height: 9, borderRadius: '50%', background: dot, position: 'relative', zIndex: 1, boxShadow: `0 0 0 4px rgba(5,8,16,0.8), 0 0 0 5px ${ring}` }} />
              </div>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.20)', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>{num}</span>
                <h3 style={{ fontSize: 'clamp(18px, 2.4vw, 24px)', fontWeight: 700, color: 'rgba(255,255,255,0.90)', margin: '0 0 10px', lineHeight: 1.2 }}>{title}</h3>
                <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.38)', lineHeight: 1.65, margin: '0 0 18px', maxWidth: 480 }}>{desc}</p>
              </div>
            </motion.div>
          ))}
        </div>

        <motion.button
          onClick={() => router.push('/intake')}
          initial={{ opacity: 0, y: 16 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.9 }}
          whileHover={{ scale: 1.02, y: -2 }}
          whileTap={{ scale: 0.97 }}
          style={{ marginTop: 40, marginLeft: 33, display: 'inline-flex', alignItems: 'center', gap: 7, borderRadius: 999, border: '1px solid rgba(164,143,79,0.3)', background: 'rgba(164,143,79,0.08)', padding: '10px 22px', fontSize: 13, fontWeight: 600, color: 'rgba(164,143,79,0.9)', cursor: 'pointer' }}
        >
          Comenzar diagnóstico <ArrowRight size={13} />
        </motion.button>
      </div>
    </section>
  );
}

function PreviewSection() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section
      ref={ref}
      style={{ background: '#0b0e18', padding: 'clamp(80px, 10vw, 140px) clamp(24px, 6vw, 80px)', display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', overflow: 'hidden' }}
    >
      <div style={{ position: 'absolute', top: '-20%', left: '50%', transform: 'translateX(-50%)', width: '80vw', height: '80vw', maxWidth: 700, maxHeight: 700, borderRadius: '50%', background: 'radial-gradient(circle, rgba(60,90,130,0.08) 0%, transparent 65%)', pointerEvents: 'none' }} />

      <motion.p
        initial={{ opacity: 0 }}
        animate={inView ? { opacity: 1 } : {}}
        transition={{ duration: 0.5 }}
        style={{ fontSize: 11, letterSpacing: '0.18em', color: '#6f8fa6', textTransform: 'uppercase', marginBottom: 14, fontWeight: 600, textAlign: 'center', position: 'relative', zIndex: 1 }}
      >
        El agente en acción
      </motion.p>
      <motion.h2
        initial={{ opacity: 0, y: 20 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6, delay: 0.1, ease: EASE }}
        style={{ fontSize: 'clamp(24px, 3.5vw, 44px)', fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 700, lineHeight: 1.15, letterSpacing: '-0.02em', color: 'white', margin: '0 0 52px', maxWidth: 500, textAlign: 'center', position: 'relative', zIndex: 1 }}
      >
        Una conversación que cambia cómo ves tu dinero.
      </motion.h2>

      {/* Chat mock — colores del agente real */}
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 40 }}
        animate={inView ? { opacity: 1, scale: 1, y: 0 } : {}}
        transition={{ duration: 0.8, delay: 0.25, ease: EASE }}
        style={{ width: '100%', maxWidth: 500, background: '#202833', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 20, overflow: 'hidden', boxShadow: '0 40px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.03)', position: 'relative', zIndex: 1 }}
      >
        {/* Topbar */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(12,16,26,0.6)' }}>
          <motion.div
            animate={{ opacity: [1, 0.4, 1] }}
            transition={{ duration: 2.5, repeat: Infinity }}
            style={{ width: 7, height: 7, borderRadius: '50%', background: '#34c759', flexShrink: 0 }}
          />
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', fontWeight: 500, letterSpacing: '-0.01em' }}>
            Financieramente IA
          </span>
        </div>

        {/* Thread — bg igual al agente real */}
        <div style={{ padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 8, background: '#11151c' }}>
          {CHAT_MESSAGES.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.4, delay: 0.7 + i * 0.65, ease: EASE }}
              style={{ display: 'flex', justifyContent: msg.from === 'user' ? 'flex-end' : 'flex-start' }}
            >
              <div style={{ maxWidth: '78%', padding: '9px 13px', borderRadius: msg.from === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px', background: msg.from === 'user' ? '#6f8fa6' : 'rgba(32,40,51,0.95)', fontSize: 13, lineHeight: 1.55, color: msg.from === 'user' ? '#ffffff' : 'rgba(255,255,255,0.78)', letterSpacing: '-0.01em' }}>
                {msg.text}
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}

function TrustSection() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section
      ref={ref}
      style={{ position: 'relative', overflow: 'hidden', padding: 'clamp(64px, 8vw, 100px) clamp(24px, 6vw, 80px)' }}
    >
      <BlurredBg />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <motion.div
          variants={staggerFast}
          initial="hidden"
          animate={inView ? 'visible' : 'hidden'}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 32, marginBottom: 52 }}
        >
          {TRUST.map(({ Icon, label, sub }) => (
            <motion.div key={label} variants={fadeUp} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ width: 38, height: 38, borderRadius: 11, background: 'rgba(111,143,166,0.11)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={16} color="#6f8fa6" />
              </div>
              <h4 style={{ fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.85)', margin: 0 }}>{label}</h4>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', lineHeight: 1.55, margin: 0 }}>{sub}</p>
            </motion.div>
          ))}
        </motion.div>

        <motion.div
          initial={{ scaleX: 0 }}
          animate={inView ? { scaleX: 1 } : {}}
          transition={{ duration: 0.9, delay: 0.5, ease: EASE_CLEAN }}
          style={{ height: 1, background: 'rgba(255,255,255,0.08)', marginBottom: 36, transformOrigin: 'left' }}
        />

        <motion.blockquote
          initial={{ opacity: 0, y: 16 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.7 }}
          style={{ margin: 0, fontFamily: 'Georgia, "Times New Roman", serif', fontStyle: 'italic', fontSize: 'clamp(18px, 2.5vw, 26px)', color: 'rgba(255,255,255,0.40)', lineHeight: 1.4, maxWidth: 580 }}
        >
          "Una conversación honesta sobre tus finanzas."
          <cite style={{ display: 'block', fontStyle: 'normal', fontSize: 11, letterSpacing: '0.10em', color: 'rgba(255,255,255,0.18)', textTransform: 'uppercase', marginTop: 14, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
            — Financieramente
          </cite>
        </motion.blockquote>
      </div>
    </section>
  );
}

function CtaSection() {
  const router = useRouter();
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section
      ref={ref}
      style={{ background: 'linear-gradient(to bottom, #060810, #0a0e1a)', padding: 'clamp(100px, 12vw, 160px) clamp(24px, 6vw, 80px)', textAlign: 'center', position: 'relative', overflow: 'hidden' }}
    >
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '50vw', height: '50vw', maxWidth: 500, maxHeight: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(111,143,166,0.06) 0%, transparent 70%)', pointerEvents: 'none' }} />

      <motion.h2
        initial={{ opacity: 0, y: 30 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.7, ease: EASE }}
        style={{ fontSize: 'clamp(40px, 6vw, 80px)', fontFamily: 'Georgia, "Times New Roman", serif', fontStyle: 'italic', fontWeight: 700, lineHeight: 1.05, letterSpacing: '-0.03em', color: 'white', margin: '0 0 14px' }}
      >
        Prueba el agente.
      </motion.h2>

      <motion.p
        initial={{ opacity: 0, y: 16 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6, delay: 0.15, ease: EASE }}
        style={{ fontSize: 15, color: 'rgba(255,255,255,0.35)', marginBottom: 40, lineHeight: 1.6 }}
      >
        Un prototipo de tesis real, disponible para explorar.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6, delay: 0.3 }}
        style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}
      >
        <motion.button
          onClick={() => router.push('/intake')}
          whileHover={{ scale: 1.04, y: -2 }}
          whileTap={{ scale: 0.97 }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, borderRadius: 999, background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.22)', padding: '13px 28px', fontSize: 14, fontWeight: 600, color: 'white', cursor: 'pointer', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
        >
          Comenzar diagnóstico <ArrowRight size={14} />
        </motion.button>
        <motion.button
          onClick={() => router.push('/agent')}
          whileHover={{ scale: 1.02, y: -1 }}
          whileTap={{ scale: 0.97 }}
          style={{ borderRadius: 999, background: 'none', border: '1px solid rgba(255,255,255,0.11)', padding: '13px 26px', fontSize: 14, color: 'rgba(255,255,255,0.46)', cursor: 'pointer' }}
        >
          Hablar con el agente
        </motion.button>
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={inView ? { opacity: 1 } : {}}
        transition={{ duration: 0.5, delay: 0.6 }}
        style={{ marginTop: 36, fontSize: 11, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.15)', textTransform: 'uppercase' }}
      >
        Proyecto de tesis — Ingeniería / Economía
      </motion.p>
    </section>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function HomePage() {
  const router = useRouter();
  const { scrollY } = useScroll();

  const heroContentY = useTransform(scrollY, [0, 500], [0, -60]);
  const heroOpacity = useTransform(scrollY, [0, 350], [1, 0]);
  const shaderOpacity = useTransform(scrollY, [0, 400], [0.45, 0]);
  const scrollArrowOpacity = useTransform(scrollY, [0, 120], [1, 0]);

  return (
    <main style={{ background: '#060810', color: 'white' }}>

      {/* ─── HERO ────────────────────────────────────────────────────────── */}
      <section style={{ position: 'relative', minHeight: '100dvh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div className="home-fondo-bg" />
        <div style={{ position: 'absolute', inset: 0, zIndex: 1, background: 'rgba(8,12,22,0.28)', pointerEvents: 'none' }} />
        <motion.div style={{ position: 'absolute', inset: 0, zIndex: 2, opacity: shaderOpacity, mixBlendMode: 'screen', pointerEvents: 'none' }}>
          <ShaderAnimation />
        </motion.div>
        <div style={{ position: 'absolute', inset: 0, zIndex: 3, pointerEvents: 'none', background: 'linear-gradient(to bottom, rgba(0,0,0,0.32) 0%, rgba(0,0,0,0.02) 30%, rgba(0,0,0,0.48) 74%, rgba(0,0,0,0.80) 100%)' }} />

        <div style={{ position: 'relative', zIndex: 10, display: 'flex', minHeight: '100dvh', flexDirection: 'column' }}>

          {/* Header — logo más abajo y más grande */}
          <div className="home-page-header" style={{ paddingTop: 'clamp(56px, 9vh, 88px)' }}>
            <button
              onClick={() => router.push('/')}
              aria-label="Financieramente"
              style={{ display: 'flex', alignItems: 'center', gap: 11, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              <div style={{ width: 42, height: 42, flexShrink: 0, borderRadius: 10, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.30)' }}>
                <Image src="/logo-financieramente.jpg" alt="Financieramente" width={42} height={42} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
              <span style={{ fontSize: 15, fontWeight: 500, color: 'rgba(255,255,255,0.85)', letterSpacing: '0.01em' }}>
                Financieramente
              </span>
            </button>

            <button
              onClick={() => router.push('/agent')}
              style={{ borderRadius: 999, border: '1px solid rgba(255,255,255,0.20)', padding: '8px 18px', fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.78)', background: 'none', cursor: 'pointer' }}
            >
              Entrar
            </button>
          </div>

          <div style={{ flex: 1 }} />

          {/* Hero content */}
          <motion.section className="home-page-hero" style={{ y: heroContentY, opacity: heroOpacity }}>
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'rgba(111,143,166,0.12)', border: '1px solid rgba(111,143,166,0.24)', borderRadius: 999, padding: '5px 13px', marginBottom: 22 }}
            >
              <motion.span
                animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
                transition={{ duration: 2.2, repeat: Infinity }}
                style={{ width: 6, height: 6, borderRadius: '50%', background: '#34c759', display: 'block', flexShrink: 0 }}
              />
              <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(111,167,188,0.88)', letterSpacing: '0.05em' }}>AGENTE IA FINANCIERO</span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.25, ease: EASE }}
              style={{ fontSize: 'clamp(50px, 7vw, 96px)', fontWeight: 700, lineHeight: 0.90, letterSpacing: '-0.04em', color: 'white', margin: '0 0 20px' }}
            >
              Tu dinero,
              <br />
              <em style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 400, fontStyle: 'italic', color: 'rgba(255,255,255,0.72)' }}>
                más claro.
              </em>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.45, ease: EASE }}
              style={{ color: 'rgba(255,255,255,0.48)', fontSize: 15, lineHeight: 1.6, maxWidth: 360, margin: '0 0 32px' }}
            >
              Una conversación honesta sobre tus finanzas.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.6 }}
              style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}
            >
              <motion.button
                onClick={() => router.push('/agent')}
                whileHover={{ scale: 1.03, y: -2 }}
                whileTap={{ scale: 0.97 }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, borderRadius: 999, border: '1px solid rgba(255,255,255,0.24)', background: 'rgba(255,255,255,0.10)', padding: '11px 24px', fontSize: 13, fontWeight: 600, color: 'white', cursor: 'pointer', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
              >
                Comenzar <ArrowRight size={14} />
              </motion.button>
              <motion.button
                onClick={() => router.push('/intake')}
                whileHover={{ scale: 1.02, y: -1 }}
                whileTap={{ scale: 0.97 }}
                style={{ borderRadius: 999, border: '1px solid rgba(255,255,255,0.13)', background: 'none', padding: '11px 22px', fontSize: 13, color: 'rgba(255,255,255,0.55)', cursor: 'pointer' }}
              >
                Ver diagnóstico
              </motion.button>
            </motion.div>
          </motion.section>

          {/* Scroll indicator */}
          <motion.div style={{ opacity: scrollArrowOpacity, display: 'flex', justifyContent: 'center', paddingBottom: 20, zIndex: 10 }}>
            <motion.div animate={{ y: [0, 8, 0] }} transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}>
              <ChevronDown size={20} color="rgba(255,255,255,0.22)" />
            </motion.div>
          </motion.div>

          <div className="home-page-caption">
            <span>Proyecto de tesis.</span>
            <span>Financieramente</span>
          </div>
        </div>
      </section>

      {/* ─── SUBSEQUENT SECTIONS ─────────────────────────────────────────── */}
      <ProblemSection />
      <FeaturesSection />
      <StepsSection />
      <PreviewSection />
      <TrustSection />
      <CtaSection />

    </main>
  );
}
