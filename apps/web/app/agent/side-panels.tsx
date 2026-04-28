import React, { type ReactNode } from 'react';

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
  panelCallout: { section: string; message: string } | null;
  setPanelCallout: React.Dispatch<React.SetStateAction<{ section: string; message: string } | null>>;
  panelGridRef: React.RefObject<HTMLDivElement>;
  panelScrollRef: React.RefObject<HTMLElement>;
  panelRenderedCards: ReactNode;
}) {
  return (
    <>
      <aside className="agent-divider-rail" aria-label="Estado del usuario">
        <div className="mobile-rail-subtitle">
          <span className="mobile-rail-subtitle-title">{props.sessionInfoName?.split(' ')[0] ?? 'Financieramente'}</span>
          <span className="mobile-rail-subtitle-badge">{props.knowledgeStage}</span>
          {props.hasInjectedIntake && <span className="mobile-rail-subtitle-memory">● perfil activo</span>}
        </div>
      </aside>

      <aside
        className={`agent-panel ${props.mobilePanelExpanded ? 'is-mobile-expanded' : 'is-mobile-compact'}`}
        ref={props.panelScrollRef}
      >
        <div
          ref={props.mobilePanelHandleRef}
          className="mobile-panel-handle"
          onClick={() => { props.haptic(12); props.setMobilePanelExpanded((v) => !v); }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              props.haptic(12);
              props.setMobilePanelExpanded((v) => !v);
            }
          }}
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
          <button
            type="button"
            className="mobile-panel-close-btn"
            onClick={() => props.setMobilePanelExpanded(false)}
            aria-label="Volver al chat"
          >
            ← Chat
          </button>
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
