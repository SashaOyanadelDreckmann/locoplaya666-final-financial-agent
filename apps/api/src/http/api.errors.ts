import { ZodError } from 'zod';

export const API_ERROR_CODES = {
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];

export class AppError extends Error {
  readonly code: ApiErrorCode;
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(statusCode: number, code: ApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function badRequest(message: string, details?: unknown): AppError {
  return new AppError(400, API_ERROR_CODES.BAD_REQUEST, message, details);
}

export function validationError(message: string, details?: unknown): AppError {
  return new AppError(422, API_ERROR_CODES.VALIDATION_ERROR, message, details);
}

export function unauthorized(message = 'Authentication required'): AppError {
  return new AppError(401, API_ERROR_CODES.UNAUTHORIZED, message);
}

export function forbidden(message = 'Insufficient permissions'): AppError {
  return new AppError(403, API_ERROR_CODES.FORBIDDEN, message);
}

export function notFound(message: string): AppError {
  return new AppError(404, API_ERROR_CODES.NOT_FOUND, message);
}

export function conflict(message: string): AppError {
  return new AppError(409, API_ERROR_CODES.CONFLICT, message);
}

export function rateLimited(message = 'Too many requests'): AppError {
  return new AppError(429, API_ERROR_CODES.RATE_LIMITED, message);
}

export function internalError(message = 'Internal server error', details?: unknown): AppError {
  return new AppError(500, API_ERROR_CODES.INTERNAL_ERROR, message, details);
}

export function isZodError(error: unknown): error is ZodError {
  return error instanceof ZodError;
}
