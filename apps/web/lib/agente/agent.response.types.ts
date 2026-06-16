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
export type { AgentBlock } from '@/lib/tipos/chat';
import type { AgentBlock, UIEvent } from '@/lib/tipos/chat';
import type { AgentStreamUiState } from '@financial-agent/shared';

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

  // acción de panel: el agente puede controlar qué sección destacar
  panel_action?: {
    section?:
      | 'budget'
      | 'transactions'
      | 'products_transactions'
      | 'library'
      | 'recents'
      | 'profile'
      | 'news'
      | 'objective'
      | 'mode'
      | 'interview';
    message?: string;
  };

  // Mutaciones validadas de la tabla de presupuesto (Core Agent → cliente)
  budget_table_patch?: {
    actions: Array<{
      kind: 'add' | 'update' | 'delete';
      id: string;
      category?: string;
      type?: 'income' | 'expense';
      amount?: number;
      cadence?: 'fixed' | 'variable';
      payment_method?: string;
      movement_type?: string;
    }>;
    requires_confirmation: boolean;
    summary: string;
    pending_confirmation?: {
      actions: Array<Record<string, unknown>>;
      summary: string;
    } | null;
  };

  /** @deprecated Usar budget_table_patch */
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
  meta?: {
    product_lifecycle?: {
      phase?: string;
      active_chat_id?: string;
      unlocked_chats?: string[];
      closed_chats?: string[];
      turn_count?: number;
      turns_remaining?: number;
      closing_mode?: boolean;
      reports_count?: number;
      action_plan_funnel_stage?: 'brainstorm' | 'converge' | 'deliver' | null;
      social_consciousness_funnel_stage?: 'explore' | 'tension' | 'synthesis' | null;
    };
    [key: string]: unknown;
  };
};

export type ChatUploadFileKind = 'image' | 'pdf' | 'spreadsheet' | 'document';

export type ChatUploadStatus = 'processing' | 'ready' | 'error';

export type ChatItem =
  | { type: 'message'; role: 'user'; content: string }
  | {
      type: 'upload';
      role: 'user';
      uploadId?: string;
      status?: ChatUploadStatus;
      files: Array<{
        name: string;
        mime?: string;
        kind?: ChatUploadFileKind;
        sizeLabel?: string;
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
      panel_action?: {
        section?:
          | 'budget'
          | 'transactions'
          | 'products_transactions'
          | 'library'
          | 'recents'
          | 'profile'
          | 'news'
          | 'objective'
          | 'mode'
          | 'interview';
        message?: string;
      };
      stream?: AgentStreamUiState;
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
