/**
 * CSRF Token Middleware
 * Protects against Cross-Site Request Forgery attacks on state-changing operations.
 *
 * How it works:
 * 1. GET requests receive a CSRF token in X-CSRF-Token header
 * 2. Client includes token in X-CSRF-Token header for POST/PUT/DELETE
 * 3. Middleware validates token matches session
 */

import { Request, Response, NextFunction } from 'express';
import { randomBytes } from 'crypto';
import { getSessionCookieName } from '../services/session.service';
import { forbidden } from '../http/api.errors';

const CSRF_TOKEN_HEADER = 'x-csrf-token';
const CSRF_SESSION_KEY = '_csrf_token';

/**
 * Generate a new CSRF token for the session
 */
export function generateCsrfToken(req: Request): string {
  const token = randomBytes(32).toString('hex');
  if (!req.session) req.session = {} as any;
  (req.session as any)[CSRF_SESSION_KEY] = token;
  return token;
}

/**
 * Get CSRF token from session
 */
export function getCsrfToken(req: Request): string | undefined {
  if (!req.session) return undefined;
  return (req.session as any)[CSRF_SESSION_KEY];
}

/**
 * Middleware: Attach CSRF token to response headers for GET requests
 * Call this on ALL authenticated routes to provide token to client
 */
export function attachCsrfToken(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'GET' && req.authenticatedUser) {
    const token = generateCsrfToken(req);
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
  // Skip validation for GET/HEAD/OPTIONS
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Skip validation for unauthenticated requests to public endpoints
  // (they would fail auth middleware anyway)
  if (!req.authenticatedUser) {
    return next();
  }

  // CSRF validation for state-changing operations
  const token = req.get(CSRF_TOKEN_HEADER);
  const sessionToken = getCsrfToken(req);

  if (!token || !sessionToken || token !== sessionToken) {
    return next(forbidden('CSRF token invalid or missing'));
  }

  next();
}
