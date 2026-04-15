/**
 * Security framework: error.ts tests
 * Tests ToolError class, error codes, and helper functions
 * Coverage target: 100%
 */

import { describe, expect, it } from 'vitest';
import {
  ToolError,
  ToolErrorCode,
  validationError,
  timeoutError,
  rateLimitError,
  securityError,
  wrapError,
  isRetryableError,
} from '../error';

describe('ToolError', () => {
  describe('ToolError class', () => {
    it('creates error with basic fields', () => {
      const error = new ToolError('Test error', ToolErrorCode.INVALID_ARGS);
      expect(error.message).toBe('Test error');
      expect(error.code).toBe(ToolErrorCode.INVALID_ARGS);
      expect(error.retryable).toBe(true); // default
      expect(error.statusCode).toBe(500); // default
    });

    it('creates error with custom retryable flag', () => {
      const error = new ToolError('Test error', ToolErrorCode.TIMEOUT, {
        retryable: false,
      });
      expect(error.retryable).toBe(false);
    });

    it('creates error with custom status code', () => {
      const error = new ToolError('Test error', ToolErrorCode.INVALID_ARGS, {
        statusCode: 400,
      });
      expect(error.statusCode).toBe(400);
    });

    it('creates error with both custom options', () => {
      const error = new ToolError('Test error', ToolErrorCode.TIMEOUT, {
        retryable: true,
        statusCode: 504,
      });
      expect(error.retryable).toBe(true);
      expect(error.statusCode).toBe(504);
    });

    it('has Error prototype chain', () => {
      const error = new ToolError('Test', ToolErrorCode.INVALID_ARGS);
      expect(error instanceof Error).toBe(true);
      expect(error.name).toBe('ToolError');
    });
  });

  describe('validationError helper', () => {
    it('creates non-retryable validation error', () => {
      const error = validationError('Invalid amount');
      expect(error.code).toBe(ToolErrorCode.INVALID_ARGS);
      expect(error.retryable).toBe(false);
      expect(error.statusCode).toBe(400);
      expect(error.message).toBe('Invalid amount');
    });

    it('has correct HTTP status for 400', () => {
      const error = validationError('Bad input');
      expect(error.statusCode).toBe(400);
    });
  });

  describe('timeoutError helper', () => {
    it('creates retryable timeout error', () => {
      const error = timeoutError('webSearch', 5000);
      expect(error.code).toBe(ToolErrorCode.TIMEOUT);
      expect(error.retryable).toBe(true);
      expect(error.statusCode).toBe(504);
    });

    it('includes tool name and timeout duration in message', () => {
      const error = timeoutError('webSearch', 5000);
      expect(error.message).toContain('webSearch');
      expect(error.message).toContain('5000');
    });

    it('works with various timeout durations', () => {
      const error1 = timeoutError('tool1', 100);
      const error2 = timeoutError('tool2', 30000);
      expect(error1.message).toContain('100ms');
      expect(error2.message).toContain('30000ms');
    });
  });

  describe('rateLimitError helper', () => {
    it('creates retryable rate limit error without reset time', () => {
      const error = rateLimitError('webSearch');
      expect(error.code).toBe(ToolErrorCode.RATE_LIMITED);
      expect(error.retryable).toBe(true);
      expect(error.statusCode).toBe(429);
      expect(error.message).toContain('rate limit exceeded');
    });

    it('creates rate limit error with reset time', () => {
      const error = rateLimitError('webSearch', 45000);
      expect(error.code).toBe(ToolErrorCode.RATE_LIMITED);
      expect(error.retryable).toBe(true);
      expect(error.statusCode).toBe(429);
      expect(error.message).toContain('45000ms');
    });

    it('includes tool name in message', () => {
      const error = rateLimitError('montecarlo');
      expect(error.message).toContain('montecarlo');
    });
  });

  describe('securityError helper', () => {
    it('creates non-retryable security error', () => {
      const error = securityError('Access to localhost is blocked');
      expect(error.code).toBe(ToolErrorCode.SECURITY_ERROR);
      expect(error.retryable).toBe(false);
      expect(error.statusCode).toBe(403);
      expect(error.message).toBe('Access to localhost is blocked');
    });

    it('never retries security errors', () => {
      const error = securityError('ReDoS pattern detected');
      expect(error.retryable).toBe(false);
    });
  });

  describe('wrapError helper', () => {
    it('returns ToolError unchanged', () => {
      const originalError = validationError('Test');
      const wrappedError = wrapError(originalError, 'tool');
      expect(wrappedError).toBe(originalError);
    });

    it('wraps Error with timeout message as timeout error', () => {
      const error = new Error('Request timeout after 5000ms');
      const wrappedError = wrapError(error, 'webSearch');
      expect(wrappedError.code).toBe(ToolErrorCode.TIMEOUT);
    });

    it('wraps AbortError as timeout error', () => {
      const error = new Error('AbortError');
      error.name = 'AbortError';
      const wrappedError = wrapError(error, 'webSearch');
      expect(wrappedError.code).toBe(ToolErrorCode.TIMEOUT);
    });

    it('wraps unknown Error as execution failed', () => {
      const error = new Error('Unknown failure');
      const wrappedError = wrapError(error, 'tool1');
      expect(wrappedError.code).toBe(ToolErrorCode.EXECUTION_FAILED);
      expect(wrappedError.retryable).toBe(true);
      expect(wrappedError.message).toContain('tool1');
      expect(wrappedError.message).toContain('Unknown failure');
    });

    it('wraps non-Error objects', () => {
      const wrappedString = wrapError('String error', 'tool1');
      expect(wrappedString.code).toBe(ToolErrorCode.EXECUTION_FAILED);
      expect(wrappedString.message).toContain('String error');

      const wrappedNull = wrapError(null, 'tool1');
      expect(wrappedNull.code).toBe(ToolErrorCode.EXECUTION_FAILED);
      expect(wrappedNull.message).toContain('null');
    });

    it('includes tool name in wrapped error message', () => {
      const error = new Error('Boom');
      const wrappedError = wrapError(error, 'myTool');
      expect(wrappedError.message).toContain('myTool');
    });
  });

  describe('isRetryableError helper', () => {
    it('returns true for retryable ToolError', () => {
      const error = timeoutError('tool', 5000);
      expect(isRetryableError(error)).toBe(true);
    });

    it('returns false for non-retryable ToolError', () => {
      const error = validationError('Bad input');
      expect(isRetryableError(error)).toBe(false);
    });

    it('returns false for non-ToolError', () => {
      expect(isRetryableError(new Error('Regular error'))).toBe(false);
      expect(isRetryableError('String error')).toBe(false);
      expect(isRetryableError(null)).toBe(false);
      expect(isRetryableError(undefined)).toBe(false);
    });
  });

  describe('Error code enum', () => {
    it('has all 8 expected error codes', () => {
      const codes = Object.values(ToolErrorCode);
      expect(codes).toHaveLength(8);
    });

    it('contains INVALID_ARGS', () => {
      expect(ToolErrorCode.INVALID_ARGS).toBe('INVALID_ARGS');
    });

    it('contains TIMEOUT', () => {
      expect(ToolErrorCode.TIMEOUT).toBe('TIMEOUT');
    });

    it('contains RATE_LIMITED', () => {
      expect(ToolErrorCode.RATE_LIMITED).toBe('RATE_LIMITED');
    });

    it('contains EXECUTION_FAILED', () => {
      expect(ToolErrorCode.EXECUTION_FAILED).toBe('EXECUTION_FAILED');
    });

    it('contains EXTERNAL_API_ERROR', () => {
      expect(ToolErrorCode.EXTERNAL_API_ERROR).toBe('EXTERNAL_API_ERROR');
    });

    it('contains NOT_FOUND', () => {
      expect(ToolErrorCode.NOT_FOUND).toBe('NOT_FOUND');
    });

    it('contains SECURITY_ERROR', () => {
      expect(ToolErrorCode.SECURITY_ERROR).toBe('SECURITY_ERROR');
    });

    it('contains RESOURCE_EXHAUSTED', () => {
      expect(ToolErrorCode.RESOURCE_EXHAUSTED).toBe('RESOURCE_EXHAUSTED');
    });
  });

  describe('HTTP status mapping', () => {
    it('validation error maps to 400', () => {
      const error = validationError('Bad input');
      expect(error.statusCode).toBe(400);
    });

    it('timeout error maps to 504', () => {
      const error = timeoutError('tool', 5000);
      expect(error.statusCode).toBe(504);
    });

    it('rate limit error maps to 429', () => {
      const error = rateLimitError('tool');
      expect(error.statusCode).toBe(429);
    });

    it('security error maps to 403', () => {
      const error = securityError('Access denied');
      expect(error.statusCode).toBe(403);
    });
  });
});
