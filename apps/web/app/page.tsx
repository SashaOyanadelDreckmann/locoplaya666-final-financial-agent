'use client';

import Link from 'next/link';
import { TypewriterText } from '@/components/ui/TypewriterText';
import { HOME_ASCII_MASCOT } from './brand';

export default function HomePage() {
  return (
    <div className="home-shell">

      <div className="home-layout">
        {/* Left — content */}
        <section className="home-content">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/fm-logo-watermark.jpg" alt="Financiera Mente" className="home-brand-logo" />

          <h1 className="home-hero">
            Financiera<br /><span className="home-hero-accent">mente</span>
          </h1>

          <div className="home-eyebrow">Proyecto de tesis · Sasha Oyanadel Dreckmann</div>

          <div className="home-feature-tags">
            <span className="home-feature-tag home-feature-tag--blue">Agente en finanzas personales</span>
            <span className="home-feature-tag home-feature-tag--red">Ley Fintec</span>
            <span className="home-feature-tag home-feature-tag--gold">Finanzas Abiertas</span>
          </div>

          <p className="home-tagline">
            Claridad financiera,<br className="home-tagline-br" />
            antes de decidir.
          </p>

          <p className="home-body">
            Un agente conversacional diseñado para ayudarte a entender
            tu situación financiera con calma, contexto y sin juicios.
            No vende productos. No toma decisiones por ti.
          </p>

          <div className="home-ctas">
            <Link href="/register" className="home-cta-gold">
              Iniciar conversación
            </Link>
            <Link href="/login" className="home-cta-ghost">
              Ya tengo cuenta
            </Link>
          </div>

          <p className="home-footnote">
            Privado · Seguro · Sin consejos automáticos
          </p>
        </section>

        {/* Right — ASCII art */}
        <aside className="home-art" aria-hidden>
          <div className="machine-text">
            <TypewriterText text={HOME_ASCII_MASCOT} speed={2} />
          </div>
        </aside>
      </div>
    </div>
  );
}
