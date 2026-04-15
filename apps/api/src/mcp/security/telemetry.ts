/**
 * Metrics collection and aggregation for MCP tools
 * Tracks execution time, errors, memory, and provides statistics
 */

export interface ToolMetrics {
  toolName: string;
  executionTimeMs: number;
  status: 'success' | 'error';
  errorCode?: string;
  memoryDeltaMb?: number;
  timestamp: number;
}

/**
 * Collector for individual tool execution metrics
 */
export class ToolMetricsCollector {
  private startTime: number;
  private startMemory: number;
  private readonly toolName: string;

  constructor(toolName: string) {
    this.toolName = toolName;
    this.startTime = Date.now();
    this.startMemory = process.memoryUsage().heapUsed / 1024 / 1024;
  }

  /**
   * Record successful execution
   */
  recordSuccess(): ToolMetrics {
    const endTime = Date.now();
    const endMemory = process.memoryUsage().heapUsed / 1024 / 1024;

    return {
      toolName: this.toolName,
      executionTimeMs: endTime - this.startTime,
      status: 'success',
      memoryDeltaMb: endMemory - this.startMemory,
      timestamp: Date.now(),
    };
  }

  /**
   * Record error execution
   */
  recordError(errorCode: string): ToolMetrics {
    const endTime = Date.now();
    const endMemory = process.memoryUsage().heapUsed / 1024 / 1024;

    return {
      toolName: this.toolName,
      executionTimeMs: endTime - this.startTime,
      status: 'error',
      errorCode,
      memoryDeltaMb: endMemory - this.startMemory,
      timestamp: Date.now(),
    };
  }
}

/**
 * Aggregated metrics for a tool
 */
export interface ToolStats {
  toolName: string;
  totalRequests: number;
  successCount: number;
  errorCount: number;
  successRate: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  errorCodes: Record<string, number>;
  avgMemoryDeltaMb: number;
}

/**
 * Aggregator for tool metrics
 * Maintains bounded memory by keeping only last N metrics per tool
 */
export class ToolMetricsAggregator {
  private metrics = new Map<string, ToolMetrics[]>();
  private readonly maxMetricsPerTool = 1000;

  /**
   * Record a metrics entry
   */
  record(metrics: ToolMetrics): void {
    if (!this.metrics.has(metrics.toolName)) {
      this.metrics.set(metrics.toolName, []);
    }

    const toolMetrics = this.metrics.get(metrics.toolName)!;
    toolMetrics.push(metrics);

    // Maintain max size (FIFO eviction)
    if (toolMetrics.length > this.maxMetricsPerTool) {
      toolMetrics.shift();
    }
  }

  /**
   * Get aggregated stats for a single tool
   */
  getStats(toolName: string): ToolStats | null {
    const toolMetrics = this.metrics.get(toolName);
    if (!toolMetrics || toolMetrics.length === 0) {
      return null;
    }

    const latencies = toolMetrics.map((m) => m.executionTimeMs).sort((a, b) => a - b);
    const successCount = toolMetrics.filter((m) => m.status === 'success').length;
    const errorCount = toolMetrics.length - successCount;

    const errorCodes: Record<string, number> = {};
    for (const m of toolMetrics) {
      if (m.errorCode) {
        errorCodes[m.errorCode] = (errorCodes[m.errorCode] ?? 0) + 1;
      }
    }

    const memoryDeltas = toolMetrics
      .map((m) => m.memoryDeltaMb ?? 0)
      .filter((m) => m !== 0);
    const avgMemory = memoryDeltas.length > 0
      ? memoryDeltas.reduce((a, b) => a + b) / memoryDeltas.length
      : 0;

    return {
      toolName,
      totalRequests: toolMetrics.length,
      successCount,
      errorCount,
      successRate: (successCount / toolMetrics.length) * 100,
      avgLatencyMs:
        latencies.reduce((a, b) => a + b) / latencies.length,
      p95LatencyMs:
        latencies[Math.floor(latencies.length * 0.95)] ?? 0,
      p99LatencyMs:
        latencies[Math.floor(latencies.length * 0.99)] ?? 0,
      errorCodes,
      avgMemoryDeltaMb: avgMemory,
    };
  }

  /**
   * Get aggregated stats for all tools
   */
  getAllStats(): ToolStats[] {
    const allStats: ToolStats[] = [];

    for (const toolName of this.metrics.keys()) {
      const stats = this.getStats(toolName);
      if (stats) {
        allStats.push(stats);
      }
    }

    return allStats;
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics.clear();
  }
}

/**
 * Global metrics aggregator
 */
let globalAggregator: ToolMetricsAggregator | null = null;

/**
 * Get or create global metrics aggregator
 */
export function getGlobalAggregator(): ToolMetricsAggregator {
  if (!globalAggregator) {
    globalAggregator = new ToolMetricsAggregator();
  }
  return globalAggregator;
}

/**
 * Create a new metrics collector for a tool
 */
export function createMetricsCollector(
  toolName: string
): ToolMetricsCollector {
  return new ToolMetricsCollector(toolName);
}

/**
 * Record metrics using global aggregator
 */
export function recordToolMetrics(metrics: ToolMetrics): void {
  getGlobalAggregator().record(metrics);
}

/**
 * Get stats for a tool using global aggregator
 */
export function getToolStats(toolName: string): ToolStats | null {
  return getGlobalAggregator().getStats(toolName);
}

/**
 * Get stats for all tools
 */
export function getAllToolStats(): ToolStats[] {
  return getGlobalAggregator().getAllStats();
}
