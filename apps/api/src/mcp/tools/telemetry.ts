/**
 * telemetry.ts
 *
 * Compatibility wrapper over canonical MCP security telemetry.
 * Keeps current tools API while delegating storage/aggregation to one module.
 */

import { getLogger } from '../../logger';
import type { ToolContext } from './types';
import {
  createMetricsCollector as createSecurityCollector,
  recordToolMetrics as recordSecurityToolMetrics,
  getAllToolStats as getAllSecurityToolStats,
  getToolStats as getSecurityToolStats,
  type ToolMetrics as SecurityToolMetrics,
} from '../security/telemetry';

export interface ToolMetrics {
  tool: string;
  latency_ms: number;
  status: 'success' | 'error' | 'timeout';
  error_code?: string;
  user_id?: string;
  session_id?: string;
  timestamp: number;
}

export class ToolMetricsCollector {
  private readonly startedAt = Date.now();
  private readonly startHeap = process.memoryUsage().heapUsed;
  private readonly delegate = createSecurityCollector(this.toolName);

  constructor(private readonly toolName: string) {}

  recordSuccess(context?: ToolContext): ToolMetrics {
    const base = this.delegate.recordSuccess();
    const metrics: ToolMetrics = {
      tool: this.toolName,
      latency_ms: base.executionTimeMs,
      status: 'success',
      user_id: context?.user_id,
      session_id: context?.session_id,
      timestamp: base.timestamp,
    };
    this.log(metrics);
    return metrics;
  }

  recordError(errorCode: string, context?: ToolContext, isTimeout = false): ToolMetrics {
    const base = this.delegate.recordError(errorCode);
    const metrics: ToolMetrics = {
      tool: this.toolName,
      latency_ms: base.executionTimeMs,
      status: isTimeout ? 'timeout' : 'error',
      error_code: errorCode,
      user_id: context?.user_id,
      session_id: context?.session_id,
      timestamp: base.timestamp,
    };
    this.log(metrics);
    return metrics;
  }

  private log(metrics: ToolMetrics) {
    const logger = getLogger();
    const memoryDeltaBytes = process.memoryUsage().heapUsed - this.startHeap;
    const payload = {
      msg: 'mcp.tool.execution',
      tool: metrics.tool,
      status: metrics.status,
      latency_ms: metrics.latency_ms,
      memory_delta_bytes: memoryDeltaBytes,
      correlation_user_id: metrics.user_id,
      session_id: metrics.session_id,
      error_code: metrics.error_code,
      runtime_ms: Date.now() - this.startedAt,
    };
    if (metrics.status === 'success') {
      logger.debug(payload);
    } else {
      logger.warn(payload);
    }
  }
}

function toSecurityMetric(metrics: ToolMetrics): SecurityToolMetrics {
  return {
    toolName: metrics.tool,
    executionTimeMs: metrics.latency_ms,
    status: metrics.status === 'success' ? 'success' : 'error',
    errorCode:
      metrics.error_code ??
      (metrics.status === 'timeout' ? 'TIMEOUT' : undefined),
    timestamp: metrics.timestamp,
  };
}

export function createMetricsCollector(toolName: string): ToolMetricsCollector {
  return new ToolMetricsCollector(toolName);
}

export function recordToolMetrics(metrics: ToolMetrics): void {
  recordSecurityToolMetrics(toSecurityMetric(metrics));
}

export function getToolStats(toolName: string) {
  const stats = getSecurityToolStats(toolName);
  if (!stats) {
    return {
      total_calls: 0,
      success_count: 0,
      error_count: 0,
      timeout_count: 0,
      avg_latency_ms: 0,
      p95_latency_ms: 0,
      p99_latency_ms: 0,
    };
  }

  const timeoutCount = stats.errorCodes.TIMEOUT ?? stats.errorCodes.timeout ?? 0;

  return {
    total_calls: stats.totalRequests,
    success_count: stats.successCount,
    error_count: stats.errorCount,
    timeout_count: timeoutCount,
    avg_latency_ms: Math.round(stats.avgLatencyMs),
    p95_latency_ms: Math.round(stats.p95LatencyMs),
    p99_latency_ms: Math.round(stats.p99LatencyMs),
  };
}

export function getAllToolStats() {
  const stats = getAllSecurityToolStats();
  const out: Record<string, ReturnType<typeof getToolStats>> = {};
  for (const item of stats) {
    out[item.toolName] = getToolStats(item.toolName);
  }
  return out;
}
