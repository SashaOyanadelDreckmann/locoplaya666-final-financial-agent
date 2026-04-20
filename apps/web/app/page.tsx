'use client';

import Link from 'next/link';
import { TypewriterText } from '@/components/ui/TypewriterText';

const MACHINE_TEXT = `
────────────────────▄▄▄▄
────────────────▄▄█▀▀──▀▀█▄
─────────────▄█▀▀─────────▀▀█▄
────────────▄█▀──▄▄▄▄▄▄──────▀█
────────────█───█▌────▀▀█▄─────█
────────────█──▄█────────▀▀▀█──█
────────────█──█──▀▀▀──▀▀▀▄─▐──█
────────────█──▌────────────▐──█
────────────█──▌─▄▀▀▄───────▐──█
───────────█▀▌█──▄▄▄───▄▀▀▄─▐──█
───────────▌─▀───█▄█▌─▄▄▄────█─█
───────────▌──────▀▀──█▄█▌────█
───────────█───────────▀▀─────▐
────────────█──────▌──────────█
────────────██────█──────────█
─────────────█──▄──█▄█─▄────█
─────────────█──▌─▄▄▄▄▄─────█
─────────────█─────▄▄──▄▀─█
─────────────█▄──────────█
─────────────█▀█▄▄──▄▄▄▄▄█▄▄▄▄▄
───────────▄██▄──▀▀▀█─────────█
──────────██▄─█▄────█─────────█
───▄▄▄▄███──█▄─█▄───█─────────██▄▄▄
▄█▀▀────█────█──█▄──█▓▓▓▓▓▓▓▓▓█───▀▀▄
█──────█─────█───████▓▓▓▓▓▓▓▓▓█────▀█
█──────█─────█───█████▓▓▓▓▓▓▓█──────█
█─────█──────█───███▀▀▀▀█▓▓▓█───────█
█────█───────█───█───▄▄▄▄████───────█
█────█───────█──▄▀───────────█──▄───█
█────█───────█─▄▀─────█████▀▀▀─▄█───█
█────█───────█▄▀────────█─█────█────█
█────█───────█▀───────███─█────█────█
█─────█────▄█▀──────────█─█────█────█
█─────█──▄██▀────────▄▀██─█▄───█────█
█────▄███▀─█───────▄█─▄█───█▄──█────█
█─▄██▀──█──█─────▄███─█─────█──█────█
██▀────▄█───█▄▄▄█████─▀▀▀▀█▀▀──█────█
█──────█────▄▀──█████─────█────▀█───█
`;

export default function HomePage() {
  return (
    <div className="home-shell">

      <div className="home-layout">
        {/* Left — content */}
        <section className="home-content">
          <div className="home-eyebrow">Proyecto de tesis · Finanzas abiertas</div>

          <h1 className="home-hero">
            Financiera<br />Mente
          </h1>

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
            <Link href="/register" className="home-cta-primary">
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
            <TypewriterText text={MACHINE_TEXT} speed={2} />
          </div>
        </aside>
      </div>
    </div>
  );
}
