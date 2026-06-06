import React, { memo, useState, type ReactNode } from 'react';

import { DocumentBubble } from '@/components/conversation/DocumentBubble';
import { CitationBubble } from '@/components/conversation/CitationBubble';
import { AgentBlocksRenderer } from '@/components/agent/AgentBlocksRenderer';
import { saveBubbleSnapshotPdfArtifact, savePdfArtifact } from '@/lib/artifacts';
import type { ChatItem } from '@/lib/agent.response.types';
import { sanitizeMessageText } from './page.utils';
import { renderLatexDocMessage } from './message-renderer';

const DOC_MODE_PILL_STYLE: React.CSSProperties = {
  background: '#000000',
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

function collectBubbleSnapshotCss(bubbleEl: HTMLElement) {
  const cssParts: string[] = [];
  const addRule = (text: string) => {
    if (!text || cssParts.includes(text)) return;
    cssParts.push(text);
  };

  const classes = Array.from(bubbleEl.classList)
    .map((c) => `.${c}`)
    .concat([
      '.agent-bubble',
      '.assistant',
      '.latex-doc',
      '.latex-doc-head',
      '.latex-doc-heading',
      '.latex-doc-kicker',
      '.latex-doc-title',
      '.latex-doc-subtitle',
      '.latex-doc-mode',
      '.latex-doc-body',
      '.latex-inline-annex',
      '.latex-inline-annex-head',
      '.citation-stack',
      '.citation-bubble',
      '.citation-link',
      '.premium-markdown',
      '.academic-paper',
      '.md-h1',
      '.md-h2',
      '.md-h3',
      '.md-h4',
      '.md-h5',
      '.md-h6',
      '.md-paragraph',
      '.md-list',
      '.md-list-ordered',
      '.md-list-item',
      '.md-table',
      '.katex',
      '.katex-display',
      '.katex-inline',
      '.md-math-block',
      '.agent-chart-card',
      '.agent-chart-head',
      '.agent-chart-title',
      '.agent-chart-subtitle',
      '.agent-chart-canvas',
      'svg',
      'table',
      'th',
      'td',
      'a',
      'p',
      'ul',
      'ol',
      'li',
      ':root',
      'body',
      'html',
    ]);

  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSStyleRule) {
        const selector = rule.selectorText || '';
        if (classes.some((s) => selector.includes(s))) addRule(rule.cssText);
        continue;
      }
      if (rule instanceof CSSMediaRule) {
        const nested: string[] = [];
        for (const nestedRule of Array.from(rule.cssRules)) {
          if (
            nestedRule instanceof CSSStyleRule &&
            classes.some((s) => (nestedRule.selectorText || '').includes(s))
          ) {
            nested.push(nestedRule.cssText);
          }
        }
        if (nested.length > 0) addRule(`@media ${rule.conditionText}{${nested.join('\n')}}`);
        continue;
      }
      if (rule instanceof CSSKeyframesRule) {
        addRule(rule.cssText);
      }
    }
  }

  return cssParts.join('\n');
}

function buildBubbleSnapshotHtmlAndCss(bubbleEl: HTMLElement) {
  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const clonedBubble = bubbleEl.cloneNode(true) as HTMLElement;
  clonedBubble.classList.add('bubble-pdf-paper');
  clonedBubble.classList.remove('is-scrollable-bubble');

  // Remove all interactive controls from exported PDF snapshot.
  clonedBubble.querySelectorAll('button, input, textarea, select, [role="button"]').forEach((el) => {
    el.remove();
  });

  // Avoid preserving scroll clipping in PDF; render full content instead.
  clonedBubble
    .querySelectorAll('.is-scrollable-bubble, .is-scrollable-content')
    .forEach((el) => el.classList.remove('is-scrollable-bubble', 'is-scrollable-content'));

  const kickerText =
    clonedBubble.querySelector('.latex-doc-kicker')?.textContent?.trim() ||
    clonedBubble.querySelector('.chat-sheet-tab-title')?.textContent?.trim() ||
    'CHAT GENERAL';
  const titleText =
    clonedBubble.querySelector('.latex-doc-title, .latex-doc-h1, .md-h1')?.textContent?.trim() || 'Chat general';
  const subtitleText =
    clonedBubble.querySelector('.latex-doc-subtitle, .latex-doc-mode')?.textContent?.trim() ||
    'Síntesis profesional del contexto, evidencia disponible y próximos pasos.';
  const badgeText =
    clonedBubble.querySelector('.latex-doc-mode')?.textContent?.trim() || 'EDUCATION';

  const exportCss = `
@page {
  size: A4;
  margin: 0;
}

html, body, .bubble-pdf-snapshot {
  margin: 0 !important;
  padding: 0 !important;
  background: #f5f1e8 !important;
}

.bubble-pdf-snapshot .agent-bubble.assistant.latex-doc,
.bubble-pdf-snapshot .agent-bubble.assistant.latex-doc * {
  color: #1c3145 !important;
  -webkit-text-fill-color: #1c3145 !important;
  text-shadow: none !important;
}

.bubble-pdf-snapshot {
  width: 100% !important;
  min-height: auto !important;
  box-sizing: border-box !important;
  padding: 12mm 12mm 14mm 12mm !important;
  -webkit-box-decoration-break: clone !important;
  box-decoration-break: clone !important;
}

.bubble-pdf-snapshot,
.bubble-pdf-snapshot * {
  opacity: 1 !important;
  filter: none !important;
  mix-blend-mode: normal !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}

.bubble-pdf-snapshot,
.bubble-pdf-snapshot .bubble-pdf-paper,
.bubble-pdf-snapshot .bubble-pdf-paper * {
  background-color: #f5f1e8 !important;
}

.bubble-pdf-running-brand {
  position: static;
  display: block;
  margin: 0 0 3mm 0;
  text-align: center;
  font-size: 10px;
  line-height: 1;
  letter-spacing: 0;
  text-transform: none;
  color: #1a3047;
  font-weight: 600;
  font-family: "Times New Roman", Times, Georgia, serif;
}

.bubble-pdf-running-header {
  position: static;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  margin: 0 0 10mm 0;
  padding: 0 2px 4px 2px;
  border-bottom: 1px solid rgba(28, 49, 69, 0.1);
  background: #f5f1e8 !important;
}

.bubble-pdf-running-header-copy {
  min-width: 0;
  color: #1b3046 !important;
}

.bubble-pdf-running-kicker {
  margin: 0 0 3mm 0;
  font-size: 9px;
  letter-spacing: .18em;
  text-transform: uppercase;
  color: #46698f !important;
  font-weight: 700;
}

.bubble-pdf-running-title {
  margin: 0 0 1.5mm 0;
  font-size: 21px;
  line-height: 1.1;
  color: #132b40 !important;
  font-weight: 700;
}

.bubble-pdf-running-subtitle {
  margin: 0;
  font-size: 10px;
  line-height: 1.25;
  color: #2b3f53 !important;
  max-width: 70ch;
}

.bubble-pdf-running-badge {
  border: 1px solid rgba(53, 94, 137, 0.9);
  border-radius: 999px;
  padding: 1.4mm 3.4mm;
  font-size: 9px;
  letter-spacing: .16em;
  text-transform: uppercase;
  color: #355f89 !important;
  font-weight: 700;
  white-space: nowrap;
}

.bubble-pdf-snapshot .bubble-pdf-paper {
  width: 100% !important;
  max-width: none !important;
  min-width: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
  box-sizing: border-box !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  border: 0 !important;
  background: #f5f1e8 !important;
  overflow: visible !important;
  break-inside: auto !important;
  page-break-inside: auto !important;
}

.bubble-pdf-snapshot .bubble-pdf-paper > :first-child {
  margin-top: 0 !important;
  padding-top: 0 !important;
}

.bubble-pdf-snapshot .bubble-pdf-paper .latex-doc-body,
.bubble-pdf-snapshot .bubble-pdf-paper .premium-markdown,
.bubble-pdf-snapshot .bubble-pdf-paper .academic-paper,
.bubble-pdf-snapshot .bubble-pdf-paper .latex-inline-annex {
  max-height: none !important;
  height: auto !important;
  overflow: visible !important;
  break-inside: auto !important;
  page-break-inside: auto !important;
}

.bubble-pdf-snapshot .bubble-pdf-paper .latex-doc-head,
.bubble-pdf-snapshot .bubble-pdf-paper .latex-doc-title,
.bubble-pdf-snapshot .bubble-pdf-paper .latex-doc-subtitle,
.bubble-pdf-snapshot .bubble-pdf-paper .md-h1,
.bubble-pdf-snapshot .bubble-pdf-paper .md-h2,
.bubble-pdf-snapshot .bubble-pdf-paper .md-h3 {
  break-after: avoid-page !important;
  page-break-after: avoid !important;
}

.bubble-pdf-snapshot .bubble-pdf-paper .latex-doc-head {
  display: none !important;
}

.bubble-pdf-snapshot .bubble-pdf-paper p,
.bubble-pdf-snapshot .bubble-pdf-paper li,
.bubble-pdf-snapshot .bubble-pdf-paper blockquote {
  orphans: 3;
  widows: 3;
  break-inside: auto !important;
  page-break-inside: auto !important;
}

.bubble-pdf-snapshot .bubble-pdf-paper pre,
.bubble-pdf-snapshot .bubble-pdf-paper code,
.bubble-pdf-snapshot .bubble-pdf-paper .latex-block,
.bubble-pdf-snapshot .bubble-pdf-paper .latex-doc-section,
.bubble-pdf-snapshot .bubble-pdf-paper .md-list,
.bubble-pdf-snapshot .bubble-pdf-paper .md-li {
  break-inside: auto !important;
  page-break-inside: auto !important;
}

.bubble-pdf-snapshot .bubble-pdf-paper pre,
.bubble-pdf-snapshot .bubble-pdf-paper code {
  white-space: pre-wrap !important;
  overflow-wrap: anywhere !important;
  word-break: break-word !important;
}

.bubble-pdf-snapshot .agent-bubble.assistant.latex-doc .latex-doc-kicker {
  color: #3a648b !important;
  -webkit-text-fill-color: #3a648b !important;
}

.bubble-pdf-snapshot .agent-bubble.assistant.latex-doc .latex-doc-title,
.bubble-pdf-snapshot .agent-bubble.assistant.latex-doc .latex-doc-h1,
.bubble-pdf-snapshot .agent-bubble.assistant.latex-doc .md-h1,
.bubble-pdf-snapshot .agent-bubble.assistant.latex-doc .md-h2,
.bubble-pdf-snapshot .agent-bubble.assistant.latex-doc .md-h3 {
  color: #10283d !important;
  -webkit-text-fill-color: #10283d !important;
}

.bubble-pdf-snapshot .agent-bubble.assistant.latex-doc a {
  color: #225b8e !important;
  -webkit-text-fill-color: #225b8e !important;
}

.bubble-pdf-snapshot .agent-bubble.assistant.latex-doc .latex-doc-mode {
  color: #2b547b !important;
  -webkit-text-fill-color: #2b547b !important;
}
`;

  return {
    html: `<div class="bubble-pdf-snapshot">
      <div class="bubble-pdf-running-brand">Financieramente</div>
      <header class="bubble-pdf-running-header">
        <div class="bubble-pdf-running-header-copy">
          <p class="bubble-pdf-running-kicker">${escapeHtml(kickerText)}</p>
          <h1 class="bubble-pdf-running-title">${escapeHtml(titleText)}</h1>
          <p class="bubble-pdf-running-subtitle">${escapeHtml(subtitleText)}</p>
        </div>
        <div class="bubble-pdf-running-badge">${escapeHtml(badgeText)}</div>
      </header>
      ${clonedBubble.outerHTML}
    </div>`,
    css: `${collectBubbleSnapshotCss(bubbleEl)}\n${exportCss}`,
  };
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
  expandedCitationsByMessage: Record<number, boolean>;
  setExpandedCitationsByMessage: React.Dispatch<React.SetStateAction<Record<number, boolean>>>;
  onSend: (messageOverride?: string) => void;
  setDraftForActive: (value: string) => void;
  sessionInjectedIntake?: unknown;
  chatThreadRef: React.RefObject<HTMLDivElement>;
  activeChatId: string;
  actionPlanFunnelStage?: 'brainstorm' | 'converge' | 'deliver' | null;
  setItemsForActive: React.Dispatch<React.SetStateAction<ChatItem[]>>;
  classifyReportGroup: (title: string, source?: string) => SavedReport['group'];
  setSavedReports: React.Dispatch<React.SetStateAction<SavedReport[]>>;
  launchDocToLibraryAnimation: (title: string, sourceRect: DOMRect, previewUrl: string, reportId: string) => void;
  onPanelAction: (action: NonNullable<Extract<ChatItem, { type: 'message'; role: 'assistant' }>['panel_action']>) => void;
  flowPanelAction?: NonNullable<Extract<ChatItem, { type: 'message'; role: 'assistant' }>['panel_action']>;
}) {
  const [savingBubblePdf, setSavingBubblePdf] = useState<Record<number, boolean>>({});
  const EMPTY_THREAD_FALLBACK =
    'Estoy listo para iniciar tu diagnóstico financiero. Cuéntame tu objetivo principal y partimos con el primer paso accionable.';
  const userTag = String(props.sessionUserName ?? 'USER').trim().split(' ')[0] || 'USER';

  function renderChatItem(
    it: ChatItem,
    i: number,
    attachedCitations: Array<Extract<ChatItem, { type: 'citation' }>['citation']> = []
  ) {
    const messagePanelAction =
      it.type === 'message' && it.role === 'assistant' ? it.panel_action : undefined;
    const shouldHidePrimaryFlowAction =
      props.activeThreadId === 'chat-1' &&
      Boolean(props.flowPanelAction?.section) &&
      Boolean(messagePanelAction?.section) &&
      props.flowPanelAction?.section === messagePanelAction?.section;

    if (it.type === 'upload') {
      return (
        <div key={i} className="agent-bubble user upload-bubble">
          <div className="agent-upload-list">
            {it.files.map((file, idx) => (
              <div key={`${file.name}-${idx}`} className="agent-upload-item">
                {file.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={file.previewUrl} alt={file.name} className="agent-upload-thumb" />
                ) : (
                  <div className="agent-upload-fileicon" aria-hidden="true">📄</div>
                )}
                <span className="agent-upload-name">{file.name}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (it.type === 'message') {
      if (it.role === 'assistant') {
        const isFirstAssistantCard = !props.items.slice(0, i).some(
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
                kicker: props.diagnosisUnlocked ? 'Chat general' : isFirstAssistantCard ? 'Punto de partida' : 'Diagnóstico',
                title: props.diagnosisUnlocked
                  ? 'Chat general'
                  : isFirstAssistantCard
                  ? 'Lectura inicial del caso'
                  : 'Informe diagnóstico financiero',
                subtitle:
                  'Síntesis profesional del contexto, evidencia disponible y próximos pasos.',
              };
        const isScrollable = shouldEnableBubbleScroll(it.content ?? '');
        const blocks = Array.isArray(it.agent_blocks) ? it.agent_blocks : [];
        const questionnaireBlocks = props.diagnosisUnlocked
          ? blocks.filter((b) => b.type === 'questionnaire')
          : [];
        const technicalBlocks = blocks.filter((b) => b.type !== 'questionnaire');
        return (
          <React.Fragment key={i}>
            <div
              className={`agent-bubble assistant latex-doc ${isScrollable ? 'is-scrollable-bubble' : ''}${isFirstAssistantCard ? ' is-intro-doc' : ''}${funnelStage === 'deliver' ? ' is-action-plan-deliver' : funnelStage ? ` is-action-plan-${funnelStage}` : ''}`}
            >
              <div className="latex-doc-head">
                <div className="latex-doc-heading">
                  <span className="latex-doc-kicker">{docMeta.kicker}</span>
                  <span className="latex-doc-title">{docMeta.title}</span>
                  <span className="latex-doc-subtitle">{docMeta.subtitle}</span>
                </div>
                <div className="latex-doc-head-actions">
                  <span className="latex-doc-mode" style={DOC_MODE_PILL_STYLE}>
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
                          const snapshot = buildBubbleSnapshotHtmlAndCss(bubbleEl);
                          const result = await saveBubbleSnapshotPdfArtifact({
                            title: docMeta.title,
                            subtitle: docMeta.subtitle,
                            html: snapshot.html,
                            css: snapshot.css,
                          });
                          const artifact = result.artifact;
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
                        } catch {
                          props.setItemsForActive((prev) => [
                            ...prev,
                            {
                              type: 'message',
                              role: 'assistant',
                              content:
                                'No pude guardar el PDF de esta burbuja en biblioteca. Reintenta en unos segundos.',
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
              <div className={`latex-doc-body ${isScrollable ? 'is-scrollable-content' : ''}`}>
                {renderLatexDocMessage(sanitizeMessageText(it.content ?? ''))}
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
            !(
              props.diagnosisUnlocked &&
              props.activeThreadId === 'chat-1' &&
              (messagePanelAction.section === 'transactions' || messagePanelAction.section === 'products_transactions')
            ) &&
            !shouldHidePrimaryFlowAction && (
              <div className="agent-inline-panel-action">
                <button
                  type="button"
                  className="agent-inline-panel-button"
                  onClick={() => props.onPanelAction(messagePanelAction!)}
                >
                  {messagePanelAction.section === 'transactions' || messagePanelAction.section === 'products_transactions'
                    ? 'Abrir productos y transacciones'
                    : messagePanelAction.section === 'budget'
                    ? 'Abrir presupuesto'
                    : messagePanelAction.section === 'interview'
                    ? 'Abrir entrevista'
                    : 'Abrir panel'}
                </button>
                {messagePanelAction.message ? (
                  <span className="agent-inline-panel-note">{messagePanelAction.message}</span>
                ) : null}
              </div>
            )}
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
  for (let idx = 0; idx < props.items.length; idx += 1) {
    const it = props.items[idx];
    if (it.type === 'message' && it.role === 'assistant') {
      const citations: Array<Extract<ChatItem, { type: 'citation' }>['citation']> = [];
      let j = idx + 1;
      while (j < props.items.length && props.items[j].type === 'citation') {
        citations.push((props.items[j] as Extract<ChatItem, { type: 'citation' }>).citation);
        j += 1;
      }
      rendered.push(renderChatItem(it, idx, citations));
      idx = j - 1;
      continue;
    }
    if (it.type === 'citation') {
      const prev = idx > 0 ? props.items[idx - 1] : null;
      const groupedWithPrevious = prev && prev.type === 'message' && prev.role === 'assistant';
      if (groupedWithPrevious) continue;
    }
    rendered.push(renderChatItem(it, idx));
  }

  const flowPanelAction =
    props.activeThreadId === 'chat-1' && !props.diagnosisUnlocked
      ? props.flowPanelAction
      : undefined;

  // UX decision: hide suggested-reply chips from thread top area to keep the
  // opening flow focused and avoid visual noise before/after first turns.

  return (
    <div ref={props.chatThreadRef} className="agent-thread">
        {rendered.length === 0 && !props.loading && (
          <div className="agent-bubble assistant latex-doc is-intro-doc">
            <div className="latex-doc-head">
              <div className="latex-doc-heading">
                <span className="latex-doc-kicker">Punto de partida</span>
                <span className="latex-doc-title">Inicio de conversación</span>
                <span className="latex-doc-subtitle">Contexto base y siguiente acción</span>
              </div>
              <span className="latex-doc-mode" style={DOC_MODE_PILL_STYLE}>information</span>
            </div>
            <div className="latex-doc-body">
              {renderLatexDocMessage(EMPTY_THREAD_FALLBACK)}
            </div>
          </div>
        )}
        {rendered}

        {flowPanelAction?.section ? (
          <div className="agent-flow-cta agent-flow-cta--thread">
            <button
              type="button"
              className="agent-flow-cta-button"
              onClick={() => props.onPanelAction(flowPanelAction)}
            >
              {flowPanelAction.section === 'transactions' || flowPanelAction.section === 'products_transactions'
                ? 'Abrir productos y transacciones'
                : flowPanelAction.section === 'budget'
                ? 'Abrir presupuesto'
                : flowPanelAction.section === 'interview'
                ? 'Abrir entrevista'
                : 'Abrir panel'}
            </button>
            {flowPanelAction.message ? (
              <span className="agent-flow-cta-copy">{flowPanelAction.message}</span>
            ) : null}
          </div>
        ) : null}
    </div>
  );
});
