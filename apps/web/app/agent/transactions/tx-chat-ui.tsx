'use client';

import type { TxAssistantMessage, TxChatStarterChip } from './types';

function buildRetrievalBadgeLabel(message: TxAssistantMessage): string | null {
  const meta = message.retrievalMeta;
  if (!meta) return null;
  if (meta.mode === 'overview') return 'Vista general del periodo';
  const signals = meta.signalsUsed.length > 0 ? ` · ${meta.signalsUsed.join(', ')}` : '';
  return meta.matchedCount > 0
    ? `Búsqueda focalizada · ${meta.matchedCount} movimiento${meta.matchedCount === 1 ? '' : 's'}${signals}`
    : `Búsqueda focalizada${signals}`;
}

export function TxChatStarterChips(props: {
  chips: TxChatStarterChip[];
  disabled?: boolean;
  onSelect: (question: string) => void;
}) {
  if (props.chips.length === 0) return null;
  return (
    <div className="suggested-replies tx-chat-suggestions" role="group" aria-label="Preguntas sugeridas">
      {props.chips.map((chip) => (
        <button
          key={chip.id}
          type="button"
          className="suggestion-chip"
          disabled={props.disabled}
          onClick={() => props.onSelect(chip.question)}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}

export function TxChatFollowupChips(props: {
  followups: string[];
  disabled?: boolean;
  onSelect: (question: string) => void;
}) {
  if (props.followups.length === 0) return null;
  return (
    <div className="suggested-replies tx-chat-followups" role="group" aria-label="Seguimientos sugeridos">
      {props.followups.map((followup) => (
        <button
          key={followup}
          type="button"
          className="suggestion-chip"
          disabled={props.disabled}
          onClick={() => props.onSelect(followup)}
        >
          {followup}
        </button>
      ))}
    </div>
  );
}

export function TxChatRetrievalBadge(props: { message: TxAssistantMessage }) {
  const meta = props.message.retrievalMeta;
  if (!meta || props.message.role !== 'assistant') return null;
  const label = buildRetrievalBadgeLabel(props.message);
  if (!label) return null;
  return (
    <div className="tx-chat-retrieval-badge" role="status">
      <span className={`tx-chat-retrieval-badge-pill is-${meta.mode}`}>
        {meta.mode === 'targeted' ? 'Focalizado' : 'General'}
      </span>
      <span className="tx-chat-retrieval-badge-copy">{label}</span>
    </div>
  );
}

export function TxChatMessageBubble(props: {
  message: TxAssistantMessage;
  highlightedMovementKeys?: string[];
}) {
  const highlighted =
    props.message.role === 'assistant' &&
    (props.message.referencedMovementKeys ?? []).some((key) => props.highlightedMovementKeys?.includes(key));

  return (
    <div
      className={`tx-chat-bubble ${props.message.role === 'user' ? 'is-user' : 'is-assistant'}${highlighted ? ' has-linked-movements' : ''}`}
    >
      <div className="tx-chat-bubble-role">{props.message.role === 'user' ? 'Tú' : 'Asistente'}</div>
      <div className="tx-chat-bubble-text">{props.message.text}</div>
      {props.message.attachments && props.message.attachments.length > 0 ? (
        <div className="tx-chat-bubble-attachments">
          {props.message.attachments.map((attachment) => (
            <span key={attachment} className="upload-file-pill" title={attachment}>
              {attachment}
            </span>
          ))}
        </div>
      ) : null}
      <TxChatRetrievalBadge message={props.message} />
    </div>
  );
}
