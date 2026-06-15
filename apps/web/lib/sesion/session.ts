function createSessionId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `sess-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readStoredSessionId(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const existing = localStorage.getItem(key);
    return existing && existing.trim().length > 0 ? existing.trim() : null;
  } catch {
    return null;
  }
}

function writeStoredSessionId(key: string, sessionId: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, sessionId);
  } catch {
    // keep ephemeral id for this tab
  }
}

/** Per-chat session ids keep conversation history isolated between chat threads. */
export function getSessionIdForChat(chatId: string): string {
  const normalized = String(chatId || 'chat-1').trim() || 'chat-1';
  const storageKey = `agent_session_id_${normalized}`;

  const existing = readStoredSessionId(storageKey);
  if (existing) return existing;

  if (normalized === 'chat-1') {
    const legacy = readStoredSessionId('agent_session_id');
    if (legacy) {
      writeStoredSessionId(storageKey, legacy);
      return legacy;
    }
  }

  const sessionId = createSessionId();
  writeStoredSessionId(storageKey, sessionId);
  if (normalized === 'chat-1') {
    writeStoredSessionId('agent_session_id', sessionId);
  }
  return sessionId;
}

export function getSessionId(): string {
  return getSessionIdForChat('chat-1');
}
