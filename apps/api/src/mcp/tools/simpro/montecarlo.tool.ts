import { z } from 'zod';
import type { MCPTool, ToolContext } from '../types';
import { checkRateLimit } from '../rate-limiter';
import { validateMonteCarloConfig, validateNumericRange } from '../input-sanitizer';
import { createMetricsCollector, recordToolMetrics } from '../telemetry';
import { wrapError, timeoutError, validationError } from '../error';

function randomNormal(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function normRate(x: number) {
  return x > 1 ? x / 100 : x;
}

export const monteCarloTool: MCPTool = {
  name: 'finance.simulate_montecarlo',
  description: 'Runs a Monte Carlo simulation for an investment portfolio.',
  argsSchema: z.object({
    initial: z.number().optional(),
    monthly: z.number().optional(),
    months: z.number().int().optional(),
    annualReturn: z.number().optional(),
    annualVolatility: z.number().optional(),
    paths: z.number().int().min(200).max(20000).optional(),
  }),
  run: async (args, ctx?: ToolContext) => {
    const metrics = createMetricsCollector('finance.simulate_montecarlo');

    try {
      // 1. Rate limit check
      await checkRateLimit('finance.simulate_montecarlo', ctx);

      // 2. Input validation
      const missing: string[] = [];
      if (typeof args.initial !== 'number') missing.push('initial');
      if (typeof args.monthly !== 'number') missing.push('monthly');
      if (typeof args.months !== 'number') missing.push('months');
      if (typeof args.annualReturn !== 'number') missing.push('annualReturn');
      if (typeof args.annualVolatility !== 'number') missing.push('annualVolatility');

      if (missing.length) {
        return {
          tool_call: {
            tool: 'finance.simulate_montecarlo',
            args,
            status: 'success',
            result: { requested: missing },
          },
          data: { requested: missing },
        };
      }

      const initial = Number(args.initial);
      const monthly = Number(args.monthly);
      const months = Math.max(1, Math.floor(Number(args.months)));

      // 3. Validate Monte Carlo paths (max 5000 to prevent CPU exhaustion)
      const paths = validateMonteCarloConfig(
        typeof args.paths === 'number' ? args.paths : 5000,
        5000,
        'finance.simulate_montecarlo',
      );

      // 4. Validate numeric ranges
      validateNumericRange(initial, 0, 10000000, 'initial', 'finance.simulate_montecarlo');
      validateNumericRange(monthly, 0, 100000, 'monthly', 'finance.simulate_montecarlo');
      validateNumericRange(months, 1, 1200, 'months', 'finance.simulate_montecarlo');

      const mu = normRate(Number(args.annualReturn)) / 12;
      const sigma = normRate(Number(args.annualVolatility)) / Math.sqrt(12);

      // 5. Start timeout (10 seconds for simulation)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      // 6. Execute simulation with timeout protection
      try {
        const perMonth: number[][] = Array.from({ length: months }, () => []);

        for (let i = 0; i < paths; i++) {
          // Check for abort signal periodically
          if (i % 100 === 0 && controller.signal.aborted) {
            throw new Error('Simulation aborted due to timeout');
          }

          let value = initial;
          for (let m = 0; m < months; m++) {
            const r = clamp(mu + sigma * randomNormal(), -0.95, 3.0);
            value = value * (1 + r) + monthly;
            perMonth[m].push(value);
          }
        }

        clearTimeout(timeoutId);

        const pct = (arr: number[], p: number) => {
          const a = arr.slice().sort((x, y) => x - y);
          return Number(a[Math.floor((p / 100) * (a.length - 1))].toFixed(2));
        };

        const series = perMonth.map((arr, i) => ({
          month: i + 1,
          p10: pct(arr, 10),
          p50: pct(arr, 50),
          p90: pct(arr, 90),
        }));

        const last = series[series.length - 1];
        if (!last) throw new Error('Monte Carlo simulation produced no results');

        const summary = {
          paths,
          p10_final: last.p10,
          p50_final: last.p50,
          p90_final: last.p90,
        };

        // 7. Record success metrics
        const toolMetrics = metrics.recordSuccess(ctx);
        recordToolMetrics(toolMetrics);

        return {
          tool_call: {
            tool: 'finance.simulate_montecarlo',
            args,
            status: 'success',
            result: summary,
          },
          data: { summary, series },
        };
      } catch (err) {
        clearTimeout(timeoutId);
        throw err;
      }
    } catch (error) {
      // 8. Error handling with standardized codes
      let toolError = wrapError(error, 'finance.simulate_montecarlo');

      // Check if it's a timeout
      if (error instanceof Error && error.name === 'AbortError') {
        toolError = timeoutError('finance.simulate_montecarlo', 10000);
      }

      // Record error metrics
      const toolMetrics = metrics.recordError(
        toolError.code,
        ctx,
        toolError.code === 'timeout',
      );
      recordToolMetrics(toolMetrics);

      throw toolError;
    }
  },
};
