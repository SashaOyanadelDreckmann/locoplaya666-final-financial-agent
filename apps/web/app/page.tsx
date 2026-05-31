'use client';

import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import Image from 'next/image';

export default function HomePage() {
  const router = useRouter();

  return (
<<<<<<< Updated upstream
    <main style={{ position: 'relative', minHeight: '100dvh', overflow: 'hidden', background: '#060810', color: 'white', display: 'flex', flexDirection: 'column' }}>

      {/* Foto de fondo — saturada, mate, vibrante; en desktop rotada horizontal */}
      <div className="home-fondo-bg" />

      {/* Overlay color — refuerza el tono mate sin oscurecer demasiado */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 1, background: 'rgba(8,12,22,0.28)', pointerEvents: 'none' }} />

      {/* Shader ENCIMA de la foto — mismo porte que la página */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 2,
        opacity: 0.45,
        mixBlendMode: 'screen',
        pointerEvents: 'none',
      }}>
        <ShaderAnimation />
      </div>

      {/* Gradiente cinematográfico */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 3, pointerEvents: 'none',
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.32) 0%, rgba(0,0,0,0.02) 30%, rgba(0,0,0,0.48) 74%, rgba(0,0,0,0.80) 100%)',
      }} />
=======
    <main className="relative min-h-dvh overflow-hidden text-white">
      <div className="absolute inset-0 -z-30 bg-[url('/fondo4.jpg')] bg-cover bg-center bg-no-repeat" />
      <div className="absolute inset-0 -z-20 bg-black/45" />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_15%,rgba(255,255,255,0.24),transparent_38%),radial-gradient(circle_at_78%_30%,rgba(122,154,186,0.26),transparent_44%)]" />

      <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-6 py-8 md:px-10">
        <header className="flex items-center justify-between">
          <button
            className="inline-flex aspect-square w-[86px] items-center justify-center overflow-hidden rounded-[14px] bg-[#ececeb] shadow-[0_18px_40px_rgba(0,0,0,0.28)] md:w-[96px]"
            onClick={() => router.push('/')}
            aria-label="Financieramente"
          >
            <Image
              src="/logo-financieramente.jpg"
              alt="Financieramente"
              width={96}
              height={96}
              className="h-full w-full object-cover"
            />
          </button>
          <div className="rounded-full border border-white/35 bg-white/12 px-4 py-2 text-xs tracking-[0.16em] text-white/85 uppercase backdrop-blur-xl">
            Financieramente
          </div>
        </header>
>>>>>>> Stashed changes

      {/* Layout */}
      <div style={{ position: 'relative', zIndex: 10, display: 'flex', minHeight: '100dvh', flexDirection: 'column' }}>

        {/* Header — logo + nombre a la izquierda, botón entrar a la derecha */}
        <div className="home-page-header">
          <button
            onClick={() => router.push('/')}
            aria-label="Financieramente"
            style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            {/* Logo mark cuadrado */}
            <div style={{
              width: 30, height: 30, flexShrink: 0,
              background: '#edecea', color: '#0a0a0a',
              fontFamily: 'Georgia, "Times New Roman", serif',
              fontSize: 14, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              letterSpacing: '-0.02em',
            }}>
              Fm
            </div>
            {/* Nombre de la marca */}
            <span style={{ fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.82)', letterSpacing: '0.01em' }}>
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

        {/* Espacio flexible */}
        <div style={{ flex: 1 }} />

        {/* Hero — minimalista, cálido */}
        <section className="home-page-hero">
          <h1 style={{
            fontSize: 'clamp(50px, 7vw, 96px)',
            fontWeight: 700,
            lineHeight: 0.90,
            letterSpacing: '-0.04em',
            color: 'white',
            margin: '0 0 20px',
          }}>
            Tu dinero,
            <br />
            <em style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 400, fontStyle: 'italic', color: 'rgba(255,255,255,0.72)' }}>
              más claro.
            </em>
          </h1>

          <p style={{ color: 'rgba(255,255,255,0.48)', fontSize: 15, lineHeight: 1.6, maxWidth: 360, margin: '0 0 32px' }}>
            Una conversación honesta sobre tus finanzas.
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
            <button
              onClick={() => router.push('/agent')}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                borderRadius: 999, border: '1px solid rgba(255,255,255,0.24)',
                background: 'rgba(255,255,255,0.10)',
                padding: '11px 24px', fontSize: 13, fontWeight: 600,
                color: 'white', cursor: 'pointer',
                backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
              }}
            >
              Comenzar <ArrowRight size={14} />
            </button>
            <button
              onClick={() => router.push('/intake')}
              style={{
                borderRadius: 999, border: '1px solid rgba(255,255,255,0.13)',
                background: 'none', padding: '11px 22px', fontSize: 13,
                color: 'rgba(255,255,255,0.55)', cursor: 'pointer',
              }}
            >
              Ver diagnóstico
            </button>
          </div>
        </section>

        {/* Caption de pie */}
        <div className="home-page-caption">
          <span>Claridad antes de decidir.</span>
          <span>Financieramente</span>
        </div>

      </div>
    </main>
  );
}
