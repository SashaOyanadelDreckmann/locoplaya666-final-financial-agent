import React, { useLayoutEffect, useRef } from 'react';
import { observeAgentMobileHeaderOccupy } from '@/lib/interfaz/agent-mobile-header-sync';
import {
  formatRemainingInteractions,
  getClosingInteractionThreshold,
  getMaxChatInteractions,
} from '../utilidades/page.utils';
import {
  CHAT_ONBOARDING_LOCKED_MESSAGE,
  type ChatThreadAccessState,
} from '../utilidades/chat-lifecycle.helpers';
import { funnelStageLabel, funnelStageStepIndex, socialFunnelStageLabel, socialFunnelStageStepIndex } from '@financial-agent/shared';
import BrandWordmark from '@/components/marca/BrandWordmark';
import { FincoinIcon } from '@/components/marca/FincoinIcon';
import {
  cycleVisualMode,
  isVisualModeActive,
  VISUAL_MODE_LABELS,
  type VisualMode,
} from '@/lib/interfaz/visual-mode';

type ChatThread = {
  id: string;
  label: string;
  name: string;
  status: 'active' | 'context';
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
  resolveThreadAccessState: (id: string) => ChatThreadAccessState;
  setPanelCallout: React.Dispatch<React.SetStateAction<{ section: string; message: string } | null>>;
  setKnowledgePopupOpen: React.Dispatch<React.SetStateAction<boolean>>;
  knowledgeScore: number;
  activeThread?: ChatThread;
  isActiveChatLocked: boolean;
  isActiveChatClosed: boolean;
  activeTurnCount: number;
  diagnosisUnlocked?: boolean;
  knowledgePopupOpen: boolean;
  knowledgeStage: string;
  completedMilestones: number;
  milestones: Milestone[];
  coachHint: string;
  visualMode: VisualMode;
  cycleVisualMode: (origin?: { x: number; y: number }) => void;
  isMobileViewport: boolean;
  actionPlanFunnelStage?: 'brainstorm' | 'converge' | 'deliver' | null;
  socialConsciousnessFunnelStage?: 'explore' | 'tension' | 'synthesis' | null;
  fincoinRemaining?: number;
  fincoinDepleted?: boolean;
  fincoinLowBalance?: boolean;
  onOpenFincoinUsage?: () => void;
}) {
  const activeLabel = props.activeThread?.label;
  const activeSpecialization = props.activeThread
    ? props.getThreadSpecialization(props.activeThread.id)
    : null;
  const activeHandSubtitle =
    activeLabel === '2'
      ? 'asesoria ejecutiva · plan de accion'
      : activeLabel === '3'
      ? 'conciencia social'
      : activeLabel === '★'
      ? 'sintesis maestra'
      : activeSpecialization?.subtitle ?? 'lectura base';

  const nextVisualMode = cycleVisualMode(props.visualMode);
  const visualModeLabel = VISUAL_MODE_LABELS[props.visualMode];
  const nextVisualModeLabel = VISUAL_MODE_LABELS[nextVisualMode];
  const isVisualModeOn = isVisualModeActive(props.visualMode);

  const monochromeToggleInner = (
    <button
      type="button"
      className={`chat-monochrome-toggle ${
        props.isMobileViewport ? 'chat-monochrome-toggle--inline' : 'chat-monochrome-toggle--floating'
      }${isVisualModeOn ? ' is-active' : ''} is-visual-mode-${props.visualMode}`}
      data-visual-mode={props.visualMode}
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        props.cycleVisualMode({
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        });
      }}
      aria-label={
        isVisualModeOn
          ? `Modo visual: ${visualModeLabel}. Toca para ${nextVisualModeLabel}.`
          : `Activar filtros visuales. Siguiente: ${nextVisualModeLabel}.`
      }
      title={
        isVisualModeOn
          ? `${visualModeLabel} · siguiente: ${nextVisualModeLabel}`
          : `Filtros visuales · siguiente: ${nextVisualModeLabel}`
      }
    >
      <svg className="mono-toggle-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle className="mono-toggle-icon__ring" cx="12" cy="12" r="9" />
        <path className="mono-toggle-icon__half" d="M12 3a9 9 0 0 0 0 18z" />
        <path className="mono-toggle-icon__half-alt" d="M12 3a9 9 0 0 1 0 18z" />
        <path className="mono-toggle-icon__split" d="M12 3v18" />
        <circle className="mono-toggle-icon__soft" cx="12" cy="12" r="4.5" />
      </svg>
      <span className="mono-toggle-mode-dot" aria-hidden="true" />
    </button>
  );

  const fincoinToggle = (
    <button
      type="button"
      className={`chat-fincoin-toggle${
        props.fincoinDepleted ? ' is-depleted' : props.fincoinLowBalance ? ' is-low' : ''
      }`}
      onClick={() => props.onOpenFincoinUsage?.()}
      aria-label={
        props.fincoinDepleted
          ? 'Fincoins agotados. Abrir detalle de uso.'
          : `Fincoins disponibles: ${props.fincoinRemaining ?? 0}. Abrir detalle de uso.`
      }
      title={
        props.fincoinDepleted
          ? 'Fincoins agotados · agente en pausa'
          : `Fincoins: ${props.fincoinRemaining ?? 0} disponibles`
      }
    >
      <FincoinIcon size="sm" />
      <span className="chat-fincoin-toggle-dot" aria-hidden="true" />
    </button>
  );

  const monochromeToggle = (
    <div className="chat-header-toggle-group">
      {fincoinToggle}
      {monochromeToggleInner}
    </div>
  );

  const chatSwitcher = (compact = false) => (
    <div
      className={`chat-switcher${compact ? ' chat-switcher--mobile-index' : ''}`}
      aria-label="Selector de chats"
    >
      {props.chatThreads.map((thread) => {
        const specialization = props.getThreadSpecialization(thread.id);
        const accessState = props.resolveThreadAccessState(thread.id);
        const locked = accessState === 'locked';
        const closed = accessState === 'closed';
        return (
          <button
            key={thread.id}
            type="button"
            className={`chat-sheet-tab ${specialization.accentClass}${thread.id === props.activeChatId ? ' is-active' : ''}${thread.status === 'context' || closed ? ' is-context' : ''}${locked ? ' is-locked' : ''}${closed ? ' is-closed' : ''}${compact ? ' chat-sheet-tab--mobile-index' : ''}`}
            onClick={() => {
              if (locked) {
                props.setActiveChatId('chat-1');
                props.setPanelCallout({
                  section: 'chat',
                  message: CHAT_ONBOARDING_LOCKED_MESSAGE,
                });
                return;
              }
              props.setActiveChatId(thread.id);
            }}
            title={
              locked
                ? 'Bloqueado hasta completar la entrevista'
                : closed
                  ? `Chat ${thread.label} cerrado · solo lectura`
                  : thread.status === 'context'
                    ? `Contexto: ${thread.name}`
                    : `Chat ${thread.label}: ${thread.name}`
            }
            aria-disabled={locked ? true : undefined}
            aria-label={
              locked
                ? `Chat ${thread.label} bloqueado`
                : closed
                  ? `Chat ${thread.label} cerrado`
                  : thread.id === props.activeChatId
                    ? `Chat ${thread.label} activo`
                    : `Ir al chat ${thread.label}`
            }
          >
            <span className="chat-sheet-tab-index">{thread.label}</span>
            {!compact ? (
              <span className="chat-sheet-tab-copy">
                <span className="chat-sheet-tab-title">
                  {locked ? 'Bloqueado' : closed || thread.status === 'context' ? 'Síntesis' : specialization.title}
                </span>
                <span className="chat-sheet-tab-subtitle">
                  {locked
                    ? 'Completa entrevista'
                    : closed || thread.status === 'context'
                      ? 'Resumen y historial'
                      : specialization.subtitle}
                </span>
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );

  const brandTitleButton = (
    <button
      type="button"
      className="chat-brand-title-row chat-brand-title-row--home"
      aria-label="Financieramente"
      onClick={() => {
        window.location.assign('/');
      }}
    >
      <span className="chat-brand-logo-mark" aria-hidden="true">
        <span className="chat-brand-logo-frame">
          <svg viewBox="0 0 1254 1254" className="chat-brand-logo-svg" role="presentation" focusable="false">
            <rect className="chat-brand-logo-bg" width="1254" height="1254" />
            <text x="94" y="810" className="chat-brand-logo-lettermark">
              Fm
            </text>
          </svg>
        </span>
      </span>
      <BrandWordmark
        className="chat-brand-wordmark"
        financieraClassName="chat-brand-financiera"
        menteClassName="chat-brand-mente"
      />
    </button>
  );

  const subtitleClassName = `chat-identity-subtitle ${
    activeLabel === '2'
      ? 'chat-subtitle-2'
      : activeLabel === '3'
      ? 'chat-subtitle-3'
      : activeLabel === '★'
      ? 'chat-subtitle-meta'
      : 'chat-subtitle-1'
  }`;

  const showActionPlanFunnel =
    props.activeChatId === 'chat-2' &&
    !props.isActiveChatLocked &&
    !props.isActiveChatClosed &&
    Boolean(props.actionPlanFunnelStage);

  const showSocialConsciousnessFunnel =
    props.activeChatId === 'chat-3' &&
    !props.isActiveChatLocked &&
    !props.isActiveChatClosed &&
    Boolean(props.socialConsciousnessFunnelStage);

  const actionPlanFunnelRail = showActionPlanFunnel ? (
    <div
      className={`action-plan-funnel-rail${props.isMobileViewport ? ' action-plan-funnel-rail--header-integrated' : ''}`}
      role="status"
      aria-label="Progreso del plan de accion"
    >
      {[1, 2, 3].map((step) => {
        const current = funnelStageStepIndex(props.actionPlanFunnelStage!);
        const done = step < current;
        const active = step === current;
        const labels = ['Ideas', 'Convergencia', 'Plan ejecutivo'];
        return (
          <div
            key={step}
            className={`action-plan-funnel-step${done ? ' is-done' : ''}${active ? ' is-active' : ''}`}
          >
            <span className="action-plan-funnel-step-index">{step}</span>
            <span className="action-plan-funnel-step-label">{labels[step - 1]}</span>
          </div>
        );
      })}
      <span className="action-plan-funnel-stage-pill">{funnelStageLabel(props.actionPlanFunnelStage!)}</span>
    </div>
  ) : null;

  const socialConsciousnessFunnelRail = showSocialConsciousnessFunnel ? (
    <div
      className={`action-plan-funnel-rail is-social-consciousness-funnel${props.isMobileViewport ? ' action-plan-funnel-rail--header-integrated' : ''}`}
      role="status"
      aria-label="Progreso de conciencia social"
    >
      {[1, 2, 3].map((step) => {
        const current = socialFunnelStageStepIndex(props.socialConsciousnessFunnelStage!);
        const done = step < current;
        const active = step === current;
        const labels = ['Exploración', 'Tensión', 'Síntesis'];
        return (
          <div
            key={step}
            className={`action-plan-funnel-step${done ? ' is-done' : ''}${active ? ' is-active' : ''}`}
          >
            <span className="action-plan-funnel-step-index">{step}</span>
            <span className="action-plan-funnel-step-label">{labels[step - 1]}</span>
          </div>
        );
      })}
      <span className="action-plan-funnel-stage-pill">
        {socialFunnelStageLabel(props.socialConsciousnessFunnelStage!)}
      </span>
    </div>
  ) : null;

  const showFunnelRail = showActionPlanFunnel || showSocialConsciousnessFunnel;
  const headerRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    if (!props.isMobileViewport || !headerRef.current) return;
    return observeAgentMobileHeaderOccupy(headerRef.current);
  }, [props.isMobileViewport]);

  return (
    <header
      ref={headerRef}
      className={`agent-chat-header${props.isMobileViewport ? ' is-mobile is-mobile-single-row' : ''}${showFunnelRail ? ' has-action-plan-funnel' : ''}`}
    >
      {props.isMobileViewport ? (
        <div className="chat-mobile-header-stack">
          <div className="chat-mobile-toolbar-row">
            <h1 className="chat-mobile-brand-heading chat-mobile-brand-heading--compact">{brandTitleButton}</h1>
            <div className="chat-mobile-toolbar-actions">
              {chatSwitcher(true)}
              {monochromeToggle}
            </div>
          </div>
          {actionPlanFunnelRail}
          {socialConsciousnessFunnelRail}
        </div>
      ) : (
        <>
          <div className="agent-chat-controls-row">
            {chatSwitcher()}
            {monochromeToggle}
          </div>
          <div className="chat-brand-strip">
            <div className="chat-brand-action-row">
              <h1>{brandTitleButton}</h1>
              <p className={subtitleClassName}>{activeHandSubtitle}</p>
            </div>
          </div>
          {actionPlanFunnelRail}
          {socialConsciousnessFunnelRail}
        </>
      )}
      <p className="muted" />
      {props.fincoinDepleted ? (
        <div className="fincoin-depleted-banner" role="status">
          Fincoins agotados: el agente quedó en pausa. Puedes revisar los resúmenes finales, pero no se procesan nuevas solicitudes con costo.
        </div>
      ) : props.fincoinLowBalance ? (
        <div className="fincoin-low-balance-banner" role="status">
          Te quedan {props.fincoinRemaining ?? 0} Fincoins. Prioriza preguntas clave para no interrumpir el flujo.
        </div>
      ) : null}
      {props.isActiveChatLocked && (
        <div className="product-flow-banner" role="status">
          Este chat se desbloquea después de cerrar la entrevista. Sigue en el Chat 1 con presupuesto, cartolas y entrevista breve.
        </div>
      )}
      {props.isActiveChatClosed && (
        <div className="product-flow-banner" role="status">
          Este chat cerró su ventana de interacciones. Revisa el resumen, el historial completo o exporta con Guardar PDF.
        </div>
      )}
      {!props.isActiveChatLocked &&
        !props.isActiveChatClosed &&
        props.activeTurnCount >= getClosingInteractionThreshold(props.activeThread?.id) && (
        <div className="product-flow-banner" role="status">
          Modo cierre activo: te quedan {formatRemainingInteractions(props.activeTurnCount, props.activeThread?.id)} antes del tope de {getMaxChatInteractions(props.activeThread?.id)}.
          {props.activeChatId === 'chat-2' ? ' El siguiente mensaje del agente debe ser tu plan ejecutivo completo.' : ' Cierra con un informe guardable en biblioteca.'}
        </div>
      )}
    </header>
  );
}
