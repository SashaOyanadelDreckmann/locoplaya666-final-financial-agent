import type { AgentBlock } from './types/chat';

/* =============================== */
/* UI CHAT ITEMS                   */
/* =============================== */

export type ArtifactLike = {
  id?: string;
  type?: string;
  title?: string;
  [key: string]: unknown;
};

export type ChatItem =
  | { kind: 'text'; content: string }
  | { kind: 'block'; block: AgentBlock }
  | { kind: 'artifact'; artifact: ArtifactLike };

/* =============================== */
/* RESPONSE → CHAT ITEMS MAPPER    */
/* =============================== */

export function toChatItems(res: Record<string, unknown>): ChatItem[] {
  const items: ChatItem[] = [];

  /* ────────────────────────────── */
  /* Texto principal del agente     */
  /* ────────────────────────────── */
  if (typeof res?.message === 'string' && res.message.trim().length > 0) {
    items.push({
      kind: 'text',
      content: res.message,
    });
  }

  /* ────────────────────────────── */
  /* Bloques del agente (UI-rich)   */
  /* ────────────────────────────── */
  if (Array.isArray(res?.agent_blocks)) {
    for (const block of res.agent_blocks) {
      if (!block || typeof block !== 'object') continue;
      items.push({
        kind: 'block',
        block: block as AgentBlock,
      });
    }
  }

  /* ────────────────────────────── */
  /* Artifacts (PDFs, gráficos, etc)*/
  /* ────────────────────────────── */
  if (Array.isArray(res?.artifacts)) {
    for (const artifact of res.artifacts) {
      if (!artifact || typeof artifact !== 'object') continue;
      items.push({
        kind: 'artifact',
        artifact: artifact as ArtifactLike,
      });
    }
  }

  return items;
}
