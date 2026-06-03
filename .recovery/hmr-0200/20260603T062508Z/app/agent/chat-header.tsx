import React, { useEffect, useState } from 'react';
import { formatRemainingInteractions, getChatDisplayTitle, getMaxChatInteractions } from './page.utils';

type ChatThread = {
  id: string;
  label: string;
  name: string;
  status: 'active' | 'context';
  contextScore: number;
  userMessageCount: number;
};

type ChatSpecialization = {
  title: string;
  accentClass: string;
  subtitle: string;
};

type Milestone = { id: string; label: string; done: boolean };

export function ChatHeader(props: {
  chatThreads: ChatThread[];
  activeChatId: string;
  setActiveChatId: (id: string) => void;
  getThreadSpecialization: (id: string) => ChatSpecialization;
  isThreadLocked: (id: string) => boolean;
  setPanelCallout: React.Dispatch<React.SetStateAction<{ section: string; message: string } | null>>;
  setKnowledgePopupOpen: React.Dispatch<React.SetStateAction<boolean>>;
  knowledgeScore: number;
  activeThread?: ChatThread;
  isActiveChatLocked: boolean;
  activeTurnCount: number;
  diagnosisUnlocked?: boolean;
  knowledgePopupOpen: boolean;
  knowledgeStage: string;
  completedMilestones: number;
  milestones: Milestone[];
  coachHint: string;
  isMonochrome: boolean;
  toggleMonochrome: () => void;
  isMobileViewport: boolean;
}) {
  const [menteBold, setMenteBold] = useState(() => Math.random() > 0.5);

  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

    if (prefersReducedMotion) return;

    const interval = window.setInterval(() => {
      setMenteBold(Math.random() > 0.5);
    }, 2200);

    return () => window.clearInterval(interval);
  }, []);

  const activeLabel = props.activeThread?.label;
  const activeHandSubtitle =
    activeLabel === '2'
      ? 'plan de accion'
      : activeLabel === '3'
      ? 'conciencia social'
      : activeLabel === '★'
      ? 'sintesis maestra'
      : 'lectura base';

  return (
    <header className={`agent-chat-header${props.isMobileViewport ? ' is-mobile' : ''}`}>
      <div className="agent-chat-controls-row">
        <div className="chat-switcher" aria-label="Selector de chats">
          {props.chatThreads.map((thread) => {
            const specialization = props.getThreadSpecialization(thread.id);
            const locked = props.isThreadLocked(thread.id);
            const remainingLabel = formatRemainingInteractions(thread.userMessageCount ?? 0, thread.id);
            return (
              <button
                key={thread.id}
                type="button"
                className={`chat-sheet-tab ${specialization.accentClass}${thread.id === props.activeChatId ? ' is-active' : ''}${thread.status === 'context' ? ' is-context' : ''}${locked ? ' is-locked' : ''}`}
                onClick={() => {
                  if (locked) {
                    props.setActiveChatId('chat-1');
                    props.setPanelCallout({
                      section: 'budget',
                      message: 'Completa presupuesto, cartolas y entrevista para desbloquear este chat.',
                    });
                    return;
                  }
                  props.setActiveChatId(thread.id);
                }}
                title={locked ? 'Bloqueado hasta completar el diagnóstico' : thread.status === 'context' ? `Contexto: ${thread.name}` : `Chat ${thread.label}: ${thread.name}`}
              >
                <span className="chat-sheet-tab-index">{thread.label}</span>
                <span className="chat-sheet-tab-copy">
                  <span className="chat-sheet-tab-title">
                    {locked ? 'Bloqueado' : thread.status === 'context' ? 'Síntesis' : specialization.title}
                  </span>
                  <span className="chat-sheet-tab-subtitle">
                    {locked ? 'Completa diagnóstico' : thread.status === 'context' ? 'Contexto consolidado' : specialization.subtitle}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className={`chat-monochrome-toggle ${
            props.isMobileViewport ? 'chat-monochrome-toggle--inline' : 'chat-monochrome-toggle--floating'
          }${props.isMonochrome ? ' is-active' : ''}`}
          onClick={props.toggleMonochrome}
          aria-label={props.isMonochrome ? 'Desactivar blanco y negro' : 'Activar blanco y negro'}
          title={props.isMonochrome ? 'Desactivar blanco y negro' : 'Activar blanco y negro'}
        >
          <svg className="mono-toggle-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <circle className="mono-toggle-icon__ring" cx="12" cy="12" r="9" />
            <path className="mono-toggle-icon__half" d="M12 3a9 9 0 0 0 0 18z" />
            <path className="mono-toggle-icon__split" d="M12 3v18" />
          </svg>
        </button>
        {props.activeThread && props.activeThread.contextScore > 0 && (
          <div className="sheet-context-bar" title={`Contexto: ${props.activeThread.contextScore}%`}>
            <div className="sheet-context-fill" style={{ width: `${props.activeThread.contextScore}%` }} />
            <span className="sheet-context-label">{props.activeThread.contextScore}% contexto</span>
            {props.activeThread.contextScore >= 80 && <span className="sheet-context-badge">Rico</span>}
          </div>
        )}
      </div>
      <div className="chat-brand-strip">
        <h1>
          <span className="chat-brand-title-row">
            <span className="chat-brand-logo-mark" aria-hidden="true">
              <span className="fm-logo-f">F</span>
              <span className="fm-logo-m">m</span>
            </span>
            <span className="chat-brand-wordmark">
              <span className="chat-brand-financiera">Financiera</span>
              <span
                className={`chat-brand-mente${menteBold ? ' chat-brand-mente--bold' : ''}`}
              >
                mente
              </span>
            </span>
          </span>
        </h1>
        <p
          className={`chat-identity-subtitle ${
            activeLabel === '2'
              ? 'chat-subtitle-2'
              : activeLabel === '3'
              ? 'chat-subtitle-3'
              : activeLabel === '★'
              ? 'chat-subtitle-meta'
              : 'chat-subtitle-1'
          }`}
        >
          {activeHandSubtitle}
        </p>
      </div>
      <p className="muted" />
      {props.isActiveChatLocked && (
        <div className="product-flow-banner" role="status">
          Este chat se desbloquea después del diagnóstico integrado. Sigue en el Chat 1 con presupuesto, cartolas y entrevista breve.
        </div>
      )}
      {!props.isActiveChatLocked && props.activeTurnCount >= 24 && (
        <div className="product-flow-banner" role="status">
          Modo cierre activo: te quedan {formatRemainingInteractions(props.activeTurnCount, props.activeThread?.id)} antes del tope de {getMaxChatInteractions(props.activeThread?.id)}. Cierra con un informe guardable en biblioteca.
        </div>
      )}
    </header>
  );
}
