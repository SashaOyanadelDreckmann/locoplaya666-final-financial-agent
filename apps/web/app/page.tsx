'use client';

import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { ShaderAnimation } from '@/components/ui/shader-animation';

export default function HomePage() {
  const router = useRouter();

  return (
    <main style={{ position: 'relative', minHeight: '100dvh', overflow: 'hidden', background: '#060810', color: 'white', display: 'flex', flexDirection: 'column' }}>

      {/* Foto de fondo */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0,
        backgroundImage: "url('/fondo4.jpg')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }} />

      {/* Overlay oscuro suave */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 1, background: 'rgba(0,0,0,0.18)', pointerEvents: 'none' }} />

      {/* Shader ENCIMA de la foto — screen blend, muy transparente */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 2,
        opacity: 0.14,
        mixBlendMode: 'screen',
        pointerEvents: 'none',
      }}>
        <ShaderAnimation />
      </div>

      {/* Gradiente cinematográfico — oscurece bordes para legibilidad */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 3, pointerEvents: 'none',
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.30) 0%, rgba(0,0,0,0.04) 32%, rgba(0,0,0,0.52) 78%, rgba(0,0,0,0.78) 100%)',
      }} />

      {/* Layout */}
      <div style={{ position: 'relative', zIndex: 10, display: 'flex', minHeight: '100dvh', flexDirection: 'column' }}>

        {/* Header */}
        <div className="home-page-header">
          <button
            onClick={() => router.push('/')}
            aria-label="Financieramente"
            style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 22, fontWeight: 700, color: 'white', background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}
          >
            Fm
          </button>

          <nav className="home-page-nav">
            <span>Acerca</span>
            <span>Funciones</span>
            <span>Precios</span>
          </nav>

          <button
            onClick={() => router.push('/agent')}
            style={{ borderRadius: 999, border: '1px solid rgba(255,255,255,0.20)', padding: '8px 18px', fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.82)', background: 'none', cursor: 'pointer', transition: 'border-color 0.2s, background 0.2s' }}
          >
            Entrar
          </button>
        </div>

        {/* Espacio flexible */}
        <div style={{ flex: 1 }} />

        {/* Hero — editorial bottom-left */}
        <section className="home-page-hero">
          <h1 style={{
            fontSize: 'clamp(44px, 6.2vw, 88px)',
            fontWeight: 700,
            lineHeight: 0.88,
            letterSpacing: '-0.04em',
            color: 'white',
            margin: '0 0 18px',
          }}>
            Claridad financiera
            <br />
            <em style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 400, fontStyle: 'italic', color: 'rgba(255,255,255,0.68)' }}>
              de nivel premium.
            </em>
          </h1>

          <p style={{ color: 'rgba(255,255,255,0.50)', fontSize: 15, lineHeight: 1.65, maxWidth: 420, margin: '0 0 28px' }}>
            Una experiencia limpia y natural para tomar mejores decisiones de dinero con calma, foco y contexto.
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
            <button
              onClick={() => router.push('/agent')}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                borderRadius: 999, border: '1px solid rgba(255,255,255,0.22)',
                background: 'rgba(255,255,255,0.09)',
                padding: '11px 22px', fontSize: 13, fontWeight: 600,
                color: 'white', cursor: 'pointer',
                backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
                transition: 'background 0.2s, border-color 0.2s',
              }}
            >
              Entrar al agente <ArrowRight size={14} />
            </button>
            <button
              onClick={() => router.push('/intake')}
              style={{
                borderRadius: 999, border: '1px solid rgba(255,255,255,0.13)',
                background: 'none', padding: '11px 22px', fontSize: 13,
                color: 'rgba(255,255,255,0.60)', cursor: 'pointer',
                transition: 'border-color 0.2s, color 0.2s',
              }}
            >
              Comenzar diagnóstico
            </button>
          </div>
        </section>

        {/* Caption de pie */}
        <div className="home-page-caption">
          <span>El camino empieza en la claridad.</span>
          <span>Financieramente</span>
        </div>

      </div>
    </main>
  );
}
