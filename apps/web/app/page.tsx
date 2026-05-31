'use client';

import { useRouter } from 'next/navigation';
import { ArrowRight, Play } from 'lucide-react';
import { motion } from 'framer-motion';
import { ShaderAnimation } from '@/components/ui/shader-animation';
import { FloatingOrbs3D } from '@/components/ui/floating-orbs-3d';

const ease = [0.25, 0.46, 0.45, 0.94] as const;

export default function HomePage() {
  const router = useRouter();

  return (
    <main style={{
      position: 'relative',
      minHeight: '100dvh',
      overflow: 'hidden',
      background: '#060810',
      color: 'white',
      display: 'flex',
      flexDirection: 'column',
    }}>

      {/* Background photo */}
      <div className="home-fondo-bg" />

      {/* Subtle dark layer */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 1,
        background: 'rgba(4,6,16,0.28)',
        pointerEvents: 'none',
      }} />

      {/* Shader wave overlay */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 2,
        opacity: 0.28, mixBlendMode: 'screen', pointerEvents: 'none',
      }}>
        <ShaderAnimation />
      </div>

      {/* 3D floating orbs + particles */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 3, pointerEvents: 'none',
      }}>
        <FloatingOrbs3D />
      </div>

      {/* Cinematic vignette gradient */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 4, pointerEvents: 'none',
        background: [
          'linear-gradient(to bottom,',
          'rgba(0,0,0,0.30) 0%,',
          'rgba(0,0,0,0.00) 22%,',
          'rgba(0,0,0,0.00) 52%,',
          'rgba(0,0,0,0.55) 78%,',
          'rgba(0,0,0,0.85) 100%)',
        ].join(' '),
      }} />

      {/* Noise film grain */}
      <div className="home-v2-grain" />

      {/* ── UI layout ── */}
      <div style={{
        position: 'relative', zIndex: 10,
        display: 'flex', minHeight: '100dvh', flexDirection: 'column',
      }}>

        {/* Header — logo · center nav · actions */}
        <motion.header
          className="home-v2-header"
          initial={{ opacity: 0, y: -18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.75, ease }}
        >
          {/* Logo */}
          <button
            onClick={() => router.push('/')}
            aria-label="Financieramente"
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            }}
          >
            <div style={{
              width: 32, height: 32, flexShrink: 0,
              background: '#edecea', color: '#0a0a0a',
              fontFamily: 'Georgia, "Times New Roman", serif',
              fontSize: 14, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              letterSpacing: '-0.02em', borderRadius: 5,
            }}>Fm</div>
            <span style={{
              fontSize: 14, fontWeight: 500,
              color: 'rgba(255,255,255,0.82)', letterSpacing: '0.01em',
            }}>
              Financieramente
            </span>
          </button>

          {/* Center navigation — visible on desktop */}
          <nav className="home-v2-nav">
            <span>Misión</span>
            <span>Cómo funciona</span>
            <span>Precios</span>
          </nav>

          {/* Right actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button
              onClick={() => router.push('/register')}
              className="home-v2-action-ghost"
            >
              Nueva cuenta
            </button>
            <button
              onClick={() => router.push('/agent')}
              className="home-v2-action-solid"
            >
              Ingresar <ArrowRight size={13} strokeWidth={2.2} />
            </button>
          </div>
        </motion.header>

        {/* Flexible spacer */}
        <div style={{ flex: 1 }} />

        {/* ── Giant hero text — BridgeAI style ── */}
        <section className="home-v2-hero">

          <motion.h1
            className="home-v2-headline"
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.0, ease, delay: 0.12 }}
          >
            <span className="home-v2-headline-primary">Tu dinero,</span>
            <span className="home-v2-headline-secondary">más claro.</span>
          </motion.h1>

          <motion.p
            className="home-v2-subtext"
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.85, ease, delay: 0.36 }}
          >
            Una conversación honesta sobre tus finanzas.
          </motion.p>

          <motion.div
            style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.85, ease, delay: 0.52 }}
          >
            <button
              onClick={() => router.push('/agent')}
              className="home-v2-cta-primary"
            >
              Comenzar <ArrowRight size={14} strokeWidth={2.2} />
            </button>
            <button
              onClick={() => router.push('/intake')}
              className="home-v2-cta-ghost"
            >
              Ver diagnóstico
            </button>
          </motion.div>

        </section>

        {/* ── Bottom bar ── */}
        <div className="home-v2-bottom">

          {/* Left — Financieramente™ callout, like BridgeCore™ */}
          <motion.div
            className="home-v2-callout"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.85, ease, delay: 0.70 }}
          >
            <div className="home-v2-callout-label">
              <div className="home-v2-callout-icon">✦</div>
              <span>Financieramente™</span>
            </div>
            <p className="home-v2-callout-desc">
              Tu agente financiero personal. Analiza tus datos y entrega claridad en minutos.
            </p>
          </motion.div>

          {/* Right — demo / play pill */}
          <motion.button
            className="home-v2-play"
            onClick={() => router.push('/agent')}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.85, ease, delay: 0.82 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.97 }}
          >
            <div className="home-v2-play-btn">
              <Play size={14} fill="#0a0a0a" color="#0a0a0a" style={{ marginLeft: 2 }} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', fontWeight: 500 }}>
                ¿Cómo funciona?
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)' }}>1:30</div>
            </div>
          </motion.button>

        </div>

      </div>
    </main>
  );
}
