'use client';

import Link from 'next/link';

const metrics = [
  { value: '10k+', label: 'simulaciones guiadas' },
  { value: '92%', label: 'usuarios con más claridad' },
  { value: '<3 min', label: 'tiempo para primer diagnóstico' },
];

const useCases = [
  'Ordenar deudas y flujo mensual',
  'Preparar una compra importante',
  'Evaluar escenarios antes de decidir',
];

export default function HomePage() {
  return (
    <main className="home-premium">
      <section className="home-hero2">
        <div className="hero-overlay" />
        <header className="hero-nav">
          <div className="hero-brand">FinancieraMente</div>
          <nav className="hero-links">
            <a href="#casos">Casos</a>
            <a href="#como">Cómo funciona</a>
            <a href="#pricing">Pricing</a>
          </nav>
          <Link href="/login" className="hero-login">Entrar</Link>
        </header>

        <div className="hero-grid">
          <div className="hero-copy">
            <p className="hero-kicker">Asesoría financiera personal con IA</p>
            <h1>Claridad para decidir sin ruido.</h1>
            <p className="hero-sub">Diagnóstico conversacional, simulaciones y plan accionable en una experiencia premium.</p>
            <div className="hero-actions">
              <Link href="/register" className="hero-cta-main">Comenzar ahora</Link>
              <a href="#como" className="hero-cta-ghost2">Ver recorrido</a>
            </div>
          </div>
          <div className="hero-card">
            <p className="hero-card-title">Vista rápida</p>
            <ul>
              <li>Mapa financiero en tiempo real</li>
              <li>Recomendaciones explicables</li>
              <li>Sin venta de productos</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="metrics" aria-label="Métricas clave">
        {metrics.map((m) => (
          <article key={m.label} className="metric">
            <strong>{m.value}</strong>
            <span>{m.label}</span>
          </article>
        ))}
      </section>

      <section id="casos" className="premium-section">
        <h2>Diseñado para momentos financieros reales</h2>
        <div className="pill-grid">
          {useCases.map((item) => <p key={item} className="pill">{item}</p>)}
        </div>
      </section>

      <section id="como" className="premium-section steps">
        <h2>Cómo funciona</h2>
        <div className="steps-grid">
          <article><span>01</span><p>Conversa y captura tu contexto.</p></article>
          <article><span>02</span><p>Modela escenarios comparables.</p></article>
          <article><span>03</span><p>Ejecuta un plan priorizado.</p></article>
        </div>
      </section>

      <section id="pricing" className="premium-section cta-bottom">
        <h2>Empieza hoy con una experiencia pro</h2>
        <Link href="/register" className="hero-cta-main">Crear cuenta</Link>
      </section>
    </main>
  );
}
