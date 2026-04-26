/**
 * CSRF Token Middleware
 * Protects against Cross-Site Request Forgery attacks on state-changing operations.
 *
 * How it works:
 * 1. GET requests receive a CSRF token in X-CSRF-Token header
 * 2. Client includes token in X-CSRF-Token header for POST/PUT/DELETE
 * 3. Middleware validates token matches session
 */

import { timingSafeEqual, randomBytes } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { forbidden } from '../http/api.errors';

const CSRF_TOKEN_HEADER = 'x-csrf-token';
const CSRF_COOKIE_NAME = process.env.CSRF_COOKIE_NAME?.trim() || 'csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function generateCsrfToken(): string {
  return randomBytes(32).toString('hex');
}

function getCsrfTokenFromCookie(req: Request): string | undefined {
  const value = req.cookies?.[CSRF_COOKIE_NAME];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function hasSessionCookie(req: Request): boolean {
  const sessionCookieName = process.env.SESSION_COOKIE_NAME?.trim() || 'session';
  return Boolean(req.cookies?.[sessionCookieName]);
}

function secureCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  return aBuf.length === bBuf.length && timingSafeEqual(aBuf, bBuf);
}

/**
 * Middleware: Attach CSRF token to response headers for GET requests
 * Call this on ALL authenticated routes to provide token to client
 */
export function attachCsrfToken(req: Request, res: Response, next: NextFunction) {
  // Double-submit cookie pattern: if a session exists, ensure a CSRF cookie exists.
  // We attach on every request so flows that start with POST (e.g. login) still receive a token.
  if (hasSessionCookie(req)) {
    const token = getCsrfTokenFromCookie(req) ?? generateCsrfToken();
    res.cookie(CSRF_COOKIE_NAME, token, {
      httpOnly: false,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    });
    res.set(CSRF_TOKEN_HEADER, token);
  }
  next();
}

/**
 * Middleware: Validate CSRF token on state-changing operations
 * Apply this ONLY to POST/PUT/DELETE routes that modify data
 * Skip for public endpoints that don't require auth
 */
export function validateCsrfToken(req: Request, res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  // Only enforce CSRF when a session cookie exists (cookie-authenticated flow).
  if (!hasSessionCookie(req)) {
    return next();
  }

  const token = req.get(CSRF_TOKEN_HEADER)?.trim();
  const cookieToken = getCsrfTokenFromCookie(req);

  if (!token || !cookieToken || !secureCompare(token, cookieToken)) {
    return next(forbidden('CSRF token invalid or missing'));
  }

  next();
}
