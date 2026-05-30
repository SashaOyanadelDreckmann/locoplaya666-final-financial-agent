'use client';

import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { ShaderAnimation } from '@/components/ui/shader-animation';

export default function HomePage() {
  const router = useRouter();

  return (
    <main className="relative min-h-dvh overflow-hidden bg-[#060810] text-white">
      {/* Foto de fondo — capa base, siempre visible */}
      <div className="absolute inset-0 z-0 bg-[url('/fondo4.jpg')] bg-cover bg-center bg-no-repeat" />

      {/* Overlay oscuro muy suave — solo para legibilidad */}
      <div className="absolute inset-0 z-[1] bg-black/18 pointer-events-none" />

      {/* Shader encima de la foto — mix-blend-screen hace que el negro sea
          completamente transparente, solo los anillos brillantes se ven */}
      <div className="absolute inset-0 z-[2] opacity-[0.13] mix-blend-screen pointer-events-none">
        <ShaderAnimation />
      </div>

      {/* Gradiente cinematográfico para que el texto sea legible */}
      <div
        className="absolute inset-0 z-[3] pointer-events-none"
        style={{
          background:
            'linear-gradient(to bottom, rgba(0,0,0,0.28) 0%, rgba(0,0,0,0.05) 35%, rgba(0,0,0,0.55) 80%, rgba(0,0,0,0.75) 100%)',
        }}
      />

      {/* Layout principal */}
      <div className="relative z-[10] flex min-h-dvh flex-col">

        {/* Nav */}
        <div className="flex items-center justify-between px-6 pt-6 md:px-14 md:pt-9">
          <button
            className="select-none font-serif text-xl font-bold leading-none tracking-tight text-white"
            onClick={() => router.push('/')}
            aria-label="Financieramente"
          >
            Fm
          </button>

          <div className="hidden md:flex items-center gap-8 text-[13px] font-medium tracking-wide text-white/55">
            <span className="cursor-pointer hover:text-white/90 transition-colors duration-200">Acerca</span>
            <span className="cursor-pointer hover:text-white/90 transition-colors duration-200">Funciones</span>
            <span className="cursor-pointer hover:text-white/90 transition-colors duration-200">Precios</span>
          </div>

          <button
            onClick={() => router.push('/agent')}
            className="rounded-full border border-white/20 px-4 py-2 text-[13px] font-medium text-white/80 transition-all duration-200 hover:border-white/36 hover:bg-white/[0.06] md:px-5 md:py-[9px]"
          >
            Entrar
          </button>
        </div>

        {/* Espacio flexible */}
        <div className="flex-1" />

        {/* Hero — editorial bottom-left */}
        <section className="px-6 pb-8 md:px-14 md:pb-16">
          <div className="max-w-[680px]">
            <h1 className="mb-4 text-[clamp(44px,6.2vw,88px)] font-bold leading-[0.88] tracking-[-0.04em] text-white">
              Claridad financiera
              <br />
              <em
                className="font-serif font-normal text-white/70"
                style={{ fontStyle: 'italic' }}
              >
                de nivel premium.
              </em>
            </h1>

            <p className="mb-7 max-w-sm text-[14px] leading-relaxed text-white/50 md:max-w-md md:text-[15px]">
              Una experiencia limpia y natural para tomar mejores decisiones
              de dinero con calma, foco y contexto.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => router.push('/agent')}
                className="inline-flex items-center gap-2 rounded-full border border-white/24 bg-white/[0.09] px-5 py-[10px] text-[13px] font-semibold text-white backdrop-blur-sm transition-all duration-200 hover:border-white/38 hover:bg-white/[0.15] md:px-6"
              >
                Entrar al agente <ArrowRight className="h-[13px] w-[13px]" />
              </button>
              <button
                onClick={() => router.push('/intake')}
                className="rounded-full border border-white/14 px-5 py-[10px] text-[13px] text-white/62 transition-all duration-200 hover:border-white/24 hover:text-white/82 md:px-6"
              >
                Comenzar diagnóstico
              </button>
            </div>
          </div>
        </section>

        {/* Caption de pie */}
        <div className="flex items-center justify-between px-6 pb-5 md:px-14">
          <span className="text-[10px] tracking-[0.14em] text-white/22 uppercase">
            El camino empieza en la claridad.
          </span>
          <span className="text-[10px] tracking-[0.10em] text-white/22 uppercase">
            Financieramente
          </span>
        </div>

      </div>
    </main>
  );
}
