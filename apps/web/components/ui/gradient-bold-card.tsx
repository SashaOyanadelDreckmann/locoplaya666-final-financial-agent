"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  WELCOME_FINTECH_SIMULATION_BADGE,
  WELCOME_FINTECH_SIMULATION_CONTEXT,
  WELCOME_FINTECH_SIMULATION_DISCLAIMER,
  WELCOME_FINTECH_SIMULATION_LEAD,
  WELCOME_FINTECH_SLIDE_LABEL,
  WELCOME_RUTA_NEXT_HEADING,
  WELCOME_RUTA_UNLOCK_CHATS,
  WELCOME_RUTA_UNLOCK_INTRO,
} from "@financial-agent/shared";
import { cn } from "@/lib/compartido/utils";
import { getWelcomeMessage } from "@/lib/api";
import {
  ExecutiveBlobCarouselShell,
  useExecutiveBlobCarousel,
} from "@/components/ui/executive-blob-carousel";
import { CornerFrameScrambleText } from "@/components/ui/corner-frame-scramble-text";
import { WelcomeProductHintsStrip } from "@/components/ui/welcome-product-hints-strip";
import {
  buildFallbackWelcomeIntro,
  readHydratedWelcomeIntro,
  resolveWelcomeIntro,
  type WelcomeIntroPayload,
} from "@/app/agent/flujo/welcome-intro.shared";
import { buildIntakeScrambleLines } from "@/app/agent/flujo/welcome-intake-scramble.helpers";

const WELCOME_PAGES = [
  { id: "lectura", label: "Lectura", roman: "I", tone: "gold" as const }, // panel: transacciones
  { id: "marco", label: "Marco", roman: "II", tone: "slate" as const }, // panel: presupuesto
  { id: "fintech", label: "Simulación", roman: "III", tone: "terra" as const }, // panel: perfil
  { id: "ruta", label: "Ruta", roman: "IV", tone: "navy" as const }, // chats 2–3
];

const SCRAMBLE_DURATION = 0.32;
const SCRAMBLE_SPEED = 0.022;
const SCRAMBLE_GAP_MS = 48;

type GradientBlobCardProps = {
  className?: string;
  sessionUserName?: string | null;
  sessionInjectedIntake?: unknown;
};

function WelcomeIntakeScramble(props: {
  lines: string[];
  onComplete: () => void;
}) {
  const [lineIndex, setLineIndex] = useState(0);

  const handleLineComplete = useCallback(() => {
    window.setTimeout(() => {
      if (lineIndex >= props.lines.length - 1) {
        props.onComplete();
        return;
      }
      setLineIndex((prev) => prev + 1);
    }, SCRAMBLE_GAP_MS);
  }, [lineIndex, props]);

  const currentLine = props.lines[lineIndex] ?? props.lines[0] ?? "";

  return (
    <div
      className="welcome-intake-scramble"
      style={{ ["--foreground" as string]: "rgba(42, 34, 22, 0.82)" }}
      aria-live="polite"
      aria-busy="true"
    >
      <CornerFrameScrambleText
        key={`${lineIndex}-${currentLine}`}
        value={currentLine}
        as="p"
        className="welcome-intake-scramble__frame welcome-intake-scramble__frame-text"
        duration={SCRAMBLE_DURATION}
        speed={SCRAMBLE_SPEED}
        onScrambleComplete={handleLineComplete}
      />
    </div>
  );
}

function SlideDiagnosis(props: { intro: WelcomeIntroPayload; visible: boolean }) {
  const { intro, visible } = props;

  return (
    <div
      className={cn(
        "gradient-blob-card__diagnosis",
        visible && "is-visible"
      )}
      aria-hidden={!visible}
    >
      {intro.wittyHook?.trim() ? (
        <p className="gradient-blob-card__kicker">{intro.wittyHook.trim()}</p>
      ) : null}
      <p className="gradient-blob-card__headline">{intro.headline}</p>
      <p className="gradient-blob-card__dek-text">{intro.personalRead}</p>
      {intro.signals.length > 0 ? (
        <div className="gradient-blob-card__signal-strip">
          {intro.signals.slice(0, 3).map((signal) => (
            <span key={signal} className="gradient-blob-card__signal-pill">
              {signal}
            </span>
          ))}
        </div>
      ) : null}
      {intro.productHints && intro.productHints.length > 0 ? (
        <WelcomeProductHintsStrip hints={intro.productHints} />
      ) : null}
    </div>
  );
}

function SlideMarco({ intro, transition }: { intro: WelcomeIntroPayload; transition: string }) {
  return (
    <>
      <p className={`gradient-blob-card__slide-label${transition}`}>Marco de trabajo</p>
      <blockquote className={`gradient-blob-card__body-text gradient-blob-card__body-text--lead${transition}`}>
        {intro.sections.marco.body}
      </blockquote>
      <p className={`gradient-blob-card__dek-text${transition}`}>
        Evidencia real primero. Recomendaciones después.
      </p>
      <div className={`gradient-blob-card__mini-flow${transition}`} aria-hidden="true">
        <span>Dispersión</span>
        <span className="gradient-blob-card__mini-flow-arrow">→</span>
        <span className="is-core">Evidencia</span>
        <span className="gradient-blob-card__mini-flow-arrow">→</span>
        <span>Decisión</span>
      </div>
    </>
  );
}

function SlideFintech({ transition }: { intro: WelcomeIntroPayload; transition: string }) {
  return (
    <>
      <p className={`gradient-blob-card__slide-label${transition}`}>{WELCOME_FINTECH_SLIDE_LABEL}</p>
      <p className={`gradient-blob-card__simulation-badge${transition}`}>{WELCOME_FINTECH_SIMULATION_BADGE}</p>
      <blockquote className={`gradient-blob-card__body-text gradient-blob-card__body-text--lead${transition}`}>
        {WELCOME_FINTECH_SIMULATION_LEAD}
      </blockquote>
      <p className={`gradient-blob-card__dek-text${transition}`}>{WELCOME_FINTECH_SIMULATION_CONTEXT}</p>
      <p
        className={`gradient-blob-card__simulation-disclaimer${transition}`}
        role="note"
        aria-label="Aviso de simulación"
      >
        {WELCOME_FINTECH_SIMULATION_DISCLAIMER}
      </p>
    </>
  );
}

function SlideRuta(props: {
  intro: WelcomeIntroPayload;
  transition: string;
}) {
  const { intro, transition } = props;

  return (
    <>
      <p className={`gradient-blob-card__slide-label${transition}`}>Flujo del sistema</p>
      <blockquote className={`gradient-blob-card__body-text gradient-blob-card__body-text--compact${transition}`}>
        {intro.sections.metodo.map((step) => step.label).join(" → ")}
      </blockquote>
      <ol className={`gradient-blob-card__method-list${transition}`}>
        {intro.sections.metodo.map((step) => (
          <li key={step.step}>
            <span className="gradient-blob-card__method-num">{step.step}</span>
            <span>
              <strong>{step.label}</strong> — {step.detail}
            </span>
          </li>
        ))}
      </ol>

      <div className={`gradient-blob-card__next-chats${transition}`}>
        <p className="gradient-blob-card__next-chats-heading">{WELCOME_RUTA_NEXT_HEADING}</p>
        <p className={`gradient-blob-card__dek-text${transition}`}>{WELCOME_RUTA_UNLOCK_INTRO}</p>
        <ul className="gradient-blob-card__unlock-list" aria-label="Chats que se desbloquean">
          {WELCOME_RUTA_UNLOCK_CHATS.map((chat) => (
            <li
              key={chat.id}
              className={`gradient-blob-card__unlock-card gradient-blob-card__unlock-card--${chat.id}`}
            >
              <span className="gradient-blob-card__unlock-badge">{chat.badge}</span>
              <p className="gradient-blob-card__unlock-title">{chat.title}</p>
              <p className="gradient-blob-card__unlock-body">{chat.body}</p>
            </li>
          ))}
        </ul>
      </div>

      <p className={`gradient-blob-card__dek-text${transition}`}>{intro.sections.resultado.body}</p>
      <p className={`gradient-blob-card__dek-text gradient-blob-card__closing-question${transition}`}>
        {intro.closingQuestion}
      </p>
    </>
  );
}

export function GradientBlobCard({
  className,
  sessionUserName,
  sessionInjectedIntake,
}: GradientBlobCardProps) {
  const session = useMemo(
    () => ({
      name: sessionUserName,
      injectedIntake: sessionInjectedIntake,
    }),
    [sessionUserName, sessionInjectedIntake]
  );

  const scrambleLines = useMemo(() => buildIntakeScrambleLines(session), [session]);
  const hydratedIntro = useMemo(() => readHydratedWelcomeIntro(session), [session]);

  const [intro, setIntro] = useState<WelcomeIntroPayload>(
    () => hydratedIntro ?? buildFallbackWelcomeIntro(session),
  );
  const [introLoading, setIntroLoading] = useState(() => !hydratedIntro);
  const [scrambleDone, setScrambleDone] = useState(() => Boolean(hydratedIntro));
  const { active, transition, handleChange, handlePrev, handleNext } = useExecutiveBlobCarousel(
    WELCOME_PAGES,
  );

  useEffect(() => {
    if (!hydratedIntro) return;
    setIntro(hydratedIntro);
    setIntroLoading(false);
    setScrambleDone(true);
  }, [hydratedIntro]);

  useEffect(() => {
    if (hydratedIntro) return;

    let cancelled = false;
    setIntroLoading(true);

    getWelcomeMessage()
      .then((response) => {
        if (cancelled) return;
        setIntro(resolveWelcomeIntro(response, session));
        setScrambleDone(true);
      })
      .catch(() => {
        if (cancelled) return;
        setIntro(readHydratedWelcomeIntro(session) ?? buildFallbackWelcomeIntro(session));
        setScrambleDone(true);
      })
      .finally(() => {
        if (!cancelled) setIntroLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [session, hydratedIntro]);

  const showScramble = active === 0 && !scrambleDone;
  const showDiagnosis = active === 0 && scrambleDone;

  const renderSlideBody = () => {
    if (active === 0) {
      return (
        <div className="gradient-blob-card__lectura-stage">
          {showScramble ? (
            <WelcomeIntakeScramble
              lines={scrambleLines}
              onComplete={() => setScrambleDone(true)}
            />
          ) : null}
          {showDiagnosis ? (
            <>
              {introLoading ? (
                <div className="gradient-blob-card__intro-loading" aria-hidden="true">
                  <span className="gradient-blob-card__dek-line" />
                  <span className="gradient-blob-card__dek-line is-short" />
                </div>
              ) : null}
              <SlideDiagnosis intro={intro} visible={!introLoading} />
            </>
          ) : null}
        </div>
      );
    }

    if (active === 1) {
      return <SlideMarco intro={intro} transition={transition} />;
    }

    if (active === 2) {
      return <SlideFintech intro={intro} transition={transition} />;
    }

    return (
      <SlideRuta intro={intro} transition={transition} />
    );
  };

  const current = WELCOME_PAGES[active];

  return (
    <ExecutiveBlobCarouselShell
      className={className}
      pages={WELCOME_PAGES}
      active={active}
      transition={transition}
      navAriaLabel="Secciones del informe"
      masthead={
        <>
          <p className="gradient-blob-card__masthead-brand">Financieramente</p>
          <h2 className="gradient-blob-card__masthead-title">Informe inicial de diagnóstico</h2>
          <div className="gradient-blob-card__masthead-rule" aria-hidden="true" />
        </>
      }
      slideLabel={
        active !== 0 ? (
          <p className={`gradient-blob-card__slide-label${transition}`}>{current.label}</p>
        ) : (
          <p className="gradient-blob-card__slide-label">Tu lectura</p>
        )
      }
      onChange={(index) =>
        handleChange(index, {
          beforeChange: (nextIndex) => {
            if (nextIndex !== 0) setScrambleDone(true);
          },
        })
      }
      onPrev={handlePrev}
      onNext={handleNext}
    >
      {renderSlideBody()}
    </ExecutiveBlobCarouselShell>
  );
}

export default GradientBlobCard;
