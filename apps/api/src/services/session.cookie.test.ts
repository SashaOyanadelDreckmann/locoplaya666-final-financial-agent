import { beforeEach, describe, expect, it } from 'vitest';

import { getCsrfCookieOptions, getSessionCookieOptions } from './session.service';

describe('cookie options', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    process.env.SESSION_COOKIE_SAME_SITE = 'none';
    delete process.env.SESSION_COOKIE_DOMAIN;
  });

  it('aligns CSRF and session cookies for cross-origin production', () => {
    const session = getSessionCookieOptions();
    const csrf = getCsrfCookieOptions();

    expect(session.sameSite).toBe('none');
    expect(csrf.sameSite).toBe('none');
    expect(session.secure).toBe(true);
    expect(csrf.secure).toBe(true);
    expect(csrf.httpOnly).toBe(false);
    expect(session.httpOnly).toBe(true);
  });

  it('honors SESSION_COOKIE_DOMAIN when configured', () => {
    process.env.SESSION_COOKIE_DOMAIN = '.example.com';

    const session = getSessionCookieOptions();
    const csrf = getCsrfCookieOptions();

    expect(session.domain).toBe('.example.com');
    expect(csrf.domain).toBe('.example.com');
  });
});
