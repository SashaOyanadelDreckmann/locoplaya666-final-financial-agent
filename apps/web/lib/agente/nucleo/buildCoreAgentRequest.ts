import {
  CHAT_PIPELINES,
  compactCoreAgentHistory,
  type AgentStreamUiState,
} from '@financial-agent/shared';

export type CoreAgentHistoryEntry = {
  role: 'user' | 'assistant';
  content: string;
};

export type CoreAgentRequestPayload = {
  user_message: string;
  session_id?: string;
  client_message_id?: string;
  history?: CoreAgentHistoryEntry[];
  profile?: unknown;
  user_info?: { name?: string };
  context?: Record<string, unknown>;
  ui_state?: Record<string, unknown>;
  preferences?: Record<string, unknown>;
  stream?: boolean;
};

export type CoreAgentRequestBody = {
  user_id: string;
  user_name?: string;
  user_message: string;
  session_id?: string;
  client_message_id?: string;
  history: CoreAgentHistoryEntry[];
  context: Record<string, unknown>;
  ui_state?: Record<string, unknown>;
  preferences?: Record<string, unknown>;
  stream?: boolean;
};

export function readPersistedUserId(): string {
  try {
    const persisted = localStorage.getItem('user_id');
    if (persisted) return persisted;
  } catch {}
  return 'anonymous';
}

export function readPersistedUserName(): string | undefined {
  try {
    const name = localStorage.getItem('user_name');
    if (name) return name;
  } catch {}
  return undefined;
}

export function sanitizeCoreAgentHistory(
  history?: CoreAgentHistoryEntry[],
): CoreAgentHistoryEntry[] {
  return compactCoreAgentHistory(
    Array.isArray(history)
      ? history.filter(
          (entry) =>
            entry &&
            (entry.role === 'user' || entry.role === 'assistant') &&
            typeof entry.content === 'string',
        )
      : [],
  );
}

export function serializeCoreAgentRequestBody(body: CoreAgentRequestBody): string {
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(body, (_key, value) => {
      if (typeof value === 'bigint') return value.toString();
      if (typeof value === 'function' || typeof value === 'symbol') return undefined;
      if (value && typeof value === 'object') {
        if (seen.has(value)) return undefined;
        seen.add(value);
      }
      return value;
    });
  } catch (error: unknown) {
    throw new Error(
      error instanceof Error
        ? `No se pudo preparar el mensaje: ${error.message}`
        : 'No se pudo preparar el mensaje para el agente',
    );
  }
}

export function buildCoreAgentRequestBody(payload: CoreAgentRequestPayload): CoreAgentRequestBody {
  const { profile, user_info, history, context, stream, ...rest } = payload;

  const resolvedUserInfo =
    user_info ??
    (() => {
      const name = readPersistedUserName();
      return name ? { name } : undefined;
    })();

  return {
    user_id: readPersistedUserId(),
    user_name: resolvedUserInfo?.name,
    ...rest,
    ...(stream ? { stream: true } : {}),
    history: sanitizeCoreAgentHistory(history),
    context: {
      ...(context ?? {}),
      ...(profile ? { profile } : {}),
      ...(resolvedUserInfo ? { user_info: resolvedUserInfo } : {}),
    },
  };
}

export const CORE_AGENT_JSON_ROUTE = CHAT_PIPELINES.core.route;
export const CORE_AGENT_STREAM_ROUTE = CHAT_PIPELINES.core.streamRoute;

export type { AgentStreamUiState };
