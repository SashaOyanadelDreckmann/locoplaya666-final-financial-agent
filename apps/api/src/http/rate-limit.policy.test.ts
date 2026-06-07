import { describe, expect, it } from 'vitest';
import type { Request } from 'express';
import {
  authKeyFromRequest,
  resolveAuthRateLimitMax,
  shouldSkipAuthRateLimit,
} from './rate-limit.policy';

function mockReq(partial: Partial<Request> & { body?: Record<string, unknown> }): Request {
  return partial as Request;
}

describe('rate-limit.policy', () => {
  it('skips GET /auth/me from auth brute-force budget', () => {
    expect(
      shouldSkipAuthRateLimit(
        mockReq({ method: 'GET', path: '/me' }),
      ),
    ).toBe(true);
    expect(
      shouldSkipAuthRateLimit(
        mockReq({ method: 'POST', path: '/login' }),
      ),
    ).toBe(false);
  });

  it('keys credential routes by email + ip', () => {
    const key = authKeyFromRequest(
      mockReq({
        method: 'POST',
        path: '/login',
        ip: '127.0.0.1',
        body: { email: 'Admin@Financieramente.local', password: 'x' },
      }),
    );
    expect(key).toBe('auth-cred:admin@financieramente.local:127.0.0.1');
  });

  it('uses generous auth limits outside production', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    expect(resolveAuthRateLimitMax()).toBeGreaterThanOrEqual(500);
    process.env.NODE_ENV = 'production';
    expect(resolveAuthRateLimitMax()).toBe(60);
    process.env.NODE_ENV = prev;
  });
});
