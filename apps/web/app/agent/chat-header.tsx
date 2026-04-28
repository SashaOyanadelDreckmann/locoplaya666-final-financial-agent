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

type ProductLifecycle = { phase?: string };
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
  phaseLabel: (phase?: string) => string;
  productLifecycle?: ProductLifecycle;
  activeTurnsRemaining: number;
  setNameForActive: (name: string) => void;
  deleteThreadById: (id: string) => void;
  isActiveChatLocked: boolean;
  activeTurnCount: number;
  knowledgePopupOpen: boolean;
  knowledgeStage: string;
  completedMilestones: number;
  milestones: Milestone[];
  coachHint: string;
}) {
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
        <button
          type="button"
          className="mobile-progress-pill"
          onClick={() => props.setKnowledgePopupOpen((v) => !v)}
          aria-label={`Conocimiento ${props.knowledgeScore}%`}
          title="Ver progreso del conocimiento"
        >
          <span className="mobile-progress-pill-value">{props.knowledgeScore}%</span>
          <span className="mobile-progress-pill-track">
            <span className="mobile-progress-pill-fill" style={{ width: `${props.knowledgeScore}%` }} />
          </span>
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
        {props.activeThread?.label === '2' && <p className="chat-identity-subtitle chat-subtitle-2">plan de acción e inversión</p>}
        {props.activeThread?.label === '3' && <p className="chat-identity-subtitle chat-subtitle-3">conciencia de clases</p>}
      </div>
      <p className="muted">Proyecto de tesis en finanzas abiertas. Entorno seguro y privado para analisis financiero.</p>
      <div className="chat-meta-row">
        <span className="chat-id-badge">Chat {props.activeThread?.label}</span>
        <span className="chat-id-badge" title="Fase del flujo">{props.phaseLabel(props.productLifecycle?.phase)}</span>
        <span className="chat-id-badge" title="Interacciones restantes">{props.activeTurnsRemaining}/50 restantes</span>
        <input
          value={props.activeThread?.name ?? ''}
          onChange={(e) => props.setNameForActive(e.target.value)}
          className="chat-name-input"
          placeholder="Nombre del chat"
          aria-label="Nombre del chat activo"
        />
        <button type="button" className="chat-delete-btn" onClick={() => props.deleteThreadById(props.activeChatId)} title="Eliminar chat activo" aria-label="Eliminar chat activo">
          Eliminar
        </button>
      </div>
      {props.isActiveChatLocked && (
        <div className="product-flow-banner" role="status">
          Este chat se desbloquea después del diagnóstico integrado. Sigue en el Chat 1 con presupuesto, cartolas y entrevista breve.
        </div>
      )}
      {!props.isActiveChatLocked && props.activeTurnCount >= 30 && (
        <div className="product-flow-banner" role="status">
          Modo cierre activo: quedan {props.activeTurnsRemaining} interacciones para cerrar con un informe guardable en biblioteca.
        </div>
      )}

      {props.knowledgePopupOpen && (
        <div className="mobile-knowledge-popover" role="dialog" aria-label="Mapa de conocimiento mobile">
          <div className="knowledge-popup-backdrop mobile-knowledge-backdrop" onClick={() => props.setKnowledgePopupOpen(false)} />
          <div className="knowledge-popup mobile-knowledge-sheet">
            <div className="knowledge-popup-header">
              <div className="knowledge-popup-score">
                <span className="knowledge-popup-pct">{props.knowledgeScore}%</span>
                <span className="knowledge-popup-stage">{props.knowledgeStage}</span>
                <div className="knowledge-popup-bar">
                  <div className="knowledge-popup-bar-fill" style={{ width: `${props.knowledgeScore}%` }} />
                </div>
              </div>
              <span className="knowledge-popup-meta">{props.completedMilestones}/{props.milestones.length}<br />hitos</span>
            </div>
            <p className="panel-inline-hint">{props.coachHint}</p>
            <div className="knowledge-popup-milestones">
              {props.milestones.map((milestone) => (
                <div key={milestone.id} className={`knowledge-popup-milestone ${milestone.done ? 'is-done' : ''}`}>
                  <div className="knowledge-popup-check">
                    <svg className="knowledge-popup-check-icon" viewBox="0 0 10 8"><polyline points="1,4 4,7 9,1" /></svg>
                  </div>
                  <span className="knowledge-popup-milestone-text">{milestone.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
