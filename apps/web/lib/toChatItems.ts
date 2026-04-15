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
  if (res?.message) {
    items.push({
      kind: 'text',
      content: res.message,
    });
  }

  /* ────────────────────────────── */
  /* Bloques del agente (UI-rich)   */
  /* ────────────────────────────── */
  for (const block of res?.agent_blocks ?? []) {
    items.push({
      kind: 'block',
      block,
    });
  }

  /* ────────────────────────────── */
  /* Artifacts (PDFs, gráficos, etc)*/
  /* ────────────────────────────── */
  for (const artifact of res?.artifacts ?? []) {
    items.push({
      kind: 'artifact',
      artifact,
    });
  }

  return items;
}
