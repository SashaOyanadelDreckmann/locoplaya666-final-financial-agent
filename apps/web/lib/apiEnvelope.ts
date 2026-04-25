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

export class ApiHttpError extends Error {
  status: number;
  code?: string;
  detail?: string;

  constructor(params: { status: number; message: string; code?: string; detail?: string }) {
    super(params.message);
    this.name = 'ApiHttpError';
    this.status = params.status;
    this.code = params.code;
    this.detail = params.detail;
  }
}

export function isApiEnvelope<T>(value: unknown): value is ApiSuccessPayload<T> | ApiErrorPayload {
  return Boolean(value && typeof value === 'object' && 'ok' in (value as Record<string, unknown>));
}

export async function parseApiResponse<T>(res: Response): Promise<T> {
  const csrfToken = res.headers.get('x-csrf-token');
  if (csrfToken) {
    setCsrfToken(csrfToken);
  }

  const raw = await res.json().catch(() => null);

  if (!res.ok) {
    const statusHint = `HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''}`;
    if (raw && typeof raw === 'object') {
      const err = raw as ApiErrorPayload;
      const message = err.detail ?? err.error?.message ?? err.title ?? statusHint;
      throw new ApiHttpError({
        status: res.status,
        message,
        code: err.code ?? err.error?.code,
        detail: err.detail,
      });
    }
    throw new ApiHttpError({
      status: res.status,
      message: statusHint,
    });
  }

  if (isApiEnvelope<T>(raw)) {
    if ((raw as ApiSuccessPayload<T>).ok === true) {
      return (raw as ApiSuccessPayload<T>).data;
    }
    const err = raw as ApiErrorPayload;
    throw new ApiHttpError({
      status: res.status,
      message:
        err.detail ??
        err.error?.message ??
        err.title ??
        `HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''}`,
      code: err.code ?? err.error?.code,
      detail: err.detail,
    });
  }

  return raw as T;
}
import { setCsrfToken } from './csrf';
