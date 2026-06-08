'use client';

import type { MouseEvent } from 'react';
import type { TxAssistantMessage, TxChatStarterChip } from './types';

function ChatSparkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3 4.5h10M3 8h7M3 11.5h5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M11.5 10.5 13 12l2.5-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function sourceLabel(source: TxAssistantMessage['source']): string | null {
  switch (source) {
    case 'client-deterministic':
    case 'deterministic':
      return 'Cifra verificada';
    case 'deterministic+writer':
      return 'Análisis verificado';
    case 'llm':
      return 'Interpretación IA';
    default:
      return null;
  }
}

function buildRetrievalBadgeLabel(message: TxAssistantMessage): string | null {
  const meta = message.retrievalMeta;
  if (!meta) return null;
  if (meta.mode === 'overview') return 'Vista general del periodo';
  const signals = meta.signalsUsed.length > 0 ? ` · ${meta.signalsUsed.join(', ')}` : '';
  return meta.matchedCount > 0
    ? `Búsqueda focalizada · ${meta.matchedCount} movimiento${meta.matchedCount === 1 ? '' : 's'}${signals}`
    : `Búsqueda focalizada${signals}`;
}

export function TxAskChatButton(props: {
  label?: string;
  compact?: boolean;
  disabled?: boolean;
  onAsk: () => void;
}) {
  const ariaLabel = props.label ?? 'Preguntar al chat';
  return (
    <button
      type="button"
      className={`tx-ask-chat-btn${props.compact ? ' is-compact' : ''}`}
      onClick={(event: MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        props.onAsk();
      }}
      disabled={props.disabled}
      aria-label={ariaLabel}
      title={ariaLabel}
    >
      <ChatSparkIcon />
      {!props.compact ? <span>Preguntar</span> : null}
    </button>
  );
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
    <div className="suggested-replies tx-chat-followups is-inline" role="group" aria-label="Seguimientos sugeridos">
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

export function TxChatSourceBadge(props: { message: TxAssistantMessage }) {
  if (props.message.role !== 'assistant') return null;
  const label = sourceLabel(props.message.source);
  if (!label) return null;
  const verified = props.message.source !== 'llm';
  return (
    <span className={`tx-chat-source-badge${verified ? ' is-verified' : ' is-llm'}`}>{label}</span>
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
  onFollowupSelect?: (question: string) => void;
  followupsDisabled?: boolean;
}) {
  const highlighted =
    props.message.role === 'assistant' &&
    (props.message.referencedMovementKeys ?? []).some((key) => props.highlightedMovementKeys?.includes(key));
  const followups =
    props.message.role === 'assistant' ? (props.message.suggestedFollowups ?? []).slice(0, 3) : [];

  return (
    <div className="tx-chat-message-stack">
      <div
        className={`tx-chat-bubble ${props.message.role === 'user' ? 'is-user' : 'is-assistant'}${highlighted ? ' has-linked-movements' : ''}`}
      >
        <div className="tx-chat-bubble-head">
          <div className="tx-chat-bubble-role">{props.message.role === 'user' ? 'Tú' : 'Asistente'}</div>
          <TxChatSourceBadge message={props.message} />
        </div>
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
      {followups.length > 0 && props.onFollowupSelect ? (
        <TxChatFollowupChips
          followups={followups}
          disabled={props.followupsDisabled}
          onSelect={props.onFollowupSelect}
        />
      ) : null}
    </div>
  );
}
