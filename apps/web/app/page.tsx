'use client';

import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { ShaderAnimation } from '@/components/ui/shader-animation';

export default function HomePage() {
  const router = useRouter();

  return (
    <main className="relative min-h-dvh overflow-hidden bg-[#060810] text-white">
      {/* Foto de fondo */}
      <div className="absolute inset-0 z-0 bg-[url('/fondo4.jpg')] bg-cover bg-center bg-no-repeat" />

      {/* Overlay oscuro base */}
      <div className="absolute inset-0 z-[1] bg-black/30 pointer-events-none" />

      {/* Shader ENCIMA de la foto — vivid pero mate con overlay blend */}
      <div className="absolute inset-0 z-[2] opacity-[0.30] mix-blend-overlay pointer-events-none">
        <ShaderAnimation />
      </div>

      {/* Gradiente cinematográfico — oscurece bordes, no el centro */}
      <div
        className="absolute inset-0 z-[3] pointer-events-none"
        style={{
          background:
            'linear-gradient(168deg, rgba(4,6,12,0.18) 0%, transparent 42%, rgba(4,6,12,0.72) 100%)',
        }}
      />

      {/* Fade superior */}
      <div className="absolute inset-x-0 top-0 z-[4] h-36 bg-gradient-to-b from-black/48 to-transparent pointer-events-none" />

      {/* Fade inferior */}
      <div className="absolute inset-x-0 bottom-0 z-[4] h-64 bg-gradient-to-t from-black/78 to-transparent pointer-events-none" />

      {/* Layout principal */}
      <div className="relative z-[10] flex min-h-dvh flex-col">

        {/* Nav */}
        <header className="flex items-center justify-between px-7 pt-7 md:px-14 md:pt-9">
          <button
            className="select-none font-serif text-[22px] font-bold leading-none tracking-[-0.02em] text-white"
            onClick={() => router.push('/')}
            aria-label="Financieramente"
          >
            Fm
          </button>

          <nav className="hidden items-center gap-8 text-[13px] font-medium tracking-[0.04em] text-white/55 md:flex">
            <span className="cursor-pointer transition-colors duration-200 hover:text-white/90">
              Acerca
            </span>
            <span className="cursor-pointer transition-colors duration-200 hover:text-white/90">
              Funciones
            </span>
            <span className="cursor-pointer transition-colors duration-200 hover:text-white/90">
              Precios
            </span>
          </nav>

          <button
            onClick={() => router.push('/agent')}
            className="rounded-full border border-white/22 px-5 py-[9px] text-[13px] font-medium text-white/82 transition-all duration-200 hover:border-white/38 hover:bg-white/[0.07]"
          >
            Entrar
          </button>
        </header>

        {/* Espacio flexible que empuja el contenido hacia abajo */}
        <div className="flex-1" />

        {/* Hero — editorial, bottom-left */}
        <section className="px-7 pb-10 md:px-14 md:pb-16">
          <div className="max-w-[700px]">
            <h1 className="mb-5 text-[clamp(48px,6.5vw,90px)] font-bold leading-[0.88] tracking-[-0.04em] text-white">
              Claridad financiera
              <br />
              <em
                className="font-serif font-normal text-white/74"
                style={{ fontStyle: 'italic' }}
              >
                de nivel premium.
              </em>
            </h1>

            <p className="mb-8 max-w-[440px] text-[15px] leading-[1.65] text-white/52 md:text-[16px]">
              Una experiencia limpia y natural para tomar mejores decisiones de
              dinero con calma, foco y contexto.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => router.push('/agent')}
                className="inline-flex items-center gap-[7px] rounded-full border border-white/26 bg-white/[0.10] px-6 py-3 text-[14px] font-semibold text-white backdrop-blur-sm transition-all duration-200 hover:border-white/40 hover:bg-white/[0.17]"
              >
                Entrar al agente <ArrowRight className="h-[14px] w-[14px]" />
              </button>
              <button
                onClick={() => router.push('/intake')}
                className="rounded-full border border-white/16 px-6 py-3 text-[14px] text-white/68 transition-all duration-200 hover:border-white/28 hover:text-white/86"
              >
                Comenzar diagnóstico
              </button>
            </div>
          </div>
        </section>

        {/* Caption de pie — como los referencias */}
        <div className="flex items-center justify-between px-7 pb-6 md:px-14">
          <span className="text-[10px] tracking-[0.16em] text-white/24 uppercase">
            El camino empieza en la claridad.
          </span>
          <span className="text-[10px] tracking-[0.12em] text-white/24 uppercase">
            Financieramente
          </span>
        </div>
      </div>
    </main>
  );
}
