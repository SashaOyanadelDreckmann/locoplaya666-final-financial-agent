'use client';

import { KeyboardEvent } from 'react';
import { EditorialSummary } from './presentation';
import { TxChatMessageBubble, TxChatStarterChips } from './tx-chat-ui';
import type { TxAssistantMessage, TxChatStarterChip } from './types';

export function TxMinimalSummaryChatStep(props: {
  summaryText: string | null;
  summaryGeneratedAt: string | null;
  summaryModel: string | null;
  summaryRegenerationsLeft: number;
  experienceNote?: string | null;
  isSummaryPending?: boolean;
  assistantMessages: TxAssistantMessage[];
  starterChips?: TxChatStarterChip[];
  highlightedMovementKeys: string[];
  txAssistantInput: string;
  txAssistantLoading: boolean;
  documentsLoading: boolean;
  onAssistantInputChange: (value: string) => void;
  onAssistantSend: () => void;
  onAskSuggestedQuestion?: (question: string) => void;
}) {
  const latestAssistantMessageId = [...props.assistantMessages].reverse().find((message) => message.role === 'assistant')?.id;
  const sendDisabled = props.txAssistantLoading || props.documentsLoading || !props.txAssistantInput.trim();
  const chatBusy = props.txAssistantLoading || props.documentsLoading;
  const showStarterShortcuts =
    props.starterChips &&
    props.starterChips.length > 0 &&
    (props.assistantMessages.length === 0 ||
      props.assistantMessages[props.assistantMessages.length - 1]?.role === 'user');

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
          {props.experienceNote ? (
            <p className="tx-minimal-summary-note" role="status">
              {props.experienceNote}
            </p>
          ) : null}
          <div className="tx-minimal-summary-meta">
            {props.summaryGeneratedAt ? <span>Actualizado {new Date(props.summaryGeneratedAt).toLocaleString('es-CL')}</span> : <span>En preparación</span>}
            {props.summaryModel ? <span>Modelo {props.summaryModel}</span> : null}
          </div>
        </div>
        {props.summaryText ? (
          <EditorialSummary text={props.summaryText} compact />
        ) : (
          <p className="tx-minimal-summary-empty" role="status" aria-live="polite">
            {props.isSummaryPending ? 'Estoy preparando el resumen con tus antecedentes…' : 'Estoy preparando el resumen.'}
          </p>
        )}
        <div className="tx-minimal-summary-foot">
          <span>Revisiones restantes: {props.summaryRegenerationsLeft}</span>
        </div>
      </div>

      <div className="tx-minimal-chat-card" role="region" aria-label="Chat del resumen">
        <div className="tx-minimal-chat-head">
          <span className="tx-minimal-chat-kicker">Chat del resumen</span>
          <p className="tx-minimal-chat-intro">
            Pregunta sobre movimientos, montos o el análisis. El paso 2 quedó solo para subir archivos.
          </p>
        </div>
        <div className="tx-minimal-chat-thread" aria-live="polite" aria-relevant="additions">
          {props.assistantMessages.length === 0 ? (
            <p className="tx-minimal-chat-empty">Haz tu primera pregunta sobre los movimientos o el análisis.</p>
          ) : (
            props.assistantMessages.map((message) => (
              <TxChatMessageBubble
                key={message.id}
                message={message}
                highlightedMovementKeys={props.highlightedMovementKeys}
                followupsDisabled={chatBusy}
                onFollowupSelect={props.onAskSuggestedQuestion}
                showFollowups={message.role !== 'assistant' || message.id === latestAssistantMessageId}
              />
            ))
          )}
        </div>

        {showStarterShortcuts ? (
          <div className="tx-chat-shortcuts">
            <span className="tx-chat-shortcuts-kicker">Atajos analíticos</span>
            <TxChatStarterChips
              chips={props.starterChips ?? []}
              disabled={chatBusy}
              onSelect={(question) => props.onAskSuggestedQuestion?.(question)}
            />
          </div>
        ) : null}

        <div className="tx-minimal-composer">
          <textarea
            className="tx-minimal-composer-input"
            value={props.txAssistantInput}
            onChange={(event) => props.onAssistantInputChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Pregunta sobre movimientos, categorías o el análisis"
            rows={2}
            aria-label="Mensaje del chat analítico"
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
