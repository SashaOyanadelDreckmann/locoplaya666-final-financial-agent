import React from 'react';
import { Coins } from 'lucide-react';
import {
  formatRemainingInteractions,
  getClosingInteractionThreshold,
  getMaxChatInteractions,
} from '../utilidades/page.utils';
import { funnelStageLabel, funnelStageStepIndex } from '@financial-agent/shared';
import BrandWordmark from '@/components/marca/BrandWordmark';
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
  visualMode: VisualMode;
  cycleVisualMode: (origin?: { x: number; y: number }) => void;
  isMobileViewport: boolean;
  actionPlanFunnelStage?: 'brainstorm' | 'converge' | 'deliver' | null;
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
      <Coins size={14} aria-hidden="true" />
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
        const locked = props.isThreadLocked(thread.id);
        return (
          <button
            key={thread.id}
            type="button"
            className={`chat-sheet-tab ${specialization.accentClass}${thread.id === props.activeChatId ? ' is-active' : ''}${thread.status === 'context' ? ' is-context' : ''}${locked ? ' is-locked' : ''}${compact ? ' chat-sheet-tab--mobile-index' : ''}`}
            onClick={() => {
              if (locked) {
                props.setActiveChatId('chat-1');
                props.setPanelCallout({
                  section: 'chat',
                  message: 'Completa presupuesto, cartolas y entrevista para desbloquear este chat.',
                });
                return;
              }
              props.setActiveChatId(thread.id);
            }}
            title={locked ? 'Bloqueado hasta completar la entrevista' : thread.status === 'context' ? `Contexto: ${thread.name}` : `Chat ${thread.label}: ${thread.name}`}
            aria-disabled={locked ? true : undefined}
            aria-label={
              locked
                ? `Chat ${thread.label} bloqueado`
                : thread.id === props.activeChatId
                  ? `Chat ${thread.label} activo`
                  : `Ir al chat ${thread.label}`
            }
          >
            <span className="chat-sheet-tab-index">{thread.label}</span>
            {!compact ? (
              <span className="chat-sheet-tab-copy">
                <span className="chat-sheet-tab-title">
                  {locked ? 'Bloqueado' : thread.status === 'context' ? 'Síntesis' : specialization.title}
                </span>
                <span className="chat-sheet-tab-subtitle">
                  {locked ? 'Completa entrevista' : thread.status === 'context' ? 'Contexto consolidado' : specialization.subtitle}
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

  return (
    <header
      className={`agent-chat-header${props.isMobileViewport ? ' is-mobile is-mobile-single-row' : ''}`}
    >
      {props.isMobileViewport ? (
        <div className="chat-mobile-toolbar-row">
          <h1 className="chat-mobile-brand-heading chat-mobile-brand-heading--compact">{brandTitleButton}</h1>
          <div className="chat-mobile-toolbar-actions">
            {chatSwitcher(true)}
            {monochromeToggle}
          </div>
        </div>
      ) : (
        <>
          <div className="agent-chat-controls-row">
            {chatSwitcher()}
            {monochromeToggle}
            {props.activeThread && props.activeThread.contextScore > 0 && (
              <div className="sheet-context-bar" title={`Contexto: ${props.activeThread.contextScore}%`}>
                <div className="sheet-context-fill" style={{ width: `${props.activeThread.contextScore}%` }} />
                <span className="sheet-context-label">{props.activeThread.contextScore}% contexto</span>
                {props.activeThread.contextScore >= 80 && <span className="sheet-context-badge">Rico</span>}
              </div>
            )}
          </div>
          <div className="chat-brand-strip">
            <div className="chat-brand-action-row">
              <h1>{brandTitleButton}</h1>
              <p className={subtitleClassName}>{activeHandSubtitle}</p>
            </div>
          </div>
        </>
      )}
      <p className="muted" />
      {props.activeChatId === 'chat-2' && !props.isActiveChatLocked && props.actionPlanFunnelStage && (
        <div className="action-plan-funnel-rail" role="status" aria-label="Progreso del plan de accion">
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
          <span className="action-plan-funnel-stage-pill">{funnelStageLabel(props.actionPlanFunnelStage)}</span>
        </div>
      )}
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
      {!props.isActiveChatLocked &&
        props.activeTurnCount >= getClosingInteractionThreshold(props.activeThread?.id) && (
        <div className="product-flow-banner" role="status">
          Modo cierre activo: te quedan {formatRemainingInteractions(props.activeTurnCount, props.activeThread?.id)} antes del tope de {getMaxChatInteractions(props.activeThread?.id)}.
          {props.activeChatId === 'chat-2' ? ' El siguiente mensaje del agente debe ser tu plan ejecutivo completo.' : ' Cierra con un informe guardable en biblioteca.'}
        </div>
      )}
    </header>
  );
}
