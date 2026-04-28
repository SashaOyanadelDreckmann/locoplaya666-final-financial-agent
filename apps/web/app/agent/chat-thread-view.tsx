import React, { memo, type ReactNode } from 'react';
import { DocumentBubble } from '@/components/conversation/DocumentBubble';
import { CitationBubble } from '@/components/conversation/CitationBubble';
import { AgentBlocksRenderer } from '@/components/agent/AgentBlocksRenderer';
import { savePdfArtifact } from '@/lib/artifacts';
import type { ChatItem } from '@/lib/agent.response.types';
import { buildInitialAgentSuggestions, sanitizeMessageText } from './page.utils';
import { renderLatexDocMessage } from './message-renderer';

type SavedReport = {
  id: string;
  title: string;
  group: 'plan_action' | 'simulation' | 'budget' | 'diagnosis' | 'other';
  fileUrl: string;
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
  activeThreadId?: string;
  activeThreadLabel?: string;
  expandedCitationsByMessage: Record<number, boolean>;
  setExpandedCitationsByMessage: React.Dispatch<React.SetStateAction<Record<number, boolean>>>;
  onSend: (messageOverride?: string) => void;
  setDraftForActive: (value: string) => void;
  sessionInjectedIntake?: unknown;
  chatThreadRef: React.RefObject<HTMLDivElement>;
  latestActionReminder: { id: string; title: string; proposedDate: string } | null;
  activeChatId: string;
  setProductLifecycle: React.Dispatch<React.SetStateAction<any>>;
  setItemsForActive: React.Dispatch<React.SetStateAction<ChatItem[]>>;
  classifyReportGroup: (title: string, source?: string) => SavedReport['group'];
  setSavedReports: React.Dispatch<React.SetStateAction<SavedReport[]>>;
  launchDocToLibraryAnimation: (title: string, sourceRect: DOMRect, previewUrl: string, reportId: string) => void;
}) {
  function renderChatItem(
    it: ChatItem,
    i: number,
    attachedCitations: Array<Extract<ChatItem, { type: 'citation' }>['citation']> = []
  ) {
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
        const docMeta =
          props.activeThreadId === 'chat-2'
            ? {
                kicker: 'Plan de acción',
                title: 'Informe estratégico e inversiones',
                subtitle:
                  'Simulación, secuencia de decisiones, fechas críticas y resguardos regulatorios.',
              }
            : props.activeThreadId === 'chat-3'
            ? {
                kicker: 'Conciencia social',
                title: 'Informe de criterio financiero',
                subtitle:
                  'Lectura filosófica, responsabilidad social y prudencia normativa aplicada.',
              }
            : {
                kicker: isFirstAssistantCard ? 'Punto de partida' : 'Diagnóstico',
                title: isFirstAssistantCard ? 'Lectura inicial del caso' : 'Informe diagnóstico financiero',
                subtitle:
                  'Síntesis profesional del contexto, evidencia disponible y próximos pasos.',
              };
        const isScrollable = shouldEnableBubbleScroll(it.content ?? '');
        const blocks = Array.isArray(it.agent_blocks) ? it.agent_blocks : [];
        const questionnaireBlocks = blocks.filter((b) => b.type === 'questionnaire');
        const technicalBlocks = blocks.filter((b) => b.type !== 'questionnaire');
        return (
          <div
            key={i}
            className={`agent-bubble assistant latex-doc ${isScrollable ? 'is-scrollable-bubble' : ''}${isFirstAssistantCard ? ' is-intro-doc' : ''}`}
          >
            <div className="latex-doc-head">
              <div className="latex-doc-heading">
                {isFirstAssistantCard ? (
                  <span className="latex-doc-kicker">{docMeta.kicker}</span>
                ) : null}
                <span className="latex-doc-title">{docMeta.title}</span>
                <span className="latex-doc-subtitle">{docMeta.subtitle}</span>
              </div>
              <span className="latex-doc-mode">
                {(it.mode ?? 'analysis').toString().replaceAll('_', ' ')}
              </span>
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
                      onClick={() =>
                        props.setExpandedCitationsByMessage((prev) => ({
                          ...prev,
                          [i]: !expanded,
                        }))
                      }
                    >
                      {expanded ? 'Ver menos' : `Ver todas${remaining > 0 ? ` (+${remaining})` : ''}`}
                    </button>
                  )}
                </div>
                );
              })()}
            </div>
          </div>
        );
      }
      const isScrollable = shouldEnableBubbleScroll(it.content);
      return (
        <div
          key={i}
          className={`agent-bubble ${it.role} ${isScrollable ? 'is-scrollable-bubble' : ''}`}
        >
          <div className="agent-bubble-text">{sanitizeMessageText(it.content ?? '')}</div>
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

  const firstAssistant = props.items.find(
    (it) => it.type === 'message' && it.role === 'assistant'
  ) as Extract<(typeof props.items)[number], { type: 'message'; role: 'assistant' }> | undefined;
  const userMessagesCount = props.items.filter((it) => it.type === 'message' && it.role === 'user').length;
  const assistantMessagesCount = props.items.filter((it) => it.type === 'message' && it.role === 'assistant').length;
  const shouldShowOnlyInitialSuggestions = userMessagesCount === 0 && assistantMessagesCount === 1;
  const replies = [
    ...(firstAssistant?.suggested_replies ?? []),
    ...buildInitialAgentSuggestions(props.sessionInjectedIntake),
  ];
  const uniqueReplies = Array.from(new Set(replies)).slice(0, 12);
  const showSuggestions = !props.loading && shouldShowOnlyInitialSuggestions && uniqueReplies.length >= 8;

  return (
    <div className="agent-chat-body">
      <div ref={props.chatThreadRef} className="agent-thread">
        {rendered}

        {showSuggestions && (
          <div className="suggested-replies">
            {uniqueReplies.map((reply, i) => (
              <button
                key={`${reply}-${i}`}
                type="button"
                className="suggestion-chip"
                onClick={() => {
                  props.setDraftForActive(reply);
                  setTimeout(() => props.onSend(), 80);
                }}
              >
                {reply}
              </button>
            ))}
          </div>
        )}

        {props.loading && (
          <div className="agent-bubble assistant thinking-bubble" aria-live="polite" aria-label="El agente está escribiendo">
            <div className="typing-indicator" aria-hidden="true">
              <span className="thinking-dot" />
              <span className="thinking-dot" />
              <span className="thinking-dot" />
            </div>
          </div>
        )}

        {props.activeChatId === 'chat-2' && props.latestActionReminder && (
          <div className="agent-action-orb" role="status">
            <div>
              <strong>{props.latestActionReminder.title}</strong>
              <span>Fecha sugerida: {props.latestActionReminder.proposedDate}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                props.setProductLifecycle((prev: any) => ({
                  ...(prev ?? {}),
                  actionReminders: (prev?.actionReminders ?? []).map((item: any) =>
                    item.id === props.latestActionReminder?.id ? { ...item, status: 'queued' } : item
                  ),
                }));
                props.setItemsForActive((prev: ChatItem[]) => [
                  ...prev,
                  {
                    type: 'message',
                    role: 'assistant',
                    content:
                      'Recordatorio activado en cola local. En la siguiente iteración lo conectamos al envío real de correos programados.',
                    mode: 'information',
                  } as ChatItem,
                ]);
              }}
            >
              Activar correo
            </button>
          </div>
        )}
      </div>
    </div>
  );
});
