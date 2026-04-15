'use client';

import { useState } from 'react';

type QuestionCardProps = {
  question: string;
  onSubmit: (answer: string) => void | Promise<void>;
  blockId?: string;
};

export function QuestionCard({ question, onSubmit, blockId = 'question' }: QuestionCardProps) {
  const [answer, setAnswer] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaId = `question-${blockId}`;
  const helpId = `question-help-${blockId}`;

  const handleSubmit = async () => {
    const clean = answer.trim();
    if (!clean || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onSubmit(clean);
      setAnswer('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <article className="question-card">
      <div className="question-card-meta">
        <span className="question-card-kicker">Canal en vivo</span>
        <span className="question-card-shortcut">Ctrl + Enter para responder</span>
      </div>
      <label htmlFor={textareaId} className="sr-only">
        {question}
      </label>
      <h2>Pregunta activa</h2>
      <p id={helpId}>{question}</p>
      <textarea
        id={textareaId}
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        placeholder="Cuéntame..."
        disabled={isSubmitting}
        aria-describedby={helpId}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.ctrlKey) {
            handleSubmit();
          }
        }}
      />
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!answer.trim() || isSubmitting}
        aria-label={isSubmitting ? 'Enviando respuesta...' : 'Continuar con la siguiente pregunta'}
        className="focus-ring"
      >
        {isSubmitting ? 'Enviando...' : 'Continuar'}
      </button>
    </article>
  );
}
