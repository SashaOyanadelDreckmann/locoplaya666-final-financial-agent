/**
 * Security framework: telemetry.ts tests
 * Tests metrics collection and aggregation
 * Coverage target: 100%
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  ToolMetricsCollector,
  ToolMetricsAggregator,
  getGlobalAggregator,
  createMetricsCollector,
  recordToolMetrics,
  getToolStats,
  getAllToolStats,
  ToolMetrics,
  ToolStats,
} from '../telemetry';

describe('ToolMetricsCollector', () => {
  describe('recordSuccess', () => {
    it('records successful execution with timing', () => {
      const collector = new ToolMetricsCollector('test.tool');

      // Simulate some work
      const start = Date.now();
      while (Date.now() - start < 10) {
        // Busy wait 10ms
      }

      const metrics = collector.recordSuccess();

      expect(metrics.toolName).toBe('test.tool');
      expect(metrics.status).toBe('success');
      expect(metrics.executionTimeMs).toBeGreaterThanOrEqual(10);
      expect(metrics.memoryDeltaMb).toBeDefined();
      expect(metrics.timestamp).toBeDefined();
      expect(metrics.errorCode).toBeUndefined();
    });

    it('captures memory usage changes', () => {
      const collector = new ToolMetricsCollector('memory.test');
      const metrics = collector.recordSuccess();

      // Memory delta might be negative, zero, or positive
      // Just verify it's a number
      expect(typeof metrics.memoryDeltaMb).toBe('number');
    });

    it('captures timestamp', () => {
      const beforeCollection = Date.now();
      const collector = new ToolMetricsCollector('time.test');
      const metrics = collector.recordSuccess();
      const afterCollection = Date.now();

      expect(metrics.timestamp).toBeGreaterThanOrEqual(beforeCollection);
      expect(metrics.timestamp).toBeLessThanOrEqual(afterCollection + 10);
    });
  });

  describe('recordError', () => {
    it('records error execution with error code', () => {
      const collector = new ToolMetricsCollector('test.tool');
      const metrics = collector.recordError('TIMEOUT');

      expect(metrics.toolName).toBe('test.tool');
      expect(metrics.status).toBe('error');
      expect(metrics.errorCode).toBe('TIMEOUT');
      expect(metrics.executionTimeMs).toBeGreaterThan(0);
      expect(metrics.memoryDeltaMb).toBeDefined();
    });

    it('records various error codes', () => {
      const errorCodes = [
        'INVALID_ARGS',
        'TIMEOUT',
        'RATE_LIMITED',
        'SECURITY_ERROR',
        'EXECUTION_FAILED',
      ];

      for (const code of errorCodes) {
        const collector = new ToolMetricsCollector('error.test');
        const metrics = collector.recordError(code);
        expect(metrics.errorCode).toBe(code);
        expect(metrics.status).toBe('error');
      }
    });
  });
});

describe('ToolMetricsAggregator', () => {
  let aggregator: ToolMetricsAggregator;

  beforeEach(() => {
    aggregator = new ToolMetricsAggregator();
  });

  describe('record', () => {
    it('records a single metric', () => {
      const metric: ToolMetrics = {
        toolName: 'test.tool',
        executionTimeMs: 100,
        status: 'success',
        timestamp: Date.now(),
      };

      aggregator.record(metric);

      const stats = aggregator.getStats('test.tool');
      expect(stats).not.toBeNull();
      expect(stats?.totalRequests).toBe(1);
    });

    it('records multiple metrics for same tool', () => {
      for (let i = 0; i < 5; i++) {
        const metric: ToolMetrics = {
          toolName: 'test.tool',
          executionTimeMs: 100 + i * 10,
          status: 'success',
          timestamp: Date.now(),
        };
        aggregator.record(metric);
      }

      const stats = aggregator.getStats('test.tool');
      expect(stats?.totalRequests).toBe(5);
    });

    it('maintains FIFO eviction for max metrics per tool', () => {
      // Record 1001 metrics (max is 1000)
      for (let i = 0; i < 1001; i++) {
        const metric: ToolMetrics = {
          toolName: 'test.tool',
          executionTimeMs: i,
          status: 'success',
          timestamp: Date.now(),
        };
        aggregator.record(metric);
      }

      const stats = aggregator.getStats('test.tool');
      // Should have exactly 1000 (the last 1000 recorded)
      expect(stats?.totalRequests).toBe(1000);
      // First metric should have been evicted
      // (we recorded 0-1000, so 0 should be gone)
      expect(stats?.avgLatencyMs).toBeGreaterThan(0);
    });

    it('isolates metrics per tool', () => {
      const metric1: ToolMetrics = {
        toolName: 'tool1',
        executionTimeMs: 100,
        status: 'success',
        timestamp: Date.now(),
      };
      const metric2: ToolMetrics = {
        toolName: 'tool2',
        executionTimeMs: 200,
        status: 'success',
        timestamp: Date.now(),
      };

      aggregator.record(metric1);
      aggregator.record(metric1);
      aggregator.record(metric2);

      const stats1 = aggregator.getStats('tool1');
      const stats2 = aggregator.getStats('tool2');

      expect(stats1?.totalRequests).toBe(2);
      expect(stats2?.totalRequests).toBe(1);
    });
  });

  describe('getStats', () => {
    it('returns null for unknown tool', () => {
      const stats = aggregator.getStats('unknown.tool');
      expect(stats).toBeNull();
    });

    it('calculates success rate correctly', () => {
      for (let i = 0; i < 8; i++) {
        aggregator.record({
          toolName: 'test.tool',
          executionTimeMs: 100,
          status: 'success',
          timestamp: Date.now(),
        });
      }

      for (let i = 0; i < 2; i++) {
        aggregator.record({
          toolName: 'test.tool',
          executionTimeMs: 100,
          status: 'error',
          errorCode: 'TIMEOUT',
          timestamp: Date.now(),
        });
      }

      const stats = aggregator.getStats('test.tool');
      expect(stats?.successCount).toBe(8);
      expect(stats?.errorCount).toBe(2);
      expect(stats?.successRate).toBe(80);
    });

    it('calculates average latency', () => {
      for (const time of [100, 200, 300]) {
        aggregator.record({
          toolName: 'test.tool',
          executionTimeMs: time,
          status: 'success',
          timestamp: Date.now(),
        });
      }

      const stats = aggregator.getStats('test.tool');
      expect(stats?.avgLatencyMs).toBe(200); // (100 + 200 + 300) / 3
    });

    it('calculates p95 latency', () => {
      const latencies = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
      for (const time of latencies) {
        aggregator.record({
          toolName: 'test.tool',
          executionTimeMs: time,
          status: 'success',
          timestamp: Date.now(),
        });
      }

      const stats = aggregator.getStats('test.tool');
      // 95th percentile of [10,20,30,40,50,60,70,80,90,100]
      // Index = floor(10 * 0.95) = 9 → value = 100
      expect(stats?.p95LatencyMs).toBe(100);
    });

    it('calculates p99 latency', () => {
      const latencies = Array.from({ length: 100 }, (_, i) => (i + 1) * 10);
      for (const time of latencies) {
        aggregator.record({
          toolName: 'test.tool',
          executionTimeMs: time,
          status: 'success',
          timestamp: Date.now(),
        });
      }

      const stats = aggregator.getStats('test.tool');
      // 99th percentile of 100 values
      expect(stats?.p99LatencyMs).toBeGreaterThan(980);
    });

    it('aggregates error codes', () => {
      aggregator.record({
        toolName: 'test.tool',
        executionTimeMs: 100,
        status: 'error',
        errorCode: 'TIMEOUT',
        timestamp: Date.now(),
      });

      aggregator.record({
        toolName: 'test.tool',
        executionTimeMs: 100,
        status: 'error',
        errorCode: 'TIMEOUT',
        timestamp: Date.now(),
      });

      aggregator.record({
        toolName: 'test.tool',
        executionTimeMs: 100,
        status: 'error',
        errorCode: 'RATE_LIMITED',
        timestamp: Date.now(),
      });

      const stats = aggregator.getStats('test.tool');
      expect(stats?.errorCodes['TIMEOUT']).toBe(2);
      expect(stats?.errorCodes['RATE_LIMITED']).toBe(1);
    });

    it('calculates average memory delta', () => {
      aggregator.record({
        toolName: 'test.tool',
        executionTimeMs: 100,
        status: 'success',
        memoryDeltaMb: 10,
        timestamp: Date.now(),
      });

      aggregator.record({
        toolName: 'test.tool',
        executionTimeMs: 100,
        status: 'success',
        memoryDeltaMb: 20,
        timestamp: Date.now(),
      });

      const stats = aggregator.getStats('test.tool');
      expect(stats?.avgMemoryDeltaMb).toBe(15); // (10 + 20) / 2
    });

    it('ignores zero memory deltas in average', () => {
      aggregator.record({
        toolName: 'test.tool',
        executionTimeMs: 100,
        status: 'success',
        memoryDeltaMb: 0,
        timestamp: Date.now(),
      });

      aggregator.record({
        toolName: 'test.tool',
        executionTimeMs: 100,
        status: 'success',
        memoryDeltaMb: 20,
        timestamp: Date.now(),
      });

      const stats = aggregator.getStats('test.tool');
      expect(stats?.avgMemoryDeltaMb).toBe(20); // Only 20 considered
    });

    it('returns complete stats object', () => {
      aggregator.record({
        toolName: 'test.tool',
        executionTimeMs: 100,
        status: 'success',
        timestamp: Date.now(),
      });

      const stats = aggregator.getStats('test.tool');
      expect(stats).toMatchObject({
        toolName: 'test.tool',
        totalRequests: expect.any(Number),
        successCount: expect.any(Number),
        errorCount: expect.any(Number),
        successRate: expect.any(Number),
        avgLatencyMs: expect.any(Number),
        p95LatencyMs: expect.any(Number),
        p99LatencyMs: expect.any(Number),
        errorCodes: expect.any(Object),
        avgMemoryDeltaMb: expect.any(Number),
      });
    });
  });

  describe('getAllStats', () => {
    it('returns empty array for no metrics', () => {
      const stats = aggregator.getAllStats();
      expect(stats).toEqual([]);
    });

    it('returns stats for all tools', () => {
      for (const tool of ['tool1', 'tool2', 'tool3']) {
        aggregator.record({
          toolName: tool,
          executionTimeMs: 100,
          status: 'success',
          timestamp: Date.now(),
        });
      }

      const allStats = aggregator.getAllStats();
      expect(allStats).toHaveLength(3);
      expect(allStats.map((s) => s.toolName)).toContain('tool1');
      expect(allStats.map((s) => s.toolName)).toContain('tool2');
      expect(allStats.map((s) => s.toolName)).toContain('tool3');
    });

    it('returns stats in consistent format', () => {
      for (let i = 0; i < 5; i++) {
        aggregator.record({
          toolName: `tool${i}`,
          executionTimeMs: 100 + i,
          status: i % 2 === 0 ? 'success' : 'error',
          errorCode: i % 2 === 0 ? undefined : 'TIMEOUT',
          timestamp: Date.now(),
        });
      }

      const allStats = aggregator.getAllStats();
      for (const stat of allStats) {
        expect(typeof stat.successRate).toBe('number');
        expect(typeof stat.avgLatencyMs).toBe('number');
        expect(typeof stat.p95LatencyMs).toBe('number');
        expect(typeof stat.p99LatencyMs).toBe('number');
      }
    });
  });

  describe('clear', () => {
    it('clears all metrics', () => {
      aggregator.record({
        toolName: 'test.tool',
        executionTimeMs: 100,
        status: 'success',
        timestamp: Date.now(),
      });

      aggregator.clear();

      const stats = aggregator.getStats('test.tool');
      expect(stats).toBeNull();

      const allStats = aggregator.getAllStats();
      expect(allStats).toEqual([]);
    });
  });
});

describe('Global metrics aggregator', () => {
  it('returns same instance on multiple calls', () => {
    const agg1 = getGlobalAggregator();
    const agg2 = getGlobalAggregator();
    expect(agg1).toBe(agg2);
  });

  it('createMetricsCollector creates new collector', () => {
    const collector1 = createMetricsCollector('tool1');
    const collector2 = createMetricsCollector('tool1');
    // Each call creates a new instance
    expect(collector1).not.toBe(collector2);
    expect(collector1 instanceof ToolMetricsCollector).toBe(true);
  });

  it('recordToolMetrics records to global aggregator', () => {
    const metric: ToolMetrics = {
      toolName: 'global.tool',
      executionTimeMs: 100,
      status: 'success',
      timestamp: Date.now(),
    };

    recordToolMetrics(metric);

    const stats = getToolStats('global.tool');
    expect(stats).not.toBeNull();
    expect(stats?.totalRequests).toBeGreaterThanOrEqual(1);
  });

  it('getToolStats retrieves from global aggregator', () => {
    const metric: ToolMetrics = {
      toolName: 'query.tool',
      executionTimeMs: 50,
      status: 'success',
      timestamp: Date.now(),
    };

    recordToolMetrics(metric);

    const stats = getToolStats('query.tool');
    expect(stats?.avgLatencyMs).toBeGreaterThan(0);
  });

  it('getAllToolStats returns all global stats', () => {
    recordToolMetrics({
      toolName: 'stat1',
      executionTimeMs: 100,
      status: 'success',
      timestamp: Date.now(),
    });

    recordToolMetrics({
      toolName: 'stat2',
      executionTimeMs: 200,
      status: 'success',
      timestamp: Date.now(),
    });

    const allStats = getAllToolStats();
    expect(allStats.length).toBeGreaterThan(0);
    // Should contain our tools
    const toolNames = allStats.map((s) => s.toolName);
    expect(toolNames).toContain('stat1');
    expect(toolNames).toContain('stat2');
  });
});

describe('Integration: Full metrics workflow', () => {
  it('tracks complete tool execution lifecycle', () => {
    const collector = createMetricsCollector('integration.test');

    // Simulate work
    const startTime = Date.now();
    while (Date.now() - startTime < 5) {
      // Busy wait 5ms
    }

    const metrics = collector.recordSuccess();

    recordToolMetrics(metrics);

    const stats = getToolStats('integration.test');
    expect(stats).not.toBeNull();
    expect(stats?.totalRequests).toBeGreaterThanOrEqual(1);
    expect(stats?.successCount).toBeGreaterThanOrEqual(1);
    expect(stats?.avgLatencyMs).toBeGreaterThanOrEqual(5);
  });

  it('tracks multiple errors for same tool', () => {
    const toolName = 'error.tracking';

    for (let i = 0; i < 3; i++) {
      const collector = createMetricsCollector(toolName);
      const metrics = collector.recordError('TIMEOUT');
      recordToolMetrics(metrics);
    }

    const stats = getToolStats(toolName);
    expect(stats?.errorCount).toBeGreaterThanOrEqual(3);
    expect(stats?.errorCodes['TIMEOUT']).toBeGreaterThanOrEqual(3);
  });
});
