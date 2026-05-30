'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ArrowRight, Sparkles } from 'lucide-react';
import { ShaderAnimation } from '@/components/ui/shader-animation';

export default function HomePage() {
  const router = useRouter();

  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      <div className="absolute inset-0 -z-30 bg-[url('/fondo4.jpg')] bg-cover bg-center" />
      <div className="absolute inset-0 -z-20 bg-black/62" />
      <div className="absolute inset-0 -z-10 opacity-60">
        <ShaderAnimation />
      </div>

      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8 md:px-10">
        <header className="flex items-center justify-between">
          <button className="home-essence__logo-mark" onClick={() => router.push('/')} aria-label="Financieramente">
            <span className="fm-logo-f">F</span>
            <span className="fm-logo-m">m</span>
          </button>
          <div className="flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-2 backdrop-blur-xl">
            <Sparkles className="h-4 w-4 text-white/85" />
            <span className="text-xs tracking-[0.14em] text-white/85 uppercase">Premium Finance OS</span>
          </div>
        </header>

        <section className="relative mt-12 grid flex-1 items-center gap-8 md:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-6">
            <h1 className="text-5xl leading-[0.95] font-semibold tracking-[-0.04em] md:text-7xl">
              Claridad financiera
              <br />
              de nivel premium.
            </h1>
            <p className="max-w-xl text-sm leading-relaxed text-white/72 md:text-base">
              Minimal, preciso y privado. Tu centro de decisiones con IA para planificar mejor tu dinero.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => router.push('/agent')}
                className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/14 px-6 py-3 text-sm font-medium backdrop-blur-2xl transition hover:bg-white/24"
              >
                Entrar al agente <ArrowRight className="h-4 w-4" />
              </button>
              <button
                onClick={() => router.push('/intake')}
                className="rounded-full border border-white/20 bg-black/24 px-6 py-3 text-sm text-white/88 backdrop-blur-xl transition hover:bg-black/34"
              >
                Comenzar diagnóstico
              </button>
            </div>
          </div>

          <div className="relative ml-auto w-full max-w-md rounded-[28px] border border-white/20 bg-white/9 p-5 backdrop-blur-2xl">
            <div className="absolute -inset-px rounded-[28px] bg-white/8 blur-xl" aria-hidden />
            <div className="relative">
              <Image
                src="/robot/poses-v2.png"
                alt="Mascota Financieramente"
                width={620}
                height={620}
                priority
                className="h-auto w-full object-contain drop-shadow-[0_24px_48px_rgba(0,0,0,0.55)]"
              />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
