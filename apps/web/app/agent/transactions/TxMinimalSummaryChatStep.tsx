'use client';

import { KeyboardEvent } from 'react';
import { EditorialSummary } from './presentation';
import { TxChatMessageBubble } from './tx-chat-ui';
import type { TxAssistantMessage } from './types';

export function TxMinimalSummaryChatStep(props: {
  summaryText: string | null;
  summaryGeneratedAt: string | null;
  summaryModel: string | null;
  summaryRegenerationsLeft: number;
  assistantMessages: TxAssistantMessage[];
  highlightedMovementKeys: string[];
  txAssistantInput: string;
  txAssistantLoading: boolean;
  documentsLoading: boolean;
  onAssistantInputChange: (value: string) => void;
  onAssistantSend: () => void;
}) {
  const latestAssistantMessageId = [...props.assistantMessages].reverse().find((message) => message.role === 'assistant')?.id;
  const sendDisabled = props.txAssistantLoading || props.documentsLoading || !props.txAssistantInput.trim();

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    if (!sendDisabled) props.onAssistantSend();
  };

  return (
    <section className="tx-minimal-summary-shell">
      <div className="tx-minimal-summary-card" role="region" aria-label="Resumen ejecutivo mínimo">
        <div className="tx-minimal-summary-head">
          <span className="tx-minimal-summary-kicker">Resumen ejecutivo</span>
          <div className="tx-minimal-summary-meta">
            {props.summaryGeneratedAt ? <span>Actualizado {new Date(props.summaryGeneratedAt).toLocaleString('es-CL')}</span> : <span>En preparación</span>}
            {props.summaryModel ? <span>Modelo {props.summaryModel}</span> : null}
          </div>
        </div>
        {props.summaryText ? (
          <EditorialSummary text={props.summaryText} compact />
        ) : (
          <p className="tx-minimal-summary-empty">Estoy preparando el resumen.</p>
        )}
        <div className="tx-minimal-summary-foot">
          <span>Revisiones restantes: {props.summaryRegenerationsLeft}</span>
        </div>
      </div>

      <div className="tx-minimal-chat-card" role="region" aria-label="Continuar conversación">
        <div className="tx-minimal-chat-thread" aria-live="polite" aria-relevant="additions">
          {props.assistantMessages.length === 0 ? (
            <p className="tx-minimal-chat-empty">Haz una pregunta para continuar el análisis.</p>
          ) : (
            props.assistantMessages.map((message) => (
              <TxChatMessageBubble
                key={message.id}
                message={message}
                highlightedMovementKeys={props.highlightedMovementKeys}
                showFollowups={false}
              />
            ))
          )}
        </div>

        <div className="tx-minimal-composer">
          <textarea
            className="tx-minimal-composer-input"
            value={props.txAssistantInput}
            onChange={(event) => props.onAssistantInputChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Pregunta algo sobre el resumen"
            rows={2}
            aria-label="Mensaje del chat de resumen"
          />
          <button
            type="button"
            className="tx-minimal-send-btn"
            onClick={() => props.onAssistantSend()}
            disabled={sendDisabled}
          >
            Enviar
          </button>
        </div>
      </div>
    </section>
  );
}
