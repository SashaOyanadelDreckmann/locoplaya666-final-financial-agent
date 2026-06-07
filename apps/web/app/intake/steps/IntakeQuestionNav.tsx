'use client';

type IntakeQuestionNavProps = {
  questionIndex: number;
  totalQuestions: number;
  onBack?: () => void;
  onNext?: () => void;
  showBack?: boolean;
  showForward?: boolean;
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
          ←
        </button>
      ) : null}
      {showForward && onNext ? (
        <button
          className="intake-nav-arrow intake-qnav-next focus-ring"
          onClick={onNext}
          type="button"
          aria-label={forwardAriaLabel}
          disabled={loading}
        >
          {loading ? (
            <span className="intake-loading">
              <span className="intake-dot" />
              <span className="intake-dot" />
              <span className="intake-dot" />
            </span>
          ) : (
            '→'
          )}
        </button>
      ) : null}
    </div>
  );
}
