"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { getWelcomeMessage } from "@/lib/api";
import { CornerFrameScrambleText } from "@/components/ui/corner-frame-scramble-text";
import {
  buildFallbackWelcomeIntro,
  readHydratedWelcomeIntro,
  resolveWelcomeIntro,
  type WelcomeIntroPayload,
} from "@/app/agent/welcome-intro.shared";
import { buildIntakeScrambleLines } from "@/app/agent/welcome-intake-scramble.helpers";

const WELCOME_PAGES = [
  { id: "lectura", label: "Lectura", roman: "I", tone: "gold" as const }, // panel: transacciones
  { id: "marco", label: "Marco", roman: "II", tone: "slate" as const }, // panel: presupuesto
  { id: "fintech", label: "Simulación", roman: "III", tone: "terra" as const }, // panel: perfil
  { id: "ruta", label: "Ruta", roman: "IV", tone: "navy" as const }, // chats 2–3
];

const SCRAMBLE_DURATION = 0.32;
const SCRAMBLE_SPEED = 0.022;
const SCRAMBLE_GAP_MS = 48;

type WelcomeSlideTone = (typeof WELCOME_PAGES)[number]["tone"];

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
  const [active, setActive] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [scrambleDone, setScrambleDone] = useState(() => Boolean(hydratedIntro));

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

  const handleChange = (index: number) => {
    if (index === active || isTransitioning || index < 0 || index >= WELCOME_PAGES.length) return;
    if (index !== 0) setScrambleDone(true);
    setIsTransitioning(true);
    window.setTimeout(() => {
      setActive(index);
      window.setTimeout(() => setIsTransitioning(false), 60);
    }, 280);
  };

  const handlePrev = () => {
    handleChange(active === 0 ? WELCOME_PAGES.length - 1 : active - 1);
  };

  const handleNext = () => {
    handleChange(active === WELCOME_PAGES.length - 1 ? 0 : active + 1);
  };

  const current = WELCOME_PAGES[active];
  const transition = isTransitioning ? " is-transitioning" : "";
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

  return (
    <div className={cn("gradient-blob-card", className)}>
      <div className="gradient-blob-card__frame">
        <div className="gradient-blob-card__blob gradient-blob-card__blob--a" aria-hidden="true" />
        <div className="gradient-blob-card__blob gradient-blob-card__blob--b" aria-hidden="true" />
        <div className="gradient-blob-card__glass">
          <div className="gradient-blob-card__editorial">
            <header className="gradient-blob-card__masthead">
              <div
                className={`gradient-blob-card__masthead-accent gradient-blob-card__masthead-accent--${current.tone}${transition}`}
                aria-hidden="true"
              />
              <p className="gradient-blob-card__masthead-brand">Financieramente</p>
              <h2 className="gradient-blob-card__masthead-title">Informe inicial de diagnóstico</h2>
              <div className="gradient-blob-card__masthead-rule" aria-hidden="true" />
            </header>

            <div className="gradient-blob-card__stage">
              <span className="gradient-blob-card__index" style={{ fontFeatureSettings: '"tnum"' }}>
                {String(active + 1).padStart(2, "0")}
              </span>

              <div className="gradient-blob-card__copy">
                {active !== 0 ? (
                  <p className={`gradient-blob-card__slide-label${transition}`}>{current.label}</p>
                ) : (
                  <p className="gradient-blob-card__slide-label">Tu lectura</p>
                )}
                <div className="gradient-blob-card__slide-body">
                  {renderSlideBody()}
                </div>
              </div>
            </div>

            <nav className="gradient-blob-card__nav" aria-label="Secciones del informe">
              <div className="gradient-blob-card__nav-top">
                <div className="gradient-blob-card__page-pills" role="tablist">
                  {WELCOME_PAGES.map((page, index) => (
                    <div
                      key={page.id}
                      role="tab"
                      tabIndex={0}
                      aria-selected={index === active}
                      aria-label={page.label}
                      className={`gradient-blob-card__page-pill gradient-blob-card__page-pill--${page.tone}${index === active ? " is-active" : ""}`}
                      onClick={() => handleChange(index)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleChange(index);
                        }
                      }}
                    >
                      <span className="gradient-blob-card__page-pill-roman">{page.roman}</span>
                      <span className="gradient-blob-card__page-pill-label">{page.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="gradient-blob-card__nav-bottom">
                <div className="gradient-blob-card__lines">
                  {WELCOME_PAGES.map((page, index) => (
                    <div
                      key={`line-${page.id}`}
                      role="tab"
                      tabIndex={0}
                      aria-label={page.label}
                      aria-selected={index === active}
                      className="gradient-blob-card__line-btn"
                      onClick={() => handleChange(index)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleChange(index);
                        }
                      }}
                    >
                      <span
                        className={`gradient-blob-card__line gradient-blob-card__line--${page.tone as WelcomeSlideTone}${index === active ? " is-active" : ""}`}
                      />
                    </div>
                  ))}
                </div>
                <span className="gradient-blob-card__counter">
                  {String(active + 1).padStart(2, "0")} / {String(WELCOME_PAGES.length).padStart(2, "0")}
                </span>
              </div>

              <div className="gradient-blob-card__nav-arrows" aria-label="Navegar secciones">
                <button
                  type="button"
                  className={`gradient-blob-card__arrow gradient-blob-card__arrow--${current.tone}`}
                  onClick={handlePrev}
                  aria-label="Sección anterior"
                >
                  <ChevronLeft className="gradient-blob-card__arrow-icon" strokeWidth={2} aria-hidden />
                </button>
                <button
                  type="button"
                  className={`gradient-blob-card__arrow gradient-blob-card__arrow--${current.tone}`}
                  onClick={handleNext}
                  aria-label="Sección siguiente"
                >
                  <ChevronRight className="gradient-blob-card__arrow-icon" strokeWidth={2} aria-hidden />
                </button>
              </div>
            </nav>
          </div>
        </div>
      </div>
    </div>
  );
}

export default GradientBlobCard;
