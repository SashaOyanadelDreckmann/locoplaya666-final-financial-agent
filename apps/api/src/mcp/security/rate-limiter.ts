/**
 * Rate limiting framework for MCP tools
 * Tracks requests per user per minute with burst support
 */

import { rateLimitError } from './error';

export interface RateLimitConfig {
  requests_per_minute: number;
  burst_size?: number;
}

/**
 * Default rate limits per tool
 * Configured based on external API costs and internal computational load
 */
export const DEFAULT_RATE_LIMITS: Record<string, RateLimitConfig> = {
  'web.search': { requests_per_minute: 10, burst_size: 2 },
  'web.extract': { requests_per_minute: 20, burst_size: 3 },
  'web.scrape': { requests_per_minute: 5, burst_size: 1 },
  'regulatory.lookup_cl': { requests_per_minute: 10, burst_size: 1 },
  'finance.simulate': { requests_per_minute: 120, burst_size: 10 },
  'finance.simulate_montecarlo': { requests_per_minute: 50, burst_size: 5 },
  'finance.scenario_projection': { requests_per_minute: 80, burst_size: 8 },
  'finance.project_portfolio': { requests_per_minute: 80, burst_size: 8 },
  'finance.risk_drawdown': { requests_per_minute: 80, burst_size: 8 },
  'market.fx_usd_clp': { requests_per_minute: 100, burst_size: 10 },
  'market.tpm_cl': { requests_per_minute: 100, burst_size: 10 },
  'market.uf_cl': { requests_per_minute: 100, burst_size: 10 },
  'market.utm_cl': { requests_per_minute: 100, burst_size: 10 },
  'finance.budget_analyzer': { requests_per_minute: 200, burst_size: 20 },
  'finance.debt_analyzer': { requests_per_minute: 200, burst_size: 20 },
  'finance.apv_optimizer': { requests_per_minute: 200, burst_size: 20 },
  'finance.goal_planner': { requests_per_minute: 200, burst_size: 20 },
  'rag.lookup': { requests_per_minute: 500, burst_size: 50 }, // Local, no external limit
  'math.calc': { requests_per_minute: 500, burst_size: 50 },
  // Legacy aliases (kept for backwards compatibility)
  'simpro.montecarlo': { requests_per_minute: 50, burst_size: 5 },
  'market.dollarCL': { requests_per_minute: 100, burst_size: 10 },
  'market.tpmCL': { requests_per_minute: 100, burst_size: 10 },
  'market.ufCL': { requests_per_minute: 100, burst_size: 10 },
  'market.utmCL': { requests_per_minute: 100, burst_size: 10 },
  'finance.budgetAnalyzer': { requests_per_minute: 200, burst_size: 20 },
  'finance.debtAnalyzer': { requests_per_minute: 200, burst_size: 20 },
  'finance.apvOptimizer': { requests_per_minute: 200, burst_size: 20 },
  'finance.goalPlanner': { requests_per_minute: 200, burst_size: 20 },
  'chileRegulatoryLookup': { requests_per_minute: 20, burst_size: 2 },
};

interface RateLimitEntry {
  count: number;
  windowStart: number;
  blocked: boolean;
  blockedUntil?: number;
}

interface UserRateLimits {
  [toolName: string]: RateLimitEntry;
}

/**
 * Rate limiter using in-memory 1-minute window tracking
 * Per-user, per-tool rate limiting with burst support
 */
export class ToolRateLimiter {
  private userLimits = new Map<string, UserRateLimits>();
  private readonly windowDurationMs = 60 * 1000; // 1 minute
  private readonly blockDurationMs = 30 * 1000; // 30 seconds
  private cleanupInterval: NodeJS.Timeout;

  constructor(cleanupIntervalMinutes = 5) {
    // Auto-cleanup old entries every N minutes to prevent memory leak
    this.cleanupInterval = setInterval(
      () => this.cleanup(),
      cleanupIntervalMinutes * 60 * 1000
    );
    this.cleanupInterval.unref(); // Don't keep process alive
  }

  /**
   * Check if a request should be rate limited
   * Throws ToolError if limit exceeded
   */
  checkRateLimit(userId: string, toolName: string): void {
    if (!DEFAULT_RATE_LIMITS[toolName]) {
      // No limit configured for this tool
      return;
    }

    const config = DEFAULT_RATE_LIMITS[toolName];
    const burst = config.burst_size ?? 1;

    // Get or create user's rate limit entry
    if (!this.userLimits.has(userId)) {
      this.userLimits.set(userId, {});
    }
    const userLimits = this.userLimits.get(userId)!;

    if (!userLimits[toolName]) {
      userLimits[toolName] = {
        count: 0,
        windowStart: Date.now(),
        blocked: false,
      };
    }

    const entry = userLimits[toolName];
    const now = Date.now();
    const windowAge = now - entry.windowStart;

    // Check if currently blocked
    if (entry.blocked && entry.blockedUntil! > now) {
      const remainingMs = entry.blockedUntil! - now;
      throw rateLimitError(toolName, remainingMs);
    }

    // Reset window if expired
    if (windowAge > this.windowDurationMs) {
      entry.count = 0;
      entry.windowStart = now;
      entry.blocked = false;
    }

    // Check if limit exceeded (accounting for burst)
    const burstLimit = config.requests_per_minute + burst;
    if (entry.count >= burstLimit) {
      entry.blocked = true;
      entry.blockedUntil = now + this.blockDurationMs;
      const remainingMs =
        entry.windowStart + this.windowDurationMs - now;
      throw rateLimitError(toolName, remainingMs);
    }

    // Increment counter
    entry.count++;
  }

  /**
   * Get current rate limit status
   */
  getStatus(userId: string, toolName: string) {
    const config = DEFAULT_RATE_LIMITS[toolName];
    if (!config) {
      return { limited: false, message: 'No limit configured' };
    }

    const userLimits = this.userLimits.get(userId);
    if (!userLimits || !userLimits[toolName]) {
      return {
        limited: false,
        used: 0,
        remaining: config.requests_per_minute,
      };
    }

    const entry = userLimits[toolName];
    const now = Date.now();
    const windowAge = now - entry.windowStart;

    if (windowAge > this.windowDurationMs) {
      return {
        limited: false,
        used: 0,
        remaining: config.requests_per_minute,
      };
    }

    const burstLimit = config.requests_per_minute + (config.burst_size ?? 1);
    return {
      limited: (entry.blocked && entry.blockedUntil! > now) || entry.count >= burstLimit,
      used: entry.count,
      remaining: Math.max(0, config.requests_per_minute - entry.count),
      resetInMs: this.windowDurationMs - windowAge,
    };
  }

  /**
   * Reset rate limits for a user (admin operation)
   */
  resetUserLimits(userId: string): void {
    this.userLimits.delete(userId);
  }

  /**
   * Cleanup old entries to prevent memory leak
   * Removes entries for users with no recent activity
   */
  private cleanup(): void {
    const now = Date.now();
    const inactivityThresholdMs = 2 * 60 * 60 * 1000; // 2 hours

    for (const [userId, userLimits] of this.userLimits.entries()) {
      let hasRecentActivity = false;

      for (const toolName in userLimits) {
        const entry = userLimits[toolName];
        if (now - entry.windowStart < inactivityThresholdMs) {
          hasRecentActivity = true;
          break;
        }
      }

      if (!hasRecentActivity) {
        this.userLimits.delete(userId);
      }
    }
  }

  /**
   * Destroy the rate limiter (stop cleanup interval)
   */
  destroy(): void {
    clearInterval(this.cleanupInterval);
  }
}

/**
 * Global rate limiter instance
 */
let globalLimiter: ToolRateLimiter | null = null;

/**
 * Get or create the global rate limiter
 */
export function getGlobalRateLimiter(): ToolRateLimiter {
  if (!globalLimiter) {
    globalLimiter = new ToolRateLimiter();
  }
  return globalLimiter;
}

/**
 * Check rate limit using global limiter
 */
export function checkRateLimit(
  userId: string,
  toolName: string
): void {
  getGlobalRateLimiter().checkRateLimit(userId, toolName);
}
