'use client';

import React, { useState, useEffect, useRef } from 'react';
import { AgentModalCloseButton } from '../comunes/AgentModalCloseButton';
import {
  writeSocialReflectionSession,
  persistSocialReflectionSession,
  type SocialReflectionAnswer,
} from '@/lib/agente/nucleo/social-consciousness-reflections';

type PhilosophicalQuestion = {
  id: string;
  question: string;
  thinker: string;
  choices: Array<{ id: string; label: string; subtext?: string }>;
};

const EXISTENTIAL_QUESTIONS: PhilosophicalQuestion[] = [
  {
    id: 'q-identity',
    question: 'Si alguien leyera tu historial de gastos sin conocerte, ¿qué diría que valoras más?',
    thinker: 'Inspirado en Bauman · Modernidad líquida',
    choices: [
      { id: 'comfort', label: 'Seguridad y comodidad', subtext: 'Lo esencial primero' },
      { id: 'experience', label: 'Experiencias y libertad', subtext: 'Vivir el presente' },
      { id: 'status', label: 'Reconocimiento social', subtext: 'Lo que otros ven' },
      { id: 'future', label: 'Un futuro diferente', subtext: 'Invertir en lo que no existe aún' },
    ],
  },
  {
    id: 'q-freedom',
    question: '¿En qué punto el ahorro deja de ser prudencia y se convierte en miedo?',
    thinker: 'Inspirado en Fromm · El miedo a la libertad',
    choices: [
      { id: 'never', label: 'Nunca. Más ahorro, más libertad', subtext: 'El capital es poder' },
      { id: 'anxiety', label: 'Cuando el número importa más que vivir', subtext: 'El dinero se vuelve fin en sí mismo' },
      { id: 'system', label: 'Cuando reproduces el sistema que criticas', subtext: 'Ahorrando en las mismas instituciones' },
      { id: 'unsure', label: 'No lo he pensado así antes', subtext: 'Esta pregunta me incomoda' },
    ],
  },
  {
    id: 'q-complicity',
    question: '¿Tus inversiones o ahorros financian algo que contradice tus valores?',
    thinker: 'Inspirado en Rawls · Teoría de la justicia',
    choices: [
      { id: 'yes-know', label: 'Sí, y lo acepto como parte del sistema', subtext: 'Pragmatismo consciente' },
      { id: 'yes-change', label: 'Sí, y quiero cambiarlo', subtext: 'Finanzas como acto político' },
      { id: 'no-thought', label: 'Nunca lo había pensado', subtext: 'La invisibilidad del capital' },
      { id: 'no-align', label: 'He buscado que estén alineados', subtext: 'Inversión con propósito' },
    ],
  },
  {
    id: 'q-time',
    question: '¿Qué estás comprando realmente cuando pagas por algo?',
    thinker: 'Inspirado en Benjamin · Las arcadas de París',
    choices: [
      { id: 'time', label: 'Tiempo: el único recurso finito', subtext: 'Todo se reduce a horas de vida' },
      { id: 'identity', label: 'Identidad: quien quiero parecer', subtext: 'El consumo como narración personal' },
      { id: 'relief', label: 'Alivio: escape temporal del malestar', subtext: 'La economía del bienestar inmediato' },
      { id: 'belonging', label: 'Pertenencia: a un grupo o ideal', subtext: 'La tribu que el dinero construye' },
    ],
  },
];

const PHILOSOPHER_QUOTES = [
  { quote: 'El precio es lo que pagas. El valor es lo que recibes.', author: 'Warren Buffett' },
  { quote: 'El dinero no es otra cosa que la sangre de los pobres.', author: 'Víctor Hugo' },
  { quote: 'No es el hombre más rico el que tiene más, sino el que necesita menos.', author: 'Sócrates' },
  { quote: 'La riqueza es como el agua del mar: cuanto más bebes, más sed tienes.', author: 'Schopenhauer' },
  { quote: 'El crédito es la confianza depositada en el futuro de alguien.', author: 'David Graeber' },
  { quote: 'Somos lo que hacemos repetidamente. La excelencia no es un acto, sino un hábito.', author: 'Aristóteles' },
];

type SocialConsciousnessModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSendToChat: (message: string) => void;
  sessionUserName?: string | null;
  sessionUserId?: string | null;
  onReflectionsPersisted?: () => void;
};

export function SocialConsciousnessModal({
  isOpen,
  onClose,
  onSendToChat,
  sessionUserName,
  sessionUserId,
  onReflectionsPersisted,
}: SocialConsciousnessModalProps) {
  const [currentStep, setCurrentStep] = useState<'intro' | 'questions' | 'reflection'>('intro');
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [quoteIdx, setQuoteIdx] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const currentQuestion = EXISTENTIAL_QUESTIONS[currentQuestionIdx];
  const firstName = String(sessionUserName ?? '').split(' ')[0]?.trim() || null;

  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      setQuoteIdx((prev) => (prev + 1) % PHILOSOPHER_QUOTES.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const getFocusable = () => {
      const root = modalRef.current;
      if (!root) return [] as HTMLElement[];
      return Array.from(
        root.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((n) => !n.hasAttribute('aria-hidden'));
    };

    const rafId = requestAnimationFrame(() => modalRef.current?.focus());

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab') return;
      const els = getFocusable();
      if (els.length === 0) { e.preventDefault(); return; }
      const first = els[0];
      const last = els[els.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('keydown', onKeyDown);
      restoreFocusRef.current?.focus();
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) {
      setCurrentStep('intro');
      setCurrentQuestionIdx(0);
      setSelectedAnswers({});
      setSelectedChoice(null);
    }
  }, [isOpen]);

  function selectChoice(choiceId: string) {
    setSelectedChoice(choiceId);
  }

  function persistReflections(answers: Record<string, string>) {
    const payload: SocialReflectionAnswer[] = EXISTENTIAL_QUESTIONS.flatMap((question) => {
      const answerId = answers[question.id];
      const choice = question.choices.find((item) => item.id === answerId);
      if (!choice) return [];
      return [
        {
          questionId: question.id,
          question: question.question,
          choiceId: choice.id,
          choiceLabel: choice.label,
          choiceSubtext: choice.subtext,
          thinker: question.thinker,
        },
      ];
    });
    if (payload.length === 0) return;
    void persistSocialReflectionSession(sessionUserId, {
      answers: payload,
      completedAt: new Date().toISOString(),
    }).then(() => {
      onReflectionsPersisted?.();
    });
  }

  function advanceQuestion() {
    if (!selectedChoice || !currentQuestion) return;

    const newAnswers = { ...selectedAnswers, [currentQuestion.id]: selectedChoice };
    setSelectedAnswers(newAnswers);
    setIsAnimating(true);

    setTimeout(() => {
      if (currentQuestionIdx < EXISTENTIAL_QUESTIONS.length - 1) {
        setCurrentQuestionIdx((prev) => prev + 1);
        setSelectedChoice(null);
      } else {
        persistReflections(newAnswers);
        setCurrentStep('reflection');
      }
      setIsAnimating(false);
    }, 300);
  }

  function buildReflectionMessage(): string {
    const lines: string[] = [];
    lines.push('He reflexionado sobre estas preguntas de conciencia social:');
    lines.push('');
    EXISTENTIAL_QUESTIONS.forEach((q) => {
      const answerId = selectedAnswers[q.id];
      const choice = q.choices.find((c) => c.id === answerId);
      if (choice) {
        lines.push(`**${q.question}**`);
        lines.push(`→ "${choice.label}" — ${choice.subtext ?? ''}`);
        lines.push('');
      }
    });
    lines.push('¿Qué revela esto sobre mi relación con el dinero y la sociedad?');
    return lines.join('\n');
  }

  function handleSendReflection() {
    onSendToChat(buildReflectionMessage());
    onClose();
  }

  if (!isOpen) return null;

  const quote = PHILOSOPHER_QUOTES[quoteIdx];

  return (
    <div className="social-modal-overlay" onClick={onClose}>
      <div
        ref={modalRef}
        className="social-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Conciencia social — reflexión filosófica"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Ambient background */}
        <div className="social-modal-ambient" aria-hidden="true">
          <div className="social-ambient-orb social-orb-1" />
          <div className="social-ambient-orb social-orb-2" />
          <div className="social-ambient-orb social-orb-3" />
        </div>

        {/* Header */}
        <header className="social-modal-header">
          <div className="social-header-left">
            <span className="social-phi-symbol" aria-hidden="true">φ</span>
            <div>
              <p className="social-header-eyebrow">Conciencia social</p>
              <h2 className="social-header-title">Filosofía del dinero</h2>
            </div>
          </div>
          <AgentModalCloseButton onClick={onClose} />
        </header>

        {/* Rotating quote */}
        <div className="social-quote-strip" key={quoteIdx}>
          <span className="social-quote-mark" aria-hidden="true">&quot;</span>
          <p className="social-quote-text">{quote?.quote}</p>
          <span className="social-quote-author">— {quote?.author}</span>
        </div>

        {/* Step: Intro */}
        {currentStep === 'intro' && (
          <div className="social-step social-step-intro">
            <div className="social-intro-icon" aria-hidden="true">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <circle cx="24" cy="24" r="23" stroke="currentColor" strokeWidth="1" opacity="0.3" />
                <circle cx="24" cy="24" r="15" stroke="currentColor" strokeWidth="1" opacity="0.5" />
                <text x="24" y="29" textAnchor="middle" fontSize="18" fill="currentColor" fontFamily="serif">φ</text>
              </svg>
            </div>
            <h3 className="social-intro-title">
              {firstName ? `${firstName}, el dinero tiene filosofía.` : 'El dinero tiene filosofía.'}
            </h3>
            <p className="social-intro-desc">
              Antes de hablar de tasas, presupuestos o inversiones, este espacio invita a algo más profundo:
              explorar qué dicen tus decisiones financieras sobre tus valores, tu libertad y tu lugar en la sociedad.
            </p>
            <p className="social-intro-desc social-intro-desc-2">
              4 preguntas. Sin respuestas correctas. Solo reflexión honesta.
            </p>
            <button
              type="button"
              className="social-cta-btn"
              onClick={() => setCurrentStep('questions')}
            >
              Comenzar la reflexión
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button type="button" className="social-skip-btn" onClick={onClose}>
              Ir directo al chat filosófico
            </button>
          </div>
        )}

        {/* Step: Questions */}
        {currentStep === 'questions' && currentQuestion && (
          <div className={`social-step social-step-question${isAnimating ? ' is-exiting' : ''}`}>
            {/* Progress */}
            <div className="social-progress-bar" aria-label={`Pregunta ${currentQuestionIdx + 1} de ${EXISTENTIAL_QUESTIONS.length}`}>
              {EXISTENTIAL_QUESTIONS.map((_, i) => (
                <div
                  key={i}
                  className={`social-progress-dot${i <= currentQuestionIdx ? ' is-done' : ''}`}
                  aria-hidden="true"
                />
              ))}
            </div>

            <p className="social-q-thinker">{currentQuestion.thinker}</p>
            <h3 className="social-q-text">{currentQuestion.question}</h3>

            <div className="social-choices-grid">
              {currentQuestion.choices.map((choice) => (
                <button
                  key={choice.id}
                  type="button"
                  className={`social-choice-btn${selectedChoice === choice.id ? ' is-selected' : ''}`}
                  onClick={() => selectChoice(choice.id)}
                  aria-pressed={selectedChoice === choice.id}
                >
                  <span className="social-choice-label">{choice.label}</span>
                  {choice.subtext && (
                    <span className="social-choice-subtext">{choice.subtext}</span>
                  )}
                  {selectedChoice === choice.id && (
                    <span className="social-choice-check" aria-hidden="true">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  )}
                </button>
              ))}
            </div>

            <button
              type="button"
              className="social-next-btn"
              onClick={advanceQuestion}
              disabled={!selectedChoice}
            >
              {currentQuestionIdx < EXISTENTIAL_QUESTIONS.length - 1 ? 'Siguiente pregunta' : 'Ver mi reflexión'}
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        )}

        {/* Step: Reflection */}
        {currentStep === 'reflection' && (
          <div className="social-step social-step-reflection">
            <div className="social-reflection-icon" aria-hidden="true">
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                <path d="M20 4C11.163 4 4 11.163 4 20s7.163 16 16 16 16-7.163 16-16S28.837 4 20 4z" stroke="currentColor" strokeWidth="1" opacity="0.4" />
                <path d="M20 12v8l5 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h3 className="social-reflection-title">Tu mapa filosófico</h3>
            <p className="social-reflection-desc">
              Estas respuestas revelan tensiones genuinas. No hay contradicciones que resolver, solo realidades que comprender.
            </p>
            <div className="social-answers-list">
              {EXISTENTIAL_QUESTIONS.map((q) => {
                const answerId = selectedAnswers[q.id];
                const choice = q.choices.find((c) => c.id === answerId);
                if (!choice) return null;
                return (
                  <div key={q.id} className="social-answer-item">
                    <p className="social-answer-q">{q.question}</p>
                    <p className="social-answer-a">
                      <span className="social-answer-arrow" aria-hidden="true">→</span>
                      <strong>{choice.label}</strong>
                      {choice.subtext && <span className="social-answer-sub"> · {choice.subtext}</span>}
                    </p>
                  </div>
                );
              })}
            </div>
            <div className="social-reflection-actions">
              <button
                type="button"
                className="social-cta-btn"
                onClick={handleSendReflection}
              >
                Enviar al chat filosófico
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button
                type="button"
                className="social-ghost-btn"
                onClick={() => {
                  setCurrentStep('questions');
                  setCurrentQuestionIdx(0);
                  setSelectedAnswers({});
                  setSelectedChoice(null);
                }}
              >
                Volver a empezar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
