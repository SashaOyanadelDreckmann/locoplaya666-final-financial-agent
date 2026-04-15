'use client';

import { useState } from 'react';

type SummaryCardProps = {
  summary: string;
  onAccept: () => void | Promise<void>;
  onReject: (comment: string) => void | Promise<void>;
};

export function SummaryCard({ summary, onAccept, onReject }: SummaryCardProps) {
  const [comment, setComment] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);

  const handleAccept = async () => {
    setIsAccepting(true);
    try {
      await onAccept();
    } finally {
      setIsAccepting(false);
    }
  };

  const handleReject = async () => {
    const cleanComment = comment.trim();
    if (!cleanComment || isRejecting) return;

    setIsRejecting(true);
    try {
      await onReject(cleanComment);
      setComment('');
    } finally {
      setIsRejecting(false);
    }
  };

  return (
    <article className="summary-card">
      <div className="question-card-meta">
        <span className="question-card-kicker">Cierre de tramo</span>
        <span className="question-card-shortcut">Valida o corrige antes de seguir</span>
      </div>
      <h2>Resumen del bloque</h2>
      <div className="summary-content">
        {summary}
      </div>

      <div className="summary-card-actions">
        <button
          className="summary-action-btn summary-action-accept"
          type="button"
          onClick={handleAccept}
          disabled={isAccepting || isRejecting}
        >
          {isAccepting ? 'Procesando...' : '✓ Aceptar'}
        </button>
        <button
          className="summary-action-btn summary-action-reject"
          type="button"
          onClick={() => setIsRejecting(!isRejecting)}
          disabled={isAccepting}
        >
          {isRejecting ? '✕ Cancelar' : 'Corregir'}
        </button>
      </div>

      {isRejecting && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="¿Qué cambiarías del resumen?"
            className="question-card"
            style={{
              padding: '16px 20px',
              borderRadius: '14px',
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#ffffff',
              fontSize: '16px',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
              lineHeight: 1.6,
              resize: 'vertical',
              minHeight: '80px',
              transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
            }}
          />
          <button
            className="summary-action-btn summary-action-accept"
            type="button"
            onClick={handleReject}
            disabled={!comment.trim() || isRejecting}
          >
            {isRejecting ? 'Enviando corrección...' : 'Enviar corrección'}
          </button>
        </div>
      )}
    </article>
  );
}
