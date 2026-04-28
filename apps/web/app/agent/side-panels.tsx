import React, { type CSSProperties, type ReactNode } from 'react';

type Milestone = { id: string; label: string; done: boolean };

export function SidePanels(props: {
  knowledgeScore: number;
  progressPulse: boolean;
  setKnowledgePopupOpen: React.Dispatch<React.SetStateAction<boolean>>;
  knowledgePopupOpen: boolean;
  knowledgeStage: string;
  completedMilestones: number;
  milestones: Milestone[];
  coachHint: string;
  levelUpText: string | null;
  sessionInfoName?: string | null;
  hasInjectedIntake: boolean;
  mobilePanelHandleRef: React.RefObject<HTMLDivElement>;
  mobilePanelExpanded: boolean;
  setMobilePanelExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  haptic: (ms?: number) => void;
  setMobileTab: React.Dispatch<React.SetStateAction<'chat' | 'panel'>>;
  panelCallout: { section: string; message: string } | null;
  setPanelCallout: React.Dispatch<React.SetStateAction<{ section: string; message: string } | null>>;
  panelGridRef: React.RefObject<HTMLDivElement>;
  panelScrollRef: React.RefObject<HTMLElement>;
  panelRenderedCards: ReactNode;
}) {
  return (
    <>
      <aside className="agent-divider-rail" aria-label="Progreso del conocimiento del usuario">
        <button
          type="button"
          className={`knowledge-rail-card ${props.progressPulse ? 'is-level-up' : ''}`}
          onClick={() => props.setKnowledgePopupOpen((v) => !v)}
          aria-label={`Conocimiento ${props.knowledgeScore}% — ver hitos`}
          title="Ver mapa de conocimiento"
          style={{ '--rail-glow-h': `${props.knowledgeScore}%` } as CSSProperties}
        >
          <span className="knowledge-rail-label">Conoc.</span>
          <div className="knowledge-rail-track-wrap">
            <div className="knowledge-rail-track">
              <div className="knowledge-rail-fill" style={{ height: `${props.knowledgeScore}%` }} />
              {props.milestones.map((m, i) => {
                const isNext = !m.done && props.milestones.slice(0, i).every((prev) => prev.done);
                return (
                  <div
                    key={m.id}
                    className={`knowledge-rail-dot${m.done ? ' is-done' : ''}${isNext ? ' is-next' : ''}`}
                    style={{ bottom: `${(i / Math.max(props.milestones.length - 1, 1)) * 100}%` }}
                    title={m.label}
                  />
                );
              })}
            </div>
          </div>
          <div className="knowledge-rail-score">
            <span className="knowledge-rail-value">{props.knowledgeScore}%</span>
            <span className="knowledge-rail-stage">{props.knowledgeStage}</span>
          </div>
          <span className="knowledge-rail-meta">{props.completedMilestones}/{props.milestones.length}</span>
          <span className="knowledge-rail-cta">hitos</span>
          {props.levelUpText && <span className="knowledge-level-up" role="status">{props.levelUpText}</span>}
        </button>

        {props.knowledgePopupOpen && (
          <>
            <div className="knowledge-popup-backdrop" onClick={() => props.setKnowledgePopupOpen(false)} />
            <div className="knowledge-popup" role="dialog" aria-label="Mapa de conocimiento">
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
          </>
        )}

        <div className="mobile-rail-subtitle">
          <span className="mobile-rail-subtitle-title">{props.sessionInfoName?.split(' ')[0] ?? 'Financieramente'}</span>
          <span className="mobile-rail-subtitle-badge">{props.knowledgeStage}</span>
          {props.hasInjectedIntake && <span className="mobile-rail-subtitle-memory">● perfil activo</span>}
        </div>
      </aside>

      <aside className="agent-panel" ref={props.panelScrollRef}>
        <div
          ref={props.mobilePanelHandleRef}
          className="mobile-panel-handle"
          onClick={() => { props.haptic(12); props.setMobilePanelExpanded((v) => !v); }}
          role="button"
          tabIndex={0}
          aria-label={props.mobilePanelExpanded ? 'Minimizar panel' : 'Expandir panel'}
        >
          <span className="mobile-panel-handle-title">⊞ Panel</span>
          <svg className={`mobile-panel-chevron${props.mobilePanelExpanded ? ' rotated' : ''}`} width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4 10L8 6L12 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="mobile-panel-close">
          <button type="button" className="mobile-panel-close-btn" onClick={() => props.setMobileTab('chat')} aria-label="Volver al chat">← Chat</button>
          <span className="mobile-panel-close-title">Panel</span>
        </div>

        {props.panelCallout && (
          <div className={`panel-callout panel-callout-${props.panelCallout.section}`}>
            <div className="panel-callout-icon">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="10" cy="10" r="8" />
                <path d="M10 6v4l2.5 2.5" strokeLinecap="round" />
              </svg>
            </div>
            <div className="panel-callout-content">
              <span className="panel-callout-tag">Agente</span>
              <p className="panel-callout-msg">{props.panelCallout.message}</p>
            </div>
            <button type="button" className="panel-callout-close" onClick={() => props.setPanelCallout(null)} aria-label="Cerrar">×</button>
            <div className="panel-callout-progress" />
          </div>
        )}

        <div ref={props.panelGridRef} className="panel-grid">
          {props.panelRenderedCards}
        </div>
      </aside>
    </>
  );
}
