export type ApiErrorPayload = {
  ok?: false;
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  code?: string;
  details?: unknown;
};

export type ApiSuccessPayload<T> = {
  ok: true;
  data: T;
};

export function isApiEnvelope<T>(value: unknown): value is ApiSuccessPayload<T> | ApiErrorPayload {
  return Boolean(value && typeof value === 'object' && 'ok' in (value as Record<string, unknown>));
}

export async function parseApiResponse<T>(res: Response): Promise<T> {
  const raw = await res.json().catch(() => null);

  if (!res.ok) {
    const statusHint = `HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''}`;
    if (raw && typeof raw === 'object') {
      const err = raw as ApiErrorPayload;
      const message = err.detail ?? err.error?.message ?? err.title ?? statusHint;
      throw new Error(message);
    }
    throw new Error(statusHint);
  }

  if (isApiEnvelope<T>(raw)) {
    if ((raw as ApiSuccessPayload<T>).ok === true) {
      return (raw as ApiSuccessPayload<T>).data;
    }
    throw new Error(
      (raw as ApiErrorPayload).detail ??
        (raw as ApiErrorPayload).error?.message ??
        (raw as ApiErrorPayload).title ??
        `HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''}`,
    );
  }

  return raw as T;
}
