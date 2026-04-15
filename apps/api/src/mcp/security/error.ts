/**
 * Standardized error handling for MCP tools
 * Provides consistent error codes, retry logic, and error classification
 */

export enum ToolErrorCode {
  INVALID_ARGS = 'INVALID_ARGS',
  TIMEOUT = 'TIMEOUT',
  RATE_LIMITED = 'RATE_LIMITED',
  EXECUTION_FAILED = 'EXECUTION_FAILED',
  EXTERNAL_API_ERROR = 'EXTERNAL_API_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  SECURITY_ERROR = 'SECURITY_ERROR',
  RESOURCE_EXHAUSTED = 'RESOURCE_EXHAUSTED',
}

/**
 * Standard error class for MCP tool errors
 * Includes error code, retry information, and HTTP status mapping
 */
export class ToolError extends Error {
  public readonly code: ToolErrorCode;
  public readonly retryable: boolean;
  public readonly statusCode: number;

  constructor(
    message: string,
    code: ToolErrorCode,
    options?: {
      retryable?: boolean;
      statusCode?: number;
    }
  ) {
    super(message);
    this.name = 'ToolError';
    this.code = code;
    this.retryable = options?.retryable ?? true;
    this.statusCode = options?.statusCode ?? 500;
  }
}

/**
 * Create a validation error (non-retryable)
 */
export function validationError(message: string): ToolError {
  return new ToolError(message, ToolErrorCode.INVALID_ARGS, {
    retryable: false,
    statusCode: 400,
  });
}

/**
 * Create a timeout error (retryable)
 */
export function timeoutError(
  toolName: string,
  timeoutMs: number
): ToolError {
  return new ToolError(
    `${toolName} timed out after ${timeoutMs}ms`,
    ToolErrorCode.TIMEOUT,
    {
      retryable: true,
      statusCode: 504,
    }
  );
}

/**
 * Create a rate limit error (retryable after delay)
 */
export function rateLimitError(
  toolName: string,
  resetAfterMs?: number
): ToolError {
  const message = resetAfterMs
    ? `${toolName} rate limit exceeded. Retry after ${resetAfterMs}ms`
    : `${toolName} rate limit exceeded`;
  return new ToolError(message, ToolErrorCode.RATE_LIMITED, {
    retryable: true,
    statusCode: 429,
  });
}

/**
 * Create a security error (non-retryable)
 */
export function securityError(message: string): ToolError {
  return new ToolError(message, ToolErrorCode.SECURITY_ERROR, {
    retryable: false,
    statusCode: 403,
  });
}

/**
 * Wrap standard errors into ToolError
 */
export function wrapError(error: unknown, toolName: string): ToolError {
  if (error instanceof ToolError) {
    return error;
  }

  if (error instanceof Error) {
    if (error.name === 'AbortError' || error.message.includes('timeout')) {
      return timeoutError(toolName, 0);
    }
  }

  return new ToolError(
    `${toolName} failed: ${String(error)}`,
    ToolErrorCode.EXECUTION_FAILED,
    {
      retryable: true,
      statusCode: 500,
    }
  );
}

/**
 * Determine if an error should be retried
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof ToolError) {
    return error.retryable;
  }
  // Default: don't retry unknown errors
  return false;
}
