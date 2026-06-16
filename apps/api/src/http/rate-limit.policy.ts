import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import type { Request } from 'express';
import { getSessionCookieName } from '../services/session.service';
import { rateLimited } from './api.errors';

type HttpRateLimitPolicy = {
  name: string;
  windowMs: number;
  max: number;
  scope: 'global' | 'auth' | 'chat' | 'documents' | 'simulations';
  criticality: 'low' | 'medium' | 'high' | 'critical';
};

type LimiterOptions = {
  keyGenerator?: (req: Request) => string;
  skip?: (req: Request) => boolean;
};

function isProductionRuntime() {
  return process.env.NODE_ENV === 'production';
}

function keyFromRequest(req: Request) {
  const cookieName = getSessionCookieName();
  const sessionToken = req.cookies?.[cookieName];
  if (sessionToken) {
    const hash = crypto.createHash('sha256').update(String(sessionToken)).digest('hex');
    return `session:${hash}`;
  }
  return `ip:${req.ip}`;
}

/** Credential routes get per-email buckets; session probes must not share the login IP pool. */
export function authKeyFromRequest(req: Request) {
  if (req.method === 'POST') {
    const path = req.path || '';
    if (path === '/login' || path === '/register' || path === '/forgot-password') {
      const email =
        typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      if (email) {
        return `auth-cred:${email}:${req.ip}`;
      }
    }
  }
  return keyFromRequest(req);
}

/** High-frequency session checks (middleware, post-login polling) skip auth brute-force budget. */
export function shouldSkipAuthRateLimit(req: Request) {
  return req.method === 'GET' && req.path === '/me';
}

export function resolveAuthRateLimitMax() {
  if (process.env.NODE_ENV === 'test') {
    return Number(process.env.AUTH_RATE_LIMIT_MAX || 200);
  }
  if (!isProductionRuntime()) {
    return Number(process.env.AUTH_RATE_LIMIT_MAX || 2000);
  }
  return Number(process.env.AUTH_RATE_LIMIT_MAX || 60);
}

function buildPolicyLimiter(policy: HttpRateLimitPolicy, options: LimiterOptions = {}) {
  return rateLimit({
    windowMs: policy.windowMs,
    max: policy.max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: options.keyGenerator ?? keyFromRequest,
    skip: options.skip,
    handler: (_req, _res, next) => {
      next(rateLimited(`Rate limit exceeded (${policy.name})`));
    },
  });
}

export const HTTP_RATE_LIMIT_POLICIES: HttpRateLimitPolicy[] = [
  {
    name: 'admin_sensitive',
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.ADMIN_RATE_LIMIT_MAX || (isProductionRuntime() ? 120 : 800)),
    scope: 'global',
    criticality: 'high',
  },
  {
    name: 'global_default',
    windowMs: 15 * 60 * 1000,
    max: Number(
      process.env.GLOBAL_RATE_LIMIT_MAX || (isProductionRuntime() ? 600 : 5000),
    ),
    scope: 'global',
    criticality: 'medium',
  },
  {
    name: 'auth_sensitive',
    windowMs: 15 * 60 * 1000,
    max: resolveAuthRateLimitMax(),
    scope: 'auth',
    criticality: 'critical',
  },
  {
    name: 'agent_chat_heavy',
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.CHAT_RATE_LIMIT_MAX || 240),
    scope: 'chat',
    criticality: 'high',
  },
  {
    name: 'documents_parse_heavy',
    windowMs: 15 * 60 * 1000,
    max: 30,
    scope: 'documents',
    criticality: 'high',
  },
  {
    name: 'simulations_heavy',
    windowMs: 15 * 60 * 1000,
    max: 60,
    scope: 'simulations',
    criticality: 'high',
  },
];

export const adminRateLimiter = buildPolicyLimiter(HTTP_RATE_LIMIT_POLICIES[0]);
export const globalRateLimiter = buildPolicyLimiter(HTTP_RATE_LIMIT_POLICIES[1]);
export const authRateLimiter = buildPolicyLimiter(HTTP_RATE_LIMIT_POLICIES[2], {
  keyGenerator: authKeyFromRequest,
  skip: shouldSkipAuthRateLimit,
});
export const chatRateLimiter = buildPolicyLimiter(HTTP_RATE_LIMIT_POLICIES[3]);
export const documentsRateLimiter = buildPolicyLimiter(HTTP_RATE_LIMIT_POLICIES[4]);
export const simulationsRateLimiter = buildPolicyLimiter(HTTP_RATE_LIMIT_POLICIES[5]);
