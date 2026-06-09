export const BUDGET_CHAT_WATCHDOG_MS = 20_000;

export const BUDGET_CHAT_ABORT_MESSAGE =
  'La solicitud tardó demasiado o se canceló. Tu respuesta no se guardó; intenta de nuevo.';

export type BudgetChatApiPayload = {
  ok?: boolean;
  error?: string;
  detail?: string;
  source?: string;
  next_question?: string | null;
  focus_row_id?: string | null;
  coach_message?: string;
  assistant_reply?: string;
  assistant_text?: string;
  done?: boolean;
  market_snapshot?: {
    uf?: { value?: number | null; unit?: string | null; date?: string | null; source?: string | null };
    tpm?: { value?: number | null; unit?: string | null; date?: string | null; source?: string | null };
    usd?: { value?: number | null; unit?: string | null; date?: string | null; source?: string | null };
    summary?: string;
  };
  actions?: Array<Record<string, unknown>>;
  action?: Record<string, unknown>;
  requires_confirmation?: boolean;
  pending_confirmation?: {
    actions: Array<Record<string, unknown>>;
    summary: string;
  } | null;
};

export function unwrapApiData<T>(payload: unknown): T | null {
  if (!payload || typeof payload !== 'object') return null;
  const candidate = payload as { ok?: boolean; data?: unknown };
  if ('data' in candidate && candidate.ok === true) return (candidate.data ?? null) as T | null;
  return payload as T;
}

export function normalizeBudgetChatPayload(payload: unknown): BudgetChatApiPayload | null {
  if (!payload || typeof payload !== 'object') return null;
  const candidate = payload as BudgetChatApiPayload;
  const marketSnapshot =
    candidate.market_snapshot && typeof candidate.market_snapshot === 'object'
      ? {
          uf:
            candidate.market_snapshot.uf && typeof candidate.market_snapshot.uf === 'object'
              ? {
                  value:
                    typeof candidate.market_snapshot.uf.value === 'number'
                      ? candidate.market_snapshot.uf.value
                      : null,
                  unit:
                    typeof candidate.market_snapshot.uf.unit === 'string'
                      ? candidate.market_snapshot.uf.unit
                      : null,
                  date:
                    typeof candidate.market_snapshot.uf.date === 'string'
                      ? candidate.market_snapshot.uf.date
                      : null,
                  source:
                    typeof candidate.market_snapshot.uf.source === 'string'
                      ? candidate.market_snapshot.uf.source
                      : null,
                }
              : undefined,
          tpm:
            candidate.market_snapshot.tpm && typeof candidate.market_snapshot.tpm === 'object'
              ? {
                  value:
                    typeof candidate.market_snapshot.tpm.value === 'number'
                      ? candidate.market_snapshot.tpm.value
                      : null,
                  unit:
                    typeof candidate.market_snapshot.tpm.unit === 'string'
                      ? candidate.market_snapshot.tpm.unit
                      : null,
                  date:
                    typeof candidate.market_snapshot.tpm.date === 'string'
                      ? candidate.market_snapshot.tpm.date
                      : null,
                  source:
                    typeof candidate.market_snapshot.tpm.source === 'string'
                      ? candidate.market_snapshot.tpm.source
                      : null,
                }
              : undefined,
          usd:
            candidate.market_snapshot.usd && typeof candidate.market_snapshot.usd === 'object'
              ? {
                  value:
                    typeof candidate.market_snapshot.usd.value === 'number'
                      ? candidate.market_snapshot.usd.value
                      : null,
                  unit:
                    typeof candidate.market_snapshot.usd.unit === 'string'
                      ? candidate.market_snapshot.usd.unit
                      : null,
                  date:
                    typeof candidate.market_snapshot.usd.date === 'string'
                      ? candidate.market_snapshot.usd.date
                      : null,
                  source:
                    typeof candidate.market_snapshot.usd.source === 'string'
                      ? candidate.market_snapshot.usd.source
                      : null,
                }
              : undefined,
          summary:
            typeof candidate.market_snapshot.summary === 'string' ? candidate.market_snapshot.summary : '',
        }
      : undefined;

  return {
    ok: candidate.ok === true,
    error: typeof candidate.error === 'string' ? candidate.error : undefined,
    detail: typeof candidate.detail === 'string' ? candidate.detail : undefined,
    source: typeof candidate.source === 'string' ? candidate.source : undefined,
    next_question:
      candidate.next_question === null
        ? null
        : typeof candidate.next_question === 'string'
          ? candidate.next_question
          : undefined,
    focus_row_id:
      typeof candidate.focus_row_id === 'string' && candidate.focus_row_id.trim()
        ? candidate.focus_row_id
        : null,
    coach_message: typeof candidate.coach_message === 'string' ? candidate.coach_message : undefined,
    assistant_reply: typeof candidate.assistant_reply === 'string' ? candidate.assistant_reply : undefined,
    assistant_text: typeof candidate.assistant_text === 'string' ? candidate.assistant_text : undefined,
    done: typeof candidate.done === 'boolean' ? candidate.done : undefined,
    market_snapshot: marketSnapshot,
    actions: Array.isArray(candidate.actions)
      ? candidate.actions.filter((action): action is Record<string, unknown> => Boolean(action && typeof action === 'object'))
      : undefined,
    action:
      candidate.action && typeof candidate.action === 'object'
        ? (candidate.action as Record<string, unknown>)
        : undefined,
    requires_confirmation:
      typeof candidate.requires_confirmation === 'boolean' ? candidate.requires_confirmation : undefined,
    pending_confirmation:
      candidate.pending_confirmation &&
      typeof candidate.pending_confirmation === 'object' &&
      Array.isArray((candidate.pending_confirmation as { actions?: unknown }).actions)
        ? {
            actions: ((candidate.pending_confirmation as { actions: unknown[] }).actions ?? []).filter(
              (action): action is Record<string, unknown> => Boolean(action && typeof action === 'object'),
            ),
            summary:
              typeof (candidate.pending_confirmation as { summary?: unknown }).summary === 'string'
                ? (candidate.pending_confirmation as { summary: string }).summary
                : '',
          }
        : null,
  };
}

export function isBudgetChatAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export function createBudgetChatHttpError(status: number, payload: BudgetChatApiPayload | null) {
  const detail =
    typeof payload?.error === 'string' ? payload.error : typeof payload?.detail === 'string' ? payload.detail : '';
  return new Error(`HTTP ${status}${detail ? ` ${detail}` : ''}`);
}

export function budgetChatErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('HTTP 401')) {
    return 'Sesión expirada o no iniciada. Vuelve a entrar para usar el asistente.';
  }
  if (
    message.includes('HTTP 403') &&
    (message.toLowerCase().includes('fincoin') || message.toLowerCase().includes('agotaron'))
  ) {
    return 'Tus Fincoins se agotaron. El agente quedó en pausa y no se procesan nuevas solicitudes con costo.';
  }
  if (message.includes('HTTP 429')) {
    return 'Demasiadas solicitudes al asistente. Espera un momento e intenta otra vez.';
  }
  if (message.includes('HTTP 5')) {
    return 'El servicio del asistente no está disponible ahora. Intenta nuevamente en unos segundos.';
  }
  return 'No se pudo conectar con el asistente. No se aplicaron cambios automáticos.';
}
