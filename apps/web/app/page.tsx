'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { TypewriterText } from '@/components/ui/TypewriterText';
import { HOME_ASCII_MASCOT } from './brand';

export default function HomePage() {
  useEffect(() => {
    document.documentElement.classList.add('home-lock');
    document.body.classList.add('home-lock');
    return () => {
      document.documentElement.classList.remove('home-lock');
      document.body.classList.remove('home-lock');
    };
  }, []);

  return (
    <main className="home-essence">
      <div className="home-essence__ambient" aria-hidden />
      <section className="home-essence__content">
        <div className="home-essence__brand-lockup">
          <span className="home-essence__logo-mark" aria-hidden>Fm</span>
          <h1 className="home-essence__title">
            <span className="home-essence__title-main">Financiera</span>
            <span className="home-essence__title-mente">mente</span>
          </h1>
        </div>

        <p className="home-essence__eyebrow">Proyecto de tesis · Sasha Oyanadel Dreckmann</p>

        <div className="home-essence__tags">
          <span>Agente en finanzas personales</span>
          <span>Ley Fintec</span>
          <span>Finanzas Abiertas</span>
        </div>

        <p className="home-essence__tagline">Claridad financiera, antes de decidir.</p>

        <p className="home-essence__body">
          Un agente conversacional para entender tu situación financiera con calma, contexto y sin juicios. No vende productos ni decide por ti.
        </p>

        <div className="home-essence__ctas">
          <Link href="/register" className="home-essence__cta home-essence__cta--gold">Iniciar conversación</Link>
          <Link href="/login" className="home-essence__cta home-essence__cta--ghost">Ya tengo cuenta</Link>
        </div>

        <p className="home-essence__foot">Privado · Seguro · Sin consejos automáticos</p>
      </section>

      <aside className="home-essence__art" aria-hidden>
        <div className="machine-text home-essence__machine">
          <TypewriterText text={HOME_ASCII_MASCOT} speed={2} colorizeSpecial />
        </div>
      </aside>
    </main>
  );
}
