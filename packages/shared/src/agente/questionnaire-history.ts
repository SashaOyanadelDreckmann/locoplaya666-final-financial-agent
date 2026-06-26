export const QUESTIONNAIRE_PLACEHOLDER_USER_MESSAGE = 'Completé el formulario';

/** Payload compacto enviado al agente cuando el usuario envía un cuestionario inline. */
export function isQuestionnaireResponsePayload(content: string): boolean {
  return /^Formulario respondido\./i.test(String(content ?? '').trim());
}

export function isQuestionnairePlaceholderUserMessage(content: string): boolean {
  return (
    String(content ?? '').trim().toLowerCase() ===
    QUESTIONNAIRE_PLACEHOLDER_USER_MESSAGE.toLowerCase()
  );
}

export function resolveUserMessageForAgentHistory(item: {
  content?: string;
  agent_content?: string;
}): string {
  const agentContent = String(item.agent_content ?? '').trim();
  if (agentContent) return agentContent;
  return String(item.content ?? '').trim();
}

export const QUESTIONNAIRE_HISTORY_CHAR_LIMIT = 1400;

export function resolveAgentHistoryCharLimit(content: string, defaultLimit: number): number {
  if (isQuestionnaireResponsePayload(content)) {
    return Math.max(defaultLimit, QUESTIONNAIRE_HISTORY_CHAR_LIMIT);
  }
  return defaultLimit;
}

export type AgentHistoryEntry = { role: string; content: string };

function normalizeHistoryRole(role: string): 'user' | 'assistant' {
  return role === 'assistant' ? 'assistant' : 'user';
}

function isRicherUserHistoryEntry(
  candidate: AgentHistoryEntry,
  baseline: AgentHistoryEntry,
): boolean {
  if (normalizeHistoryRole(candidate.role) !== 'user' || normalizeHistoryRole(baseline.role) !== 'user') {
    return candidate.content.trim().length > baseline.content.trim().length;
  }

  const candidateContent = candidate.content.trim();
  const baselineContent = baseline.content.trim();

  if (
    isQuestionnairePlaceholderUserMessage(baselineContent) &&
    isQuestionnaireResponsePayload(candidateContent)
  ) {
    return true;
  }

  if (
    isQuestionnairePlaceholderUserMessage(candidateContent) &&
    isQuestionnaireResponsePayload(baselineContent)
  ) {
    return false;
  }

  return candidateContent.length > baselineContent.length;
}

function pickRicherHistoryEntry(
  primary: AgentHistoryEntry,
  secondary?: AgentHistoryEntry,
): AgentHistoryEntry {
  if (!secondary) return primary;
  if (normalizeHistoryRole(primary.role) !== normalizeHistoryRole(secondary.role)) {
    return primary.content.trim().length >= secondary.content.trim().length ? primary : secondary;
  }
  return isRicherUserHistoryEntry(secondary, primary) ? secondary : primary;
}

/** Prefiere turnos persistidos cuando el cliente envía placeholders o mensajes empobrecidos. */
export function mergeAgentConversationHistory(
  fromClient: AgentHistoryEntry[],
  fromStorage: AgentHistoryEntry[],
): Array<{ role: 'user' | 'assistant'; content: string }> {
  if (fromStorage.length === 0) {
    return fromClient.map((entry) => ({
      role: normalizeHistoryRole(entry.role),
      content: entry.content,
    }));
  }
  if (fromClient.length === 0) {
    return fromStorage.map((entry) => ({
      role: normalizeHistoryRole(entry.role),
      content: entry.content,
    }));
  }

  if (fromStorage.length > fromClient.length) {
    return fromStorage.map((entry) => ({
      role: normalizeHistoryRole(entry.role),
      content: entry.content,
    }));
  }

  const mergedLength = Math.max(fromClient.length, fromStorage.length);
  const merged: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  for (let index = 0; index < mergedLength; index += 1) {
    const clientEntry = fromClient[index];
    const storageEntry = fromStorage[index];
    const picked = pickRicherHistoryEntry(
      clientEntry ?? storageEntry!,
      clientEntry && storageEntry ? storageEntry : undefined,
    );
    merged.push({
      role: normalizeHistoryRole(picked.role),
      content: picked.content,
    });
  }

  return merged;
}

/** Cuando hay turnos persistidos, prioriza DB y solo usa el cliente para cola in-flight. */
export function resolveAuthoritativeAgentHistory(
  fromClient: AgentHistoryEntry[],
  fromStorage: AgentHistoryEntry[],
  hasPersistedTurns: boolean,
): Array<{ role: 'user' | 'assistant'; content: string }> {
  if (!hasPersistedTurns || fromStorage.length === 0) {
    return mergeAgentConversationHistory(fromClient, fromStorage);
  }
  if (fromClient.length === 0 || fromStorage.length > fromClient.length) {
    return fromStorage.map((entry) => ({
      role: normalizeHistoryRole(entry.role),
      content: entry.content,
    }));
  }
  return mergeAgentConversationHistory(fromClient, fromStorage);
}
