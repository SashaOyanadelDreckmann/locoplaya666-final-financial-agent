/**
 * rate-limiter.ts
 *
 * Compatibility wrapper over canonical MCP security rate limiter.
 * Keeps legacy tool-facing API while enforcing one single implementation.
 */

import type { ToolContext } from './types';
import {
  DEFAULT_RATE_LIMITS as CANONICAL_RATE_LIMITS,
  ToolRateLimiter as CanonicalToolRateLimiter,
  checkRateLimit as checkCanonicalRateLimit,
  getGlobalRateLimiter as getCanonicalGlobalRateLimiter,
} from '../security/rate-limiter';

export interface RateLimitConfig {
  tool: string;
  requests_per_minute: number;
  burst_size?: number;
}

export const DEFAULT_RATE_LIMITS: RateLimitConfig[] = Object.entries(CANONICAL_RATE_LIMITS).map(
  ([tool, cfg]) => ({
    tool,
    requests_per_minute: cfg.requests_per_minute,
    burst_size: cfg.burst_size,
  }),
);

export class ToolRateLimiter {
  constructor(private readonly delegate: CanonicalToolRateLimiter = getCanonicalGlobalRateLimiter()) {}

  async checkLimit(toolName: string, userId?: string): Promise<void> {
    this.delegate.checkRateLimit(userId ?? 'anonymous', toolName);
  }

  recordSuccess(_toolName: string, _userId?: string, _durationMs?: number): void {
    // Metrics are handled by telemetry module; no-op kept for backwards compatibility.
  }

  recordFailure(_toolName: string, _userId?: string, _errorCode?: string): void {
    // Metrics are handled by telemetry module; no-op kept for backwards compatibility.
  }

  resetUserLimits(userId: string): void {
    this.delegate.resetUserLimits(userId);
  }

  getStatus(toolName: string, userId?: string) {
    const status = this.delegate.getStatus(userId ?? 'anonymous', toolName);
    return {
      current: status.used ?? 0,
      limit: (CANONICAL_RATE_LIMITS[toolName]?.requests_per_minute ?? 0),
      resetIn: status.resetInMs ?? 0,
      blocked: status.limited ?? false,
    };
  }

  destroy(): void {
    this.delegate.destroy();
  }
}

let globalLimiter: ToolRateLimiter | null = null;

export function getGlobalRateLimiter(): ToolRateLimiter {
  if (!globalLimiter) {
    globalLimiter = new ToolRateLimiter();
  }
  return globalLimiter;
}

export async function checkRateLimit(toolName: string, context?: ToolContext): Promise<void> {
  checkCanonicalRateLimit(context?.user_id ?? 'anonymous', toolName);
}
