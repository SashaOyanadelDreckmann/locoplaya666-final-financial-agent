import type { Response } from 'express';
import type { ApiErrorCode } from './api.errors';

export type ApiSuccess<T> = {
  ok: true;
  data: T;
  meta?: {
    correlationId?: string;
  };
};

export type ApiErrorBody = {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  code: ApiErrorCode;
  correlationId?: string;
  timestamp: string;
  details?: unknown;
};

export function sendSuccess<T>(res: Response, data: T, statusCode = 200) {
  const correlationId =
    res.req && typeof (res.req as { correlationId?: string }).correlationId === 'string'
      ? (res.req as { correlationId?: string }).correlationId
      : undefined;
  const payload: ApiSuccess<T> = {
    ok: true,
    data,
    ...(correlationId ? { meta: { correlationId } } : {}),
  };

  return res.status(statusCode).json(payload);
}

export function toLegacyErrorShape(body: ApiErrorBody): string {
  return body.detail;
}

export function sendProblem(res: Response, problem: ApiErrorBody) {
  return res
    .status(problem.status)
    .type('application/problem+json')
    .json(problem);
}
