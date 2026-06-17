'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion, useTransform, useInView } from 'framer-motion';
import { useHomeScroll } from '@/lib/interfaz/home-scroll-context';
import SpotlightCard from '@/components/inicio/SpotlightCard';

const SILK: [number, number, number, number] = [0.22, 1, 0.36, 1];
const WINE_GLOW = 'rgba(176,52,72,0.2)';
const ASCII_TYPING_DURATION_MS = 10000;
const ASCII_SCALE_CAP = 1.85;

function Label({ text }: { text: string }) {
  return (
    <p className="home-thesis-spotlight__label">{text}</p>
  );
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  return reduced;
}

function ThesisAsciiPortrait() {
  const [ascii, setAscii] = useState('');
  const [visibleChars, setVisibleChars] = useState(0);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [scale, setScale] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLPreElement>(null);
  const isInView = useInView(containerRef, { once: true, amount: 0.15 });
  const reducedMotion = usePrefersReducedMotion();

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

  // Scale once from the full artwork — never tied to visible character count.
  useLayoutEffect(() => {
    const container = containerRef.current;
    const pre = measureRef.current;
    if (!container || !pre || !ascii) return;

    const fit = () => {
      pre.style.transform = 'none';
      const naturalWidth = pre.scrollWidth;
      const naturalHeight = pre.scrollHeight;
      if (!naturalWidth || !naturalHeight) return;

      const nextScale = Math.min(
        container.clientWidth / naturalWidth,
        container.clientHeight / naturalHeight,
        ASCII_SCALE_CAP,
      );
      setScale(nextScale);
      setStageSize({
        width: naturalWidth * nextScale,
        height: naturalHeight * nextScale,
      });
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(container);
    return () => observer.disconnect();
  }, [ascii]);

  useEffect(() => {
    if (!ascii || !isInView) {
      setVisibleChars(0);
      return;
    }
    if (reducedMotion) {
      setVisibleChars(ascii.length);
      return;
    }

    setVisibleChars(0);
    const startedAt = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / ASCII_TYPING_DURATION_MS);
      setVisibleChars(Math.min(ascii.length, Math.floor(progress * ascii.length)));
      if (progress < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setVisibleChars(ascii.length);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ascii, isInView, reducedMotion]);

  const visibleAscii = ascii.slice(0, visibleChars);
  const isTyping = ascii.length > 0 && visibleChars < ascii.length;

  return (
    <div ref={containerRef} className="home-thesis-spotlight__art" aria-hidden>
      {ascii ? (
        <div
          className="home-thesis-spotlight__ascii-stage"
          style={{
            width: stageSize.width > 0 ? stageSize.width : undefined,
            height: stageSize.height > 0 ? stageSize.height : undefined,
          }}
        >
          <pre
            ref={measureRef}
            className="home-thesis-spotlight__ascii"
            aria-hidden
            style={{ visibility: 'hidden', pointerEvents: 'none' }}
          >
            {ascii}
          </pre>
          <pre
            className="home-thesis-spotlight__ascii"
            style={{ transform: `scale(${scale})` }}
          >
            {visibleAscii}
            {isTyping ? (
              <span className="home-thesis-typewriter-cursor home-thesis-typewriter-cursor--ascii" />
            ) : null}
          </pre>
        </div>
      ) : (
        <div className="home-thesis-spotlight__art-placeholder" />
      )}
    </div>
  );
}

export default function ThesisAuthorSpotlight() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useHomeScroll({ target: ref, offset: ['start end', 'end start'] });
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
