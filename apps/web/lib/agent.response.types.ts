export type Artifact = {
  id: string;
  type: 'pdf' | 'chart' | 'table';
  title: string;
  description?: string;
  fileUrl?: string;
  previewImageUrl?: string;
  source?: 'simulation' | 'analysis' | 'diagnostic';
  createdAt: string;
  saved?: boolean;
  meta?: Record<string, unknown>;
};
export type { AgentBlock } from './types/chat';
import type { AgentBlock, UIEvent } from './types/chat';

export type ToolCall = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
};

export type Citation = {
  id?: string;
  title?: string;
  url?: string;
  source: string;
};

export type AgentResponse = {
  message?: string;

  artifacts?: Artifact[];
  citations?: Citation[];

  tool_calls?: ToolCall[];
  ui_events?: UIEvent[];
  react?: { objective?: string };
  reasoning_mode?: string;

  // compat: algunos backends pueden mandar mode directo
  mode?: string;

  // bloques UI-rich (charts/documentos/etc.) usados por la pantalla /agent
  agent_blocks?: AgentBlock[];

  // sugerencias de respuesta rápida (chips interactivos)
  suggested_replies?: string[];

  // puntuación de contexto acumulado de la hoja (0-100), emitida por el agente
  context_score?: number;

  // acción de panel: el agente puede controlar qué sección destacar
  panel_action?: {
    section?: 'budget' | 'transactions' | 'library' | 'recents' | 'profile' | 'news' | 'objective' | 'mode';
    message?: string;
  };

  // actualizaciones de presupuesto inferidas de la conversación
  budget_updates?: Array<{
    label: string;
    type: 'income' | 'expense';
    amount: number;
    category?: string;
  }>;
  knowledge_score?: number;
  knowledge_event_detected?: boolean;
  milestone_unlocked?: {
    threshold: number;
    feature: string;
  };
};

export type ChatItem =
  | { type: 'message'; role: 'user'; content: string }
  | {
      type: 'upload';
      role: 'user';
      files: Array<{
        name: string;
        mime?: string;
        previewUrl?: string;
      }>;
    }
  | {
      type: 'message';
      role: 'assistant';
      content: string;
      mode?: string;
      objective?: string;
      agent_blocks?: AgentBlock[];
      suggested_replies?: string[];
    }
  | { type: 'artifact'; role: 'assistant'; artifact: Artifact }
  | { type: 'citation'; role: 'assistant'; citation: Citation };

export function toChatItemsFromAgentResponse(res: AgentResponse): ChatItem[] {
  const items: ChatItem[] = [];
  const hasArtifacts = Array.isArray(res?.artifacts) && res.artifacts.length > 0;
  const hasBlocks = Array.isArray(res?.agent_blocks) && res.agent_blocks.length > 0;
  const safeMessage =
    typeof res?.message === 'string' && res.message.trim().length > 0
      ? res.message
      : hasArtifacts || hasBlocks
      ? 'Entregable generado y anexado al chat. Puedes abrir, descargar o guardar el resultado.'
      : '';

  if (safeMessage) {
    items.push({
      type: 'message',
      role: 'assistant',
      content: safeMessage,
      mode: res.mode ?? res.reasoning_mode,
      objective: res.react?.objective,
      agent_blocks: res.agent_blocks,
      suggested_replies: Array.isArray(res.suggested_replies) && res.suggested_replies.length > 0
        ? res.suggested_replies
        : undefined,
    });
  }

  if (Array.isArray(res?.artifacts)) {
    for (const a of res.artifacts) {
      if (!a?.id || !a?.type) continue;
      items.push({ type: 'artifact', role: 'assistant', artifact: a });
    }
  }

  if (Array.isArray(res?.citations)) {
    for (const c of res.citations as Array<Record<string, unknown>>) {
      const url = typeof c.url === 'string' ? c.url : undefined;
      const source =
        typeof c.doc_title === 'string'
          ? c.doc_title
          : typeof c.doc_id === 'string'
          ? c.doc_id
          : 'Fuente';
      items.push({
        type: 'citation',
        role: 'assistant',
        citation: {
          id: typeof c.chunk_id === 'string' ? c.chunk_id : undefined,
          title:
            typeof c.doc_title === 'string'
              ? c.doc_title
              : typeof c.supporting_span === 'string'
              ? c.supporting_span
              : undefined,
          url,
          source,
        },
      });
    }
  }

  return items;
}
