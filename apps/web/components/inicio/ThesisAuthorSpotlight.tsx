'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import SpotlightCard from '@/components/inicio/SpotlightCard';

const SILK: [number, number, number, number] = [0.22, 1, 0.36, 1];
const WINE_GLOW = 'rgba(176,52,72,0.2)';

function Label({ text }: { text: string }) {
  return (
    <p className="home-thesis-spotlight__label">{text}</p>
  );
}

function ThesisAsciiPortrait() {
  const [ascii, setAscii] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    let cancelled = false;
    void fetch('/art/sasha-thesis-ascii.txt')
      .then((res) => res.text())
      .then((text) => {
        if (!cancelled) setAscii(text);
      })
      .catch(() => {
        if (!cancelled) setAscii('');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    const pre = preRef.current;
    if (!container || !pre || !ascii) return;

    const fit = () => {
      pre.style.transform = 'none';
      const naturalWidth = pre.scrollWidth;
      const naturalHeight = pre.scrollHeight;
      if (!naturalWidth || !naturalHeight) return;
      const availableWidth = container.clientWidth;
      const availableHeight = container.clientHeight;
      const next = Math.min(availableWidth / naturalWidth, availableHeight / naturalHeight, 1.35);
      setScale(next);
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(container);
    return () => observer.disconnect();
  }, [ascii]);

  return (
    <div ref={containerRef} className="home-thesis-spotlight__art" aria-hidden>
      {ascii ? (
        <pre
          ref={preRef}
          className="home-thesis-spotlight__ascii"
          style={{ transform: `scale(${scale})` }}
        >
          {ascii}
        </pre>
      ) : (
        <div className="home-thesis-spotlight__art-placeholder" />
      )}
    </div>
  );
}

export default function ThesisAuthorSpotlight() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const headY = useTransform(scrollYProgress, [0, 0.4, 1], [24, 0, -16]);
  const headO = useTransform(scrollYProgress, [0, 0.2, 0.8, 1], [0, 1, 1, 0.45]);

  return (
    <section
      ref={ref}
      className="home-content-section home-thesis-spotlight"
      style={{
        background: 'transparent',
        padding: 'clamp(44px,10vw,130px) clamp(24px,8vw,120px)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: 'radial-gradient(ellipse 60% 80% at 10% 60%, rgba(20,50,100,0.10) 0%, transparent 65%)',
        }}
      />

      <div className="home-thesis-spotlight__grid">
        <motion.div
          initial={{ opacity: 0, x: -18 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, amount: 0.25 }}
          transition={{ duration: 0.7, ease: SILK }}
          style={{ minWidth: 0 }}
        >
          <ThesisAsciiPortrait />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 18 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, amount: 0.25 }}
          transition={{ duration: 0.7, ease: SILK, delay: 0.08 }}
          style={{ y: headY, opacity: headO, minWidth: 0 }}
        >
          <SpotlightCard glow={WINE_GLOW} className="home-thesis-spotlight__card p-6 md:p-8 lg:p-9">
            <div className="home-thesis-spotlight__copy">
              <Label text="Proyecto de tesis" />

              <h2 className="home-thesis-spotlight__name">Sasha Oyanadel Dreckmann</h2>

              <p className="home-thesis-spotlight__degree">
                Tesis para optar al título de Ingeniero Civil Industrial y al grado de Magíster en Ciencia de los Datos
              </p>

              <div className="home-thesis-spotlight__body">
                <p>
                  Este proyecto de tesis ha sido fundamental para mí: me ha permitido aplicar de forma integrada
                  mis conocimientos en ciencia de datos, inteligencia artificial y finanzas en una solución concreta
                  orientada al contexto chileno.
                </p>
                <p>
                  En un sistema financiero complejo y altamente fragmentado, millones de personas no acceden a
                  información financiera de calidad. Muchas no participan del mercado como usuarios informados,
                  sino que enfrentan asimetrías de información, situaciones críticas de endeudamiento o un
                  desconocimiento de las alternativas disponibles según su perfil y objetivos.
                </p>
                <p>
                  Ordenar las finanzas personales y tomar conciencia de la situación financiera actual es el
                  primer paso hacia decisiones más informadas y es precisamente el problema que este trabajo
                  busca abordar.
                </p>
              </div>
            </div>
          </SpotlightCard>
        </motion.div>
      </div>
    </section>
  );
}
