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

function keyFromRequest(req: Request) {
  const cookieName = getSessionCookieName();
  const sessionToken = req.cookies?.[cookieName];
  if (sessionToken) {
    const hash = crypto.createHash('sha256').update(String(sessionToken)).digest('hex');
    return `session:${hash}`;
  }
  return `ip:${req.ip}`;
}

function buildPolicyLimiter(policy: HttpRateLimitPolicy) {
  return rateLimit({
    windowMs: policy.windowMs,
    max: policy.max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: keyFromRequest,
    handler: (_req, _res, next) => {
      next(rateLimited(`Rate limit exceeded (${policy.name})`));
    },
  });
}

export const HTTP_RATE_LIMIT_POLICIES: HttpRateLimitPolicy[] = [
  {
    name: 'global_default',
    windowMs: 15 * 60 * 1000,
    max: 300,
    scope: 'global',
    criticality: 'medium',
  },
  {
    name: 'auth_sensitive',
    windowMs: 15 * 60 * 1000,
    max: 40,
    scope: 'auth',
    criticality: 'critical',
  },
  {
    name: 'agent_chat_heavy',
    windowMs: 15 * 60 * 1000,
    max: 120,
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

export const globalRateLimiter = buildPolicyLimiter(HTTP_RATE_LIMIT_POLICIES[0]);
export const authRateLimiter = buildPolicyLimiter(HTTP_RATE_LIMIT_POLICIES[1]);
export const chatRateLimiter = buildPolicyLimiter(HTTP_RATE_LIMIT_POLICIES[2]);
export const documentsRateLimiter = buildPolicyLimiter(HTTP_RATE_LIMIT_POLICIES[3]);
export const simulationsRateLimiter = buildPolicyLimiter(HTTP_RATE_LIMIT_POLICIES[4]);
