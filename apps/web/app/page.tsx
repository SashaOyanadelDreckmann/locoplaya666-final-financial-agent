'use client';

import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { ShaderAnimation } from '@/components/ui/shader-animation';

export default function HomePage() {
  const router = useRouter();

  return (
    <main className="relative min-h-dvh overflow-hidden text-white">
      <div className="absolute inset-0 -z-30 bg-[url('/fondo4.jpg')] bg-cover bg-center bg-no-repeat" />
      <div className="absolute inset-0 -z-20 bg-black/45" />
      <div className="absolute inset-0 -z-10 opacity-40 mix-blend-screen">
        <ShaderAnimation />
      </div>
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_15%,rgba(255,255,255,0.24),transparent_38%),radial-gradient(circle_at_78%_30%,rgba(122,154,186,0.26),transparent_44%),linear-gradient(to_bottom,rgba(0,0,0,0.05),rgba(0,0,0,0.58))]" />

      <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-6 py-8 md:px-10">
        <header className="flex items-center justify-between">
          <button className="home-essence__logo-mark" onClick={() => router.push('/')} aria-label="Financieramente">
            <span className="fm-logo-f">F</span>
            <span className="fm-logo-m">m</span>
          </button>
          <div className="rounded-full border border-white/35 bg-white/12 px-4 py-2 text-xs tracking-[0.16em] text-white/85 uppercase backdrop-blur-xl">
            Financieramente
          </div>
        </header>

        <section className="flex flex-1 items-center">
          <div className="max-w-3xl space-y-6 rounded-[28px] border border-white/20 bg-black/22 p-6 shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl md:p-10">
            <h1 className="text-5xl leading-[0.95] font-semibold tracking-[-0.04em] md:text-7xl">
              Claridad financiera
              <br />
              de nivel premium.
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-white/78 md:text-lg">
              Una experiencia limpia y natural para tomar mejores decisiones de dinero con calma, foco y contexto.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => router.push('/agent')}
                className="inline-flex items-center gap-2 rounded-full border border-white/35 bg-white/16 px-6 py-3 text-sm font-medium backdrop-blur-2xl transition hover:bg-white/28"
              >
                Entrar al agente <ArrowRight className="h-4 w-4" />
              </button>
              <button
                onClick={() => router.push('/intake')}
                className="rounded-full border border-white/28 bg-black/24 px-6 py-3 text-sm text-white/92 backdrop-blur-xl transition hover:bg-black/35"
              >
                Comenzar diagnóstico
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
