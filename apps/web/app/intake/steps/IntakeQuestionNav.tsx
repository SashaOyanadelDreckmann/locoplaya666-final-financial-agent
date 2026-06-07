'use client';
import { ChevronLeft, ChevronRight } from 'lucide-react';

type IntakeQuestionNavProps = {
  questionIndex: number;
  totalQuestions: number;
  onBack?: () => void;
  onNext?: () => void;
  showBack?: boolean;
  showForward?: boolean;
  forwardDisabled?: boolean;
  forwardAriaLabel?: string;
  loading?: boolean;
};

export function IntakeQuestionNav({
  questionIndex,
  totalQuestions,
  onBack,
  onNext,
  showBack = questionIndex > 0,
  showForward = false,
  forwardDisabled = false,
  forwardAriaLabel = 'Continuar',
  loading = false,
}: IntakeQuestionNavProps) {
  return (
    <div className="intake-qnav">
      <p className="intake-question-progress">
        Pregunta {questionIndex + 1} de {totalQuestions}
      </p>
      {showBack && onBack ? (
        <button
          className="intake-nav-arrow intake-qnav-back focus-ring"
          onClick={onBack}
          type="button"
          aria-label="Anterior"
        >
          <ChevronLeft size={38} strokeWidth={3.8} aria-hidden />
        </button>
      ) : null}
      {showForward && onNext ? (
        <button
          className="intake-nav-arrow intake-qnav-next focus-ring"
          onClick={onNext}
          type="button"
          aria-label={forwardAriaLabel}
          disabled={loading || forwardDisabled}
        >
          {loading ? (
            <span className="intake-loading">
              <span className="intake-dot" />
              <span className="intake-dot" />
              <span className="intake-dot" />
            </span>
          ) : (
            <ChevronRight size={38} strokeWidth={3.8} aria-hidden />
          )}
        </button>
      ) : null}
    </div>
  );
}
