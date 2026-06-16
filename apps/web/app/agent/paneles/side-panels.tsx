import React, { type ReactNode } from 'react';

import {
  MobilePanelCircularDeck,
  type MobilePanelDeckHandle,
  type PanelCardItem,
} from './mobile-panel-compact-carousel';
import { PanelCalloutBanner } from './panel-callout-banner';

type Milestone = { id: string; label: string; done: boolean };

export function SidePanels(props: {
  isMobileViewport: boolean;
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
  compactPanelCards?: PanelCardItem[];
  compactPanelLoopResetKey?: number;
  compactPanelDeckRef?: React.Ref<MobilePanelDeckHandle>;
  panelRenderedCards: ReactNode;
  panelIntroActive?: boolean;
  panelIntroPhase?: 'morph' | 'shell' | 'assemble' | 'settle';
  panelIntroSettled?: boolean;
}) {
  const useMobileDeck =
    props.isMobileViewport &&
    !props.mobilePanelExpanded &&
    Boolean(props.compactPanelCards);

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
        className={`agent-panel${
          props.isMobileViewport
            ? props.mobilePanelExpanded
              ? ' is-mobile-expanded'
              : ' is-mobile-compact'
            : ''
        }${props.panelIntroActive ? ' is-panel-intro-measure' : ''}`}
        ref={props.panelScrollRef}
      >
        <div
          ref={props.mobilePanelHandleRef}
          className="mobile-panel-handle"
          role="separator"
          aria-label="Arrastrar para ajustar el panel"
          aria-expanded={props.mobilePanelExpanded}
        >
          <span className="mobile-panel-handle-pill" aria-hidden="true" />
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
        </div>

        {props.panelCallout && (props.mobilePanelExpanded || !props.isMobileViewport) ? (
          <PanelCalloutBanner callout={props.panelCallout} onClose={() => props.setPanelCallout(null)} />
        ) : null}

        {useMobileDeck ? (
          <MobilePanelCircularDeck
            ref={props.compactPanelDeckRef}
            cards={props.compactPanelCards!}
            gridRef={props.panelGridRef}
            resetKey={props.compactPanelLoopResetKey ?? props.compactPanelCards!.length}
            haptic={props.haptic}
          />
        ) : (
          <div
            ref={props.panelGridRef}
            className={`panel-grid${props.panelIntroActive ? ' is-panel-intro-measure' : ''}`}
          >
            {props.panelRenderedCards}
          </div>
        )}
      </aside>
    </>
  );
}
