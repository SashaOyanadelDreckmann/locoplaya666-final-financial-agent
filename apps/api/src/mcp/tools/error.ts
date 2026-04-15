/**
 * error.ts
 *
 * Compatibility wrapper over canonical MCP security errors.
 * Keeps existing lowercase error codes used by tools while delegating mapping logic.
 */

import {
  ToolError as SecurityToolError,
  ToolErrorCode as SecurityToolErrorCode,
  isRetryableError as isSecurityRetryableError,
  wrapError as wrapSecurityError,
  validationError as securityValidationError,
  timeoutError as securityTimeoutError,
  rateLimitError as securityRateLimitError,
  securityError as securitySecurityError,
} from '../security/error';

export enum ToolErrorCode {
  INVALID_ARGS = 'invalid_args',
  TIMEOUT = 'timeout',
  RATE_LIMITED = 'rate_limited',
  EXECUTION_FAILED = 'execution_failed',
  EXTERNAL_API_ERROR = 'external_api_error',
  NOT_FOUND = 'not_found',
  SECURITY_ERROR = 'security_error',
  RESOURCE_EXHAUSTED = 'resource_exhausted',
}

const TO_SECURITY_CODE: Record<ToolErrorCode, SecurityToolErrorCode> = {
  [ToolErrorCode.INVALID_ARGS]: SecurityToolErrorCode.INVALID_ARGS,
  [ToolErrorCode.TIMEOUT]: SecurityToolErrorCode.TIMEOUT,
  [ToolErrorCode.RATE_LIMITED]: SecurityToolErrorCode.RATE_LIMITED,
  [ToolErrorCode.EXECUTION_FAILED]: SecurityToolErrorCode.EXECUTION_FAILED,
  [ToolErrorCode.EXTERNAL_API_ERROR]: SecurityToolErrorCode.EXTERNAL_API_ERROR,
  [ToolErrorCode.NOT_FOUND]: SecurityToolErrorCode.NOT_FOUND,
  [ToolErrorCode.SECURITY_ERROR]: SecurityToolErrorCode.SECURITY_ERROR,
  [ToolErrorCode.RESOURCE_EXHAUSTED]: SecurityToolErrorCode.RESOURCE_EXHAUSTED,
};

const FROM_SECURITY_CODE: Record<SecurityToolErrorCode, ToolErrorCode> = {
  [SecurityToolErrorCode.INVALID_ARGS]: ToolErrorCode.INVALID_ARGS,
  [SecurityToolErrorCode.TIMEOUT]: ToolErrorCode.TIMEOUT,
  [SecurityToolErrorCode.RATE_LIMITED]: ToolErrorCode.RATE_LIMITED,
  [SecurityToolErrorCode.EXECUTION_FAILED]: ToolErrorCode.EXECUTION_FAILED,
  [SecurityToolErrorCode.EXTERNAL_API_ERROR]: ToolErrorCode.EXTERNAL_API_ERROR,
  [SecurityToolErrorCode.NOT_FOUND]: ToolErrorCode.NOT_FOUND,
  [SecurityToolErrorCode.SECURITY_ERROR]: ToolErrorCode.SECURITY_ERROR,
  [SecurityToolErrorCode.RESOURCE_EXHAUSTED]: ToolErrorCode.RESOURCE_EXHAUSTED,
};

export class ToolError extends Error {
  code: ToolErrorCode;
  retryable: boolean;
  statusCode?: number;

  constructor(
    message: string,
    code: ToolErrorCode,
    options?: {
      retryable?: boolean;
      statusCode?: number;
    },
  ) {
    super(message);
    this.name = 'ToolError';
    this.code = code;
    this.retryable = options?.retryable ?? false;
    this.statusCode = options?.statusCode;
    Object.setPrototypeOf(this, ToolError.prototype);
  }

  toJSON() {
    return {
      error: this.name,
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      statusCode: this.statusCode,
    };
  }
}

function fromSecurityError(error: SecurityToolError): ToolError {
  return new ToolError(
    error.message,
    FROM_SECURITY_CODE[error.code] ?? ToolErrorCode.EXECUTION_FAILED,
    { retryable: error.retryable, statusCode: error.statusCode },
  );
}

function toSecurityError(error: ToolError): SecurityToolError {
  return new SecurityToolError(
    error.message,
    TO_SECURITY_CODE[error.code] ?? SecurityToolErrorCode.EXECUTION_FAILED,
    { retryable: error.retryable, statusCode: error.statusCode },
  );
}

export function isRetryableError(error: unknown): boolean {
  if (error instanceof ToolError) {
    return isSecurityRetryableError(toSecurityError(error));
  }
  return isSecurityRetryableError(error);
}

export function wrapError(error: unknown, toolName: string): ToolError {
  if (error instanceof ToolError) {
    return error;
  }
  return fromSecurityError(wrapSecurityError(error, toolName));
}

export function validationError(
  toolName: string,
  field: string,
  reason: string,
): ToolError {
  return fromSecurityError(
    securityValidationError(`${toolName}: Invalid ${field} - ${reason}`),
  );
}

export function timeoutError(toolName: string, durationMs: number): ToolError {
  return fromSecurityError(securityTimeoutError(toolName, durationMs));
}

export function rateLimitError(
  toolName: string,
  retryAfter: number,
): ToolError {
  return fromSecurityError(securityRateLimitError(toolName, retryAfter));
}

export function securityError(toolName: string, reason: string): ToolError {
  return fromSecurityError(
    securitySecurityError(`${toolName}: Security validation failed - ${reason}`),
  );
}
