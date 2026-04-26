/**
 * errorHandler.ts
 *
 * Global Express error handling middleware.
 * Catches all errors and returns structured error responses.
 */

import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { getLogger } from '../logger';
import { API_ERROR_CODES, type ApiErrorCode, AppError } from '../http/api.errors';
import { sendProblem, type ApiErrorBody } from '../http/api.responses';

/**
 * Global error handler middleware.
 * Place this LAST in middleware stack.
 */
export function errorHandlerMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const logger = req.logger || getLogger();
  const correlationId = req.correlationId;

  let statusCode = 500;
  let errorCode: ApiErrorCode = API_ERROR_CODES.INTERNAL_ERROR;
  let title = 'Internal Server Error';
  let detail = 'Internal server error';
  let details: unknown;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    errorCode = err.code;
    detail = err.message;
    details = err.details;
  } else if (err instanceof ZodError) {
    statusCode = 422;
    errorCode = API_ERROR_CODES.VALIDATION_ERROR;
    title = 'Validation Error';
    detail = 'Request validation failed';
    details = err.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
  } else if (err instanceof Error) {
    const lowerMessage = err.message.toLowerCase();
    const errWithCode = err as Error & { code?: string; statusCode?: number; type?: string };
    const dbCode = errWithCode.code;

    // Precise Prisma mappings
    if (dbCode === 'P2002') {
      statusCode = 409;
      errorCode = API_ERROR_CODES.CONFLICT;
      title = 'Conflict';
      detail = 'Resource already exists';
    } else if (dbCode === 'P2025') {
      statusCode = 404;
      errorCode = API_ERROR_CODES.NOT_FOUND;
      title = 'Not Found';
      detail = 'Resource not found';
    } else if (dbCode === 'P2003') {
      statusCode = 409;
      errorCode = API_ERROR_CODES.CONFLICT;
      title = 'Conflict';
      detail = 'Referenced resource does not exist';
    } else if (
      lowerMessage.includes('json') &&
      (lowerMessage.includes('parse') || errWithCode.type === 'entity.parse.failed')
    ) {
      statusCode = 400;
      errorCode = API_ERROR_CODES.BAD_REQUEST;
      title = 'Bad Request';
      detail = 'Malformed JSON body';
    } else if (
      lowerMessage.includes('rate limit') ||
      lowerMessage.includes('too many requests') ||
      statusCode === 429
    ) {
      statusCode = 429;
      errorCode = API_ERROR_CODES.RATE_LIMITED;
      title = 'Too Many Requests';
      detail = err.message || 'Too many requests';
    } else if (lowerMessage.includes('unauthorized') || lowerMessage.includes('invalid credentials')) {
      statusCode = 401;
      errorCode = API_ERROR_CODES.UNAUTHORIZED;
      title = 'Unauthorized';
      detail = err.message || 'Unauthorized';
    } else if (lowerMessage.includes('forbidden')) {
      statusCode = 403;
      errorCode = API_ERROR_CODES.FORBIDDEN;
      title = 'Forbidden';
      detail = err.message || 'Forbidden';
    } else if (lowerMessage.includes('not found')) {
      statusCode = 404;
      errorCode = API_ERROR_CODES.NOT_FOUND;
      title = 'Not Found';
      detail = err.message || 'Not found';
    } else if (lowerMessage.includes('already exists')) {
      statusCode = 409;
      errorCode = API_ERROR_CODES.CONFLICT;
      title = 'Conflict';
      detail = err.message || 'Conflict';
    } else if (lowerMessage.includes('invalid') || lowerMessage.includes('bad request')) {
      statusCode = 400;
      errorCode = API_ERROR_CODES.BAD_REQUEST;
      title = 'Bad Request';
      detail = err.message || 'Bad request';
    } else if (
      (errWithCode.statusCode && Number(errWithCode.statusCode) >= 400 && Number(errWithCode.statusCode) <= 599) ||
      dbCode === 'RATE_LIMITED'
    ) {
      statusCode = Number(errWithCode.statusCode ?? 500);
      title = statusCode === 429 ? 'Too Many Requests' : 'Request Error';
      detail = err.message || detail;
      if (statusCode === 429) errorCode = API_ERROR_CODES.RATE_LIMITED;
    }
  }

  if (statusCode === 400 && title === 'Internal Server Error') title = 'Bad Request';
  if (statusCode === 401 && title === 'Internal Server Error') title = 'Unauthorized';
  if (statusCode === 403 && title === 'Internal Server Error') title = 'Forbidden';
  if (statusCode === 404 && title === 'Internal Server Error') title = 'Not Found';
  if (statusCode === 409 && title === 'Internal Server Error') title = 'Conflict';
  if (statusCode === 422 && title === 'Internal Server Error') title = 'Validation Error';
  if (statusCode === 429 && title === 'Internal Server Error') title = 'Too Many Requests';

  logger.error({
    msg: 'API error handled',
    errorCode,
    statusCode,
    errorName: err instanceof Error ? err.name : 'UnknownError',
    errorMessage: err instanceof Error ? err.message : String(err),
    errorStack: err instanceof Error ? err.stack : undefined,
    path: req.path,
    method: req.method,
    correlationId,
  });

  const response: ApiErrorBody = {
    type: `https://api.financial-agent.local/problems/${errorCode.toLowerCase()}`,
    title,
    status: statusCode,
    detail,
    instance: req.originalUrl || req.path,
    code: errorCode,
    timestamp: new Date().toISOString(),
    ...(correlationId ? { correlationId } : {}),
    ...(process.env.NODE_ENV !== 'production' && details ? { details } : {}),
  };

  sendProblem(res, response);
}

/**
 * Utility to wrap async route handlers for error catching.
 * Use: router.get('/path', asyncHandler(async (req, res) => { ... }))
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
