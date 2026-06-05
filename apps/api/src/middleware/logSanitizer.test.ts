import { describe, expect, it } from 'vitest';
import { sanitizeObject, sanitizeString } from './logSanitizer';

describe('logSanitizer', () => {
  it('masks tokens and credentials in strings', () => {
    const value =
      'GET /reset-password?token=abc123&password=Secret123 Authorization: Bearer eyJhbGciOiJ...';
    const sanitized = sanitizeString(value);

    expect(sanitized).toContain('token=***');
    expect(sanitized).toContain('password=***');
    expect(sanitized).toContain('Bearer ***');
    expect(sanitized).not.toContain('Secret123');
  });

  it('redacts sensitive object fields recursively', () => {
    const sanitized = sanitizeObject({
      password: 'Secret123',
      nested: {
        apiKey: 'sk-abcdef0123456789012345',
        token: 'abc',
      },
    });

    expect(sanitized).toEqual({
      password: '***',
      nested: {
        apiKey: '***',
        token: '***',
      },
    });
  });
});
