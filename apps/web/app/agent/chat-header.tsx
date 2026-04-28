import React from 'react';

type ChatThread = {
  id: string;
  label: string;
  name: string;
  status: 'active' | 'context';
  contextScore: number;
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
  knowledgePopupOpen: boolean;
  knowledgeStage: string;
  completedMilestones: number;
  milestones: Milestone[];
  coachHint: string;
}) {
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
    <header className="agent-chat-header">
      <div className="agent-chat-controls-row">
        <div className="chat-switcher" aria-label="Selector de chats">
          {props.chatThreads.map((thread) => {
            const specialization = props.getThreadSpecialization(thread.id);
            const locked = props.isThreadLocked(thread.id);
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
        {props.activeThread && props.activeThread.contextScore > 0 && (
          <div className="sheet-context-bar" title={`Contexto: ${props.activeThread.contextScore}%`}>
            <div className="sheet-context-fill" style={{ width: `${props.activeThread.contextScore}%` }} />
            <span className="sheet-context-label">{props.activeThread.contextScore}% contexto</span>
            {props.activeThread.contextScore >= 80 && <span className="sheet-context-badge">Rico</span>}
          </div>
        )}
      </div>
      <div className="chat-brand-strip">
        <h1>FinancieraMente</h1>
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
      <p className="muted">Proyecto de tesis en finanzas abiertas. Entorno seguro y privado para analisis financiero.</p>
      {props.isActiveChatLocked && (
        <div className="product-flow-banner" role="status">
          Este chat se desbloquea después del diagnóstico integrado. Sigue en el Chat 1 con presupuesto, cartolas y entrevista breve.
        </div>
      )}
      {!props.isActiveChatLocked && props.activeTurnCount >= 30 && (
        <div className="product-flow-banner" role="status">
          Modo cierre activo: estás en la fase final para cerrar con un informe guardable en biblioteca.
        </div>
      )}
    </header>
  );
}
