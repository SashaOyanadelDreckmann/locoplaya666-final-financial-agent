import React, { memo, useMemo, useState, type ReactNode } from 'react';

import { createInitialAgentStreamUiState } from '@financial-agent/shared';

import { DocumentBubble } from '@/components/conversacion/DocumentBubble';
import { CitationBubble } from '@/components/conversacion/CitationBubble';
import { AgentBlocksRenderer } from '@/components/agente/AgentBlocksRenderer';
import { AgentStreamRail } from '@/components/agente/AgentStreamRail';
import '@/app/estilos/agente/chat/agent-stream.css';
import { getStreamRailAccentColor } from '@/lib/agente/matte-panel-tones';
import { saveBubbleSnapshotPdfArtifact, savePdfArtifact, downloadArtifactFile } from '@/lib/compartido/artifacts';
import { buildBubbleSnapshotHtmlAndCss } from './bubble-chat.snapshot';
import type { ChatItem } from '@/lib/agente/agent.response.types';
import type { VisualMode } from '@/lib/interfaz/visual-mode';
import {
  buildChatClosureSummary,
  sanitizeMessageText,
  getChat1UxCopy,
  resolveChat1UxState,
  type ChatClosureSummary,
} from '../utilidades/page.utils';
import { renderLatexDocMessage } from './message-renderer';
import { GradientBlobCard } from '@/components/ui/gradient-bold-card';
import { ChatIntroGradientCard } from '@/components/ui/chat-intro-gradient-card';
import { ClosureGradientBlobCard } from '@/components/ui/closure-gradient-card';
import { UserUploadBubble } from './user-upload-bubble';
import { MAX_CHAT_UPLOAD_FILES } from '../utilidades/agent-page.constants';
import {
  isLegacyWelcomeAssistantItem,
  isRecoverableChatErrorMessage,
  isWelcomeShellMessageContent,
} from '../flujo/welcome-intro.shared';
import {
  isChatIntroShellItem,
  isCompactChatIntroShell,
  type ChatIntroId,
  usesExecutiveWelcomeCarousel,
} from '../flujo/chat-intro.shared';
import type { DiagnosisProfile } from '@/state/profile.store';
import { OnboardingFlowCta } from '../flujo/OnboardingFlowCta';
import {
  buildOnboardingFlowCta,
  type OnboardingFlowStatus,
} from '../flujo/onboarding-flow.helpers';

type PanelAction = NonNullable<
  Extract<ChatItem, { type: 'message'; role: 'assistant' }>['panel_action']
>;

function getFlowPanelActionLabel(section: PanelAction['section']): string {
  if (section === 'transactions' || section === 'products_transactions') {
    return 'Abrir productos y transacciones';
  }
  if (section === 'budget') return 'Abrir presupuesto';
  if (section === 'interview') return 'Abrir entrevista';
  return 'Abrir panel';
}

function renderAgentPanelActionRow(action: PanelAction, onClick: () => void) {
  return (
    <div className="agent-inline-panel-action agent-inline-panel-action--intro">
      <button type="button" className="agent-inline-panel-button" onClick={onClick}>
        {getFlowPanelActionLabel(action.section)}
      </button>
      {action.message ? <span className="agent-inline-panel-note">{action.message}</span> : null}
    </div>
  );
}

const DOC_MODE_PILL_STYLE_DARK: React.CSSProperties = {
  backgroundColor: '#000000',
  backgroundImage: 'none',
  color: '#ffffff',
  border: '1px solid rgba(255, 255, 255, 0.26)',
  opacity: 1,
  mixBlendMode: 'normal',
  filter: 'none',
  backdropFilter: 'none',
  WebkitBackdropFilter: 'none',
  WebkitTextFillColor: '#ffffff',
  textShadow: 'none',
};

const DOC_MODE_PILL_STYLE_LIGHT: React.CSSProperties = {
  backgroundColor: '#ffffff',
  backgroundImage: 'none',
  color: '#000000',
  border: '1px solid rgba(0, 0, 0, 0.2)',
  opacity: 1,
  mixBlendMode: 'normal',
  filter: 'none',
  backdropFilter: 'none',
  WebkitBackdropFilter: 'none',
  WebkitTextFillColor: '#000000',
  textShadow: 'none',
};

function getDocModePillStyle(visualMode?: VisualMode): React.CSSProperties {
  return visualMode === 'light-outline' ? DOC_MODE_PILL_STYLE_LIGHT : DOC_MODE_PILL_STYLE_DARK;
}

type SavedReport = {
  id: string;
  title: string;
  group: 'plan_action' | 'simulation' | 'budget' | 'diagnosis' | 'other';
  fileUrl: string;
  previewImageUrl?: string;
  createdAt: string;
};

function shouldEnableBubbleScroll(content: string) {
  const normalized = (content || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return false;
  const explicitLines = normalized.split('\n').filter((l) => l.trim().length > 0);
  const estimatedWrappedLines = explicitLines.reduce((acc, line) => {
    const length = line.trim().length;
    return acc + Math.max(1, Math.ceil(length / 72));
  }, 0);
  return estimatedWrappedLines > 2;
}

function isWelcomeCarouselShellItem(
  item: ChatItem,
  index: number,
  items: ChatItem[],
  activeThreadId: string | undefined,
  diagnosisUnlocked: boolean,
): boolean {
  return isChatIntroShellItem({
    item,
    index,
    items,
    activeThreadId,
    diagnosisUnlocked,
    isLegacyWelcomeAssistantItem,
  });
}

function renderChatIntroCard(props: {
  activeThreadId?: string;
  diagnosisUnlocked: boolean;
  sessionUserName?: string;
  sessionInjectedIntake?: unknown;
  diagnosisProfile?: DiagnosisProfile | null;
  className?: string;
  preferExecutiveCarousel?: boolean;
}) {
  const chatId = (props.activeThreadId ?? 'chat-1') as ChatIntroId;
  if (
    props.preferExecutiveCarousel === true ||
    usesExecutiveWelcomeCarousel({
      activeThreadId: props.activeThreadId,
      diagnosisUnlocked: props.diagnosisUnlocked,
    })
  ) {
    return (
      <GradientBlobCard
        className={props.className ?? 'gradient-blob-card--welcome'}
        sessionUserName={props.sessionUserName}
        sessionInjectedIntake={props.sessionInjectedIntake}
      />
    );
  }

  return (
    <ChatIntroGradientCard
      className={props.className ?? 'gradient-blob-card--chat-intro'}
      chatId={chatId}
      sessionUserName={props.sessionUserName}
      sessionInjectedIntake={props.sessionInjectedIntake}
      diagnosisProfile={props.diagnosisProfile}
      diagnosisUnlocked={props.diagnosisUnlocked}
    />
  );
}

function welcomeShellBubbleClasses(params: {
  isEmptyWelcomeShell: boolean;
  activeThreadId?: string;
  diagnosisUnlocked: boolean;
  isScrollable: boolean;
  isFirstAssistantCard: boolean;
  isStreaming: boolean;
  funnelStage?: 'brainstorm' | 'converge' | 'deliver' | null;
}): string {
  const executiveWelcomeShell =
    params.isEmptyWelcomeShell && params.activeThreadId === 'chat-1';
  const compactIntro =
    params.isEmptyWelcomeShell &&
    !executiveWelcomeShell &&
    isCompactChatIntroShell({
      activeThreadId: params.activeThreadId,
      diagnosisUnlocked: params.diagnosisUnlocked,
    });

  return [
    'agent-bubble assistant latex-doc',
    params.isScrollable ? 'is-scrollable-bubble' : '',
    params.isFirstAssistantCard ? 'is-intro-doc' : '',
    params.isEmptyWelcomeShell && !compactIntro ? 'is-empty-welcome' : '',
    compactIntro ? 'is-chat-intro-shell' : '',
    params.isStreaming ? 'is-streaming' : '',
    params.funnelStage === 'deliver' ? 'is-action-plan-deliver' : '',
    params.funnelStage ? `is-action-plan-${params.funnelStage}` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

function welcomeShellBodyClasses(params: {
  isEmptyWelcomeShell: boolean;
  activeThreadId?: string;
  diagnosisUnlocked: boolean;
  isScrollable: boolean;
}): string {
  const executiveWelcomeShell =
    params.isEmptyWelcomeShell && params.activeThreadId === 'chat-1';
  const compactIntro =
    params.isEmptyWelcomeShell &&
    !executiveWelcomeShell &&
    isCompactChatIntroShell({
      activeThreadId: params.activeThreadId,
      diagnosisUnlocked: params.diagnosisUnlocked,
    });

  return [
    'latex-doc-body',
    params.isScrollable ? 'is-scrollable-content' : '',
    params.isEmptyWelcomeShell && !compactIntro ? 'is-empty-welcome-body' : '',
    compactIntro ? 'is-chat-intro-body' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

function isExternalCitation(citation: Extract<ChatItem, { type: 'citation' }>['citation']) {
  const raw = citation?.url;
  if (!raw || typeof raw !== 'string') return false;
  try {
    const parsed = new URL(raw);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    const host = parsed.hostname.toLowerCase();
    return host !== 'localhost' && host !== '127.0.0.1' && host !== '::1';
  } catch {
    return false;
  }
}

export const ChatThreadView = memo(function ChatThreadView(props: {
  items: ChatItem[];
  loading: boolean;
  diagnosisUnlocked: boolean;
  isMobileViewport?: boolean;
  sessionUserName?: string;
  activeThreadId?: string;
  activeThreadLabel?: string;
  canOpenInterview: boolean;
  expandedCitationsByMessage: Record<number, boolean>;
  setExpandedCitationsByMessage: React.Dispatch<React.SetStateAction<Record<number, boolean>>>;
  onSend: (messageOverride?: string) => void;
  setDraftForActive: (value: string) => void;
  sessionInjectedIntake?: unknown;
  diagnosisProfile?: DiagnosisProfile | null;
  chatThreadRef: React.RefObject<HTMLDivElement>;
  activeChatId: string;
  actionPlanFunnelStage?: 'brainstorm' | 'converge' | 'deliver' | null;
  setItemsForActive: React.Dispatch<React.SetStateAction<ChatItem[]>>;
  classifyReportGroup: (title: string, source?: string) => SavedReport['group'];
  setSavedReports: React.Dispatch<React.SetStateAction<SavedReport[]>>;
  launchDocToLibraryAnimation: (title: string, sourceRect: DOMRect, previewUrl: string, reportId: string) => void;
  onPanelAction: (action: NonNullable<Extract<ChatItem, { type: 'message'; role: 'assistant' }>['panel_action']>) => void;
  onboardingFlowStatus?: OnboardingFlowStatus;
  visualMode?: VisualMode;
  compactClosedView?: boolean;
  showFullChat?: boolean;
  closingSummary?: ChatClosureSummary | null;
}) {
  const docModePillStyle = getDocModePillStyle(props.visualMode);
  const [savingBubblePdf, setSavingBubblePdf] = useState<Record<number, boolean>>({});
  const userTag = String(props.sessionUserName ?? 'USER').trim().split(' ')[0] || 'USER';
  const chat1Ux = resolveChat1UxState({
    chatId: props.activeThreadId,
    diagnosisCompleted: props.diagnosisUnlocked,
    canOpenInterview: props.canOpenInterview,
  });
  const chat1Copy = getChat1UxCopy(chat1Ux);
  const showOnboardingFlow =
    props.activeThreadId === 'chat-1' &&
    !props.diagnosisUnlocked &&
    !(props.compactClosedView && !props.showFullChat);
  const onboardingFlowModel =
    showOnboardingFlow && props.onboardingFlowStatus
      ? buildOnboardingFlowCta(props.onboardingFlowStatus, props.sessionUserName)
      : null;
  const itemsToRender =
    props.compactClosedView && !props.showFullChat
      ? (() => {
          for (let index = props.items.length - 1; index >= 0; index -= 1) {
            const item = props.items[index];
            if (item.type === 'message' && item.role === 'user') return props.items.slice(index);
          }
          return props.items.slice(-2);
        })()
      : props.items;
  const activeStreamingState = useMemo(() => {
    for (let i = itemsToRender.length - 1; i >= 0; i -= 1) {
      const item = itemsToRender[i];
      if (
        item.type === 'message' &&
        item.role === 'assistant' &&
        item.stream?.streaming &&
        item.stream
      ) {
        return item.stream;
      }
    }
    return null;
  }, [itemsToRender]);
  const loadingStreamState = useMemo(
    () => (props.loading ? createInitialAgentStreamUiState() : null),
    [props.loading],
  );
  const streamAccentSource = activeStreamingState ?? loadingStreamState;
  const streamAccentStyle = streamAccentSource
    ? ({ '--stream-accent': getStreamRailAccentColor(streamAccentSource) } as React.CSSProperties)
    : undefined;
  const effectiveClosingSummary =
    props.closingSummary ??
    (props.compactClosedView && !props.showFullChat
      ? buildChatClosureSummary({
          chatId:
            props.activeThreadId === 'chat-2'
              ? 'chat-2'
              : props.activeThreadId === 'chat-3'
                ? 'chat-3'
                : 'chat-1',
          userMessage:
            [...itemsToRender]
              .reverse()
              .find((item): item is Extract<ChatItem, { type: 'message'; role: 'user' }> =>
                item.type === 'message' && item.role === 'user',
              )?.content ?? '',
          assistantMessage:
            [...itemsToRender]
              .reverse()
              .find((item): item is Extract<ChatItem, { type: 'message'; role: 'assistant' }> =>
                item.type === 'message' && item.role === 'assistant',
              )?.content ?? '',
          turnsRemaining: 0,
        })
      : null);
  function renderChatItem(
    it: ChatItem,
    i: number,
    attachedCitations: Array<Extract<ChatItem, { type: 'citation' }>['citation']> = []
  ) {
    const messagePanelAction =
      it.type === 'message' && it.role === 'assistant' ? it.panel_action : undefined;

    if (it.type === 'upload') {
      return (
        <div key={i} className="agent-bubble user upload-bubble">
          <UserUploadBubble
            files={it.files.map((file) => ({
              name: file.name,
              mime: file.mime,
              kind: file.kind ?? 'document',
              sizeLabel: file.sizeLabel,
              previewUrl: file.previewUrl,
            }))}
            status={it.status}
            maxFiles={MAX_CHAT_UPLOAD_FILES}
          />
        </div>
      );
    }

    if (it.type === 'message') {
      if (it.role === 'assistant') {
        const isFirstAssistantCard = !itemsToRender.slice(0, i).some(
          (entry) => entry.type === 'message' && entry.role === 'assistant'
        );
        const funnelStage = props.activeThreadId === 'chat-2' ? props.actionPlanFunnelStage : null;
        const docMeta =
          props.activeThreadId === 'chat-2'
            ? {
                kicker:
                  funnelStage === 'deliver'
                    ? 'Plan ejecutivo'
                    : funnelStage === 'converge'
                    ? 'Convergencia'
                    : 'Exploración',
                title:
                  funnelStage === 'deliver'
                    ? 'Plan de acción personalizado'
                    : 'Estrategia financiera · Chile',
                subtitle:
                  funnelStage === 'deliver'
                    ? 'Documento senior listo para ejecutar — decisión 100% tuya.'
                    : funnelStage === 'converge'
                    ? 'Afinando prioridades y secuencia tentativa con tu contexto y mercado vivo.'
                    : 'Lluvia de ideas anclada a tu diagnóstico, presupuesto y señal de mercado.',
              }
            : props.activeThreadId === 'chat-3'
            ? {
                kicker: 'Conciencia social',
                title: 'Informe de criterio financiero',
                subtitle:
                  'Lectura filosófica, responsabilidad social y prudencia normativa aplicada.',
              }
            : {
                kicker: isFirstAssistantCard ? 'Punto de partida' : chat1Copy.threadKicker,
                title: props.diagnosisUnlocked
                  ? 'Chat general'
                  : isFirstAssistantCard
                  ? 'Informe inicial de diagnóstico'
                  : chat1Copy.threadTitle,
                subtitle: props.diagnosisUnlocked
                  ? 'Síntesis profesional del contexto, evidencia disponible y próximos pasos.'
                  : isFirstAssistantCard
                  ? 'Introducción ejecutiva personalizada — evidencia real, simulación normativa y ruta de decisión.'
                  : chat1Copy.threadSubtitle,
              };
        const isStreaming = Boolean(it.stream?.streaming);
        const isScrollable = shouldEnableBubbleScroll(it.content ?? '');
        const blocks = Array.isArray(it.agent_blocks) ? it.agent_blocks : [];
        const isEmptyWelcomeShell =
          !isStreaming &&
          isWelcomeCarouselShellItem(
            it,
            i,
            itemsToRender,
            props.activeThreadId,
            props.diagnosisUnlocked,
          );
        const questionnaireBlocks = props.diagnosisUnlocked
          ? blocks.filter((b) => b.type === 'questionnaire')
          : [];
        const technicalBlocks = blocks.filter(
          (b) => b.type !== 'questionnaire' && b.type !== 'executive_intro'
        );
        const isChatErrorBubble =
          !isStreaming &&
          !isEmptyWelcomeShell &&
          isRecoverableChatErrorMessage(String(it.content ?? ''));

        return (
          <React.Fragment key={i}>
            {isStreaming && !isEmptyWelcomeShell && it.stream ? (
              <AgentStreamRail state={it.stream} />
            ) : null}
            <>
            <div
              className={
                isChatErrorBubble
                  ? 'agent-bubble assistant agent-bubble--chat-error'
                  : welcomeShellBubbleClasses({
                      isEmptyWelcomeShell,
                      activeThreadId: props.activeThreadId,
                      diagnosisUnlocked: props.diagnosisUnlocked,
                      isScrollable,
                      isFirstAssistantCard,
                      isStreaming,
                      funnelStage,
                    })
              }
              {...(isEmptyWelcomeShell ? { 'data-chat-welcome-shell': 'true' } : {})}
            >
              {!isEmptyWelcomeShell && !isChatErrorBubble ? (
                <div className="latex-doc-head">
                  <div className="latex-doc-heading">
                    <span className="latex-doc-kicker">{docMeta.kicker}</span>
                    <span className="latex-doc-title">{docMeta.title}</span>
                    <span className="latex-doc-subtitle">{docMeta.subtitle}</span>
                  </div>
                  <div className="latex-doc-head-actions">
                    <span className="latex-doc-mode" style={docModePillStyle}>
                      {(it.mode ?? 'analysis').toString().replaceAll('_', ' ')}
                    </span>
                    <button
                      type="button"
                      className="latex-doc-save-btn"
                      disabled={Boolean(savingBubblePdf[i])}
                      onClick={(e) => {
                        const btn = e.currentTarget as HTMLButtonElement;
                        const bubbleEl = btn.closest('.agent-bubble.assistant.latex-doc') as HTMLElement | null;
                        setSavingBubblePdf((prev) => ({ ...prev, [i]: true }));
                        void (async () => {
                          try {
                            if (!bubbleEl) throw new Error('Bubble not found');
                            const externalCitations = attachedCitations.filter(isExternalCitation);
                            const snapshot = buildBubbleSnapshotHtmlAndCss(bubbleEl, {
                              kicker: docMeta.kicker,
                              title: docMeta.title,
                              subtitle: docMeta.subtitle,
                              badge: (it.mode ?? 'analysis').toString().replaceAll('_', ' '),
                              citations: externalCitations.map((citation) => ({
                                title: citation.title,
                                source: citation.source,
                                url: citation.url,
                              })),
                            });
                            const result = await saveBubbleSnapshotPdfArtifact({
                              title: docMeta.title,
                              subtitle: docMeta.subtitle,
                              html: snapshot.html,
                              css: snapshot.css,
                            });
                            const artifact = result.artifact;
                            const pdfFilename = `${docMeta.title.replace(/\s+/g, '-').slice(0, 48)}.pdf`;
                            if (artifact.fileUrl) {
                              await downloadArtifactFile(artifact.fileUrl, pdfFilename);
                            }
                            const reportId = `${artifact.id}-${Date.now()}`;
                            const report: SavedReport = {
                              id: reportId,
                              title: artifact.title,
                              group: props.classifyReportGroup(artifact.title, artifact.source),
                              fileUrl: artifact.fileUrl ?? '',
                              createdAt: artifact.createdAt,
                            };
                            props.setSavedReports((prev) =>
                              [report, ...prev.filter((r) => r.fileUrl !== report.fileUrl)]
                            );
                            const sourceRect = btn.getBoundingClientRect();
                            props.launchDocToLibraryAnimation(
                              artifact.title,
                              sourceRect,
                              artifact.previewImageUrl ?? artifact.fileUrl ?? '',
                              reportId
                            );
                          } catch (error) {
                            const detail =
                              error instanceof Error && error.message
                                ? error.message
                                : 'Error desconocido';
                            props.setItemsForActive((prev) => [
                              ...prev,
                              {
                                type: 'message',
                                role: 'assistant',
                                content: `No pude guardar el PDF de esta burbuja. ${detail}`,
                                mode: 'information',
                              } as ChatItem,
                            ]);
                          } finally {
                            setSavingBubblePdf((prev) => ({ ...prev, [i]: false }));
                          }
                        })();
                      }}
                    >
                      {savingBubblePdf[i] ? 'Guardando…' : 'Guardar PDF'}
                    </button>
                  </div>
                </div>
              ) : null}
              <div
                className={welcomeShellBodyClasses({
                  isEmptyWelcomeShell,
                  activeThreadId: props.activeThreadId,
                  diagnosisUnlocked: props.diagnosisUnlocked,
                  isScrollable,
                })}
              >
                {isEmptyWelcomeShell ? (
                  renderChatIntroCard({
                    activeThreadId: props.activeThreadId,
                    diagnosisUnlocked: props.diagnosisUnlocked,
                    sessionUserName: props.sessionUserName,
                    sessionInjectedIntake: props.sessionInjectedIntake,
                    diagnosisProfile: props.diagnosisProfile,
                    preferExecutiveCarousel: props.activeThreadId === 'chat-1',
                  })
                ) : isChatErrorBubble ? (
                  <p className="agent-bubble--chat-error-text">
                    {sanitizeMessageText(it.content ?? '')}
                  </p>
                ) : (
                  <>
                    {(it.content ?? '').trim().length > 0 ? (
                      <div className="premium-markdown">
                        {renderLatexDocMessage(sanitizeMessageText(it.content ?? ''))}
                      </div>
                    ) : null}
                  </>
                )}
                {questionnaireBlocks.length > 0 && (
                  <div className="latex-inline-questionnaire">
                    <AgentBlocksRenderer
                      blocks={questionnaireBlocks}
                      onQuestionnaireSubmit={({ message }) => {
                        void props.onSend(message);
                      }}
                    />
                  </div>
                )}
                {technicalBlocks.length > 0 && (
                  <div className="latex-inline-annex">
                    <div className="latex-inline-annex-head">
                      <span>Anexos técnicos</span>
                      <span>evidencia viva</span>
                    </div>
                    <AgentBlocksRenderer
                      blocks={technicalBlocks}
                      onQuestionnaireSubmit={({ message }) => {
                        void props.onSend(message);
                      }}
                    />
                  </div>
                )}
                {(() => {
                  const externalCitations = attachedCitations.filter(isExternalCitation);
                  if (externalCitations.length === 0) return null;
                  const expanded = Boolean(props.expandedCitationsByMessage[i]);
                  const visibleCitations = expanded ? externalCitations : externalCitations.slice(0, 3);
                  const remaining = Math.max(0, externalCitations.length - visibleCitations.length);
                  return (
                  <div className="latex-inline-annex">
                    <div className="latex-inline-annex-head">
                      <span>Fuentes verificables</span>
                      <span>{externalCitations.length} referencias</span>
                    </div>
                    <div className="citation-stack">
                      {visibleCitations.map((citation, idx) => (
                        <CitationBubble key={`${i}-citation-${idx}`} citation={citation} />
                      ))}
                    </div>
                    {externalCitations.length > 3 && (
                      <button
                        type="button"
                        className="citation-toggle"
                        style={{
                          color: '#ffffff',
                          WebkitTextFillColor: '#ffffff',
                          opacity: 1,
                          filter: 'none',
                        }}
                        onClick={() =>
                          props.setExpandedCitationsByMessage((prev) => ({
                            ...prev,
                            [i]: !expanded,
                          }))
                        }
                      >
                        <span
                          className="citation-toggle-label"
                          style={{
                            color: '#ffffff',
                            WebkitTextFillColor: '#ffffff',
                            opacity: 1,
                            filter: 'none',
                          }}
                        >
                          {expanded ? 'Ver menos' : `Ver todas${remaining > 0 ? ` (+${remaining})` : ''}`}
                        </span>
                      </button>
                    )}
                  </div>
                  );
                })()}
              </div>
            </div>
            {messagePanelAction?.section &&
            !isEmptyWelcomeShell &&
            !onboardingFlowModel &&
            !(
              props.diagnosisUnlocked &&
              props.activeThreadId === 'chat-1' &&
              (messagePanelAction.section === 'transactions' || messagePanelAction.section === 'products_transactions')
            ) && (
              renderAgentPanelActionRow(messagePanelAction, () =>
                props.onPanelAction(messagePanelAction!),
              )
            )}
            </>
          </React.Fragment>
        );
      }
      const isScrollable = shouldEnableBubbleScroll(it.content);
      const textContent = sanitizeMessageText(it.content ?? '');
      const assistantLooksMarkdown =
        /(\*\*|`|^#{1,6}\s|^\s*[-*+]\s+|^\s*\d+\.\s+|\$\$[\s\S]+?\$\$|\$[^$\n]+\$)/m.test(textContent);
      return (
        <div
          key={i}
          className={`agent-bubble ${it.role} ${isScrollable ? 'is-scrollable-bubble' : ''}`}
        >
          {it.role === 'user' ? (
            <div className="agent-msg-tag">
              <span className="agent-msg-tag-prefix">$ whoami</span>
              <span className="agent-msg-tag-value">{userTag}</span>
            </div>
          ) : null}
          <div className="agent-bubble-text">
            {assistantLooksMarkdown ? renderLatexDocMessage(textContent) : textContent}
          </div>
        </div>
      );
    }
    if (it.type === 'artifact') {
      return (
        <div key={i} className="agent-bubble assistant artifact">
          <DocumentBubble
            artifact={it.artifact}
            onSaved={({ artifact, publicUrl, sourceRect }) => {
              void (async () => {
                let storedUrl = publicUrl;
                try {
                  if (artifact.type === 'pdf' && artifact.fileUrl) {
                    const saved = await savePdfArtifact(artifact);
                    if (saved?.publicUrl) storedUrl = saved.publicUrl;
                  }
                } catch {}

                const reportId = `${artifact.id}-${Date.now()}`;
                const report: SavedReport = {
                  id: reportId,
                  title: artifact.title,
                  group: props.classifyReportGroup(artifact.title, artifact.source),
                  fileUrl: storedUrl,
                  previewImageUrl: artifact.previewImageUrl || undefined,
                  createdAt: new Date().toISOString(),
                };
                props.setSavedReports((prev) => [report, ...prev.filter((r) => r.fileUrl !== storedUrl)]);
                if (sourceRect) {
                  props.launchDocToLibraryAnimation(
                    artifact.title,
                    sourceRect,
                    artifact.previewImageUrl ?? storedUrl,
                    reportId
                  );
                }
              })();
            }}
          />
        </div>
      );
    }
    if (it.type === 'citation') {
      if (!isExternalCitation(it.citation)) return null;
      return (
        <div key={i} className="agent-bubble assistant citation">
          <CitationBubble citation={it.citation} />
        </div>
      );
    }
    return null;
  }

  const rendered: ReactNode[] = [];
  for (let idx = 0; idx < itemsToRender.length; idx += 1) {
    const it = itemsToRender[idx];
    if (it.type === 'message' && it.role === 'assistant') {
      const citations: Array<Extract<ChatItem, { type: 'citation' }>['citation']> = [];
      let j = idx + 1;
      while (j < itemsToRender.length && itemsToRender[j].type === 'citation') {
        citations.push((itemsToRender[j] as Extract<ChatItem, { type: 'citation' }>).citation);
        j += 1;
      }
      rendered.push(renderChatItem(it, idx, citations));
      idx = j - 1;
      continue;
    }
    if (it.type === 'citation') {
      const prev = idx > 0 ? itemsToRender[idx - 1] : null;
      const groupedWithPrevious = prev && prev.type === 'message' && prev.role === 'assistant';
      if (groupedWithPrevious) continue;
    }
    rendered.push(renderChatItem(it, idx));
  }

  // UX decision: hide suggested-reply chips from thread top area to keep the
  // opening flow focused and avoid visual noise before/after first turns.

  return (
    <div ref={props.chatThreadRef} className="agent-thread" style={streamAccentStyle}>
        {rendered.length === 0 && !props.loading ? (
          <div
            className={`agent-bubble assistant latex-doc is-intro-doc${
              props.activeThreadId === 'chat-1' ||
              !isCompactChatIntroShell({
                activeThreadId: props.activeThreadId,
                diagnosisUnlocked: props.diagnosisUnlocked,
              })
                ? ' is-empty-welcome'
                : ' is-chat-intro-shell'
            }`}
            data-chat-welcome-shell="true"
          >
            <div
              className={
                isCompactChatIntroShell({
                  activeThreadId: props.activeThreadId,
                  diagnosisUnlocked: props.diagnosisUnlocked,
                })
                  ? 'latex-doc-body is-chat-intro-body'
                  : 'latex-doc-body is-empty-welcome-body'
              }
            >
              {renderChatIntroCard({
                activeThreadId: props.activeThreadId,
                diagnosisUnlocked: props.diagnosisUnlocked,
                sessionUserName: props.sessionUserName,
                sessionInjectedIntake: props.sessionInjectedIntake,
                diagnosisProfile: props.diagnosisProfile,
                preferExecutiveCarousel: props.activeThreadId === 'chat-1',
              })}
            </div>
          </div>
        ) : null}
        {rendered}

        {props.loading && !activeStreamingState && loadingStreamState ? (
          <AgentStreamRail state={loadingStreamState} />
        ) : null}

        {effectiveClosingSummary && !props.showFullChat ? (
          <div className="agent-bubble assistant latex-doc is-intro-doc is-empty-welcome is-closure-welcome">
            <div className="latex-doc-body is-empty-welcome-body">
              <ClosureGradientBlobCard
                className="gradient-blob-card--welcome gradient-blob-card--closure"
                summary={effectiveClosingSummary}
              />
            </div>
          </div>
        ) : null}

        {onboardingFlowModel ? (
          <OnboardingFlowCta
            model={onboardingFlowModel}
            variant="thread"
            onAction={() =>
              props.onPanelAction({
                section: onboardingFlowModel.section,
                message: onboardingFlowModel.body,
              })
            }
          />
        ) : null}
    </div>
  );
});
