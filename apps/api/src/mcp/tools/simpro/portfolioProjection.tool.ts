import { z } from 'zod';
import type { MCPTool, ToolContext } from '../types';
import { checkRateLimit } from '../rate-limiter';
import { validateNumericRange } from '../input-sanitizer';
import { createMetricsCollector, recordToolMetrics } from '../telemetry';
import { wrapError, timeoutError } from '../error';

function normRate(x: number) {
  return x > 1 ? x / 100 : x;
}

export const portfolioProjectionTool: MCPTool = {
  name: 'finance.project_portfolio',
  description: 'Projects portfolio value over time with fixed contributions.',
  argsSchema: z.object({
    initial: z.number().optional(),
    monthly: z.number().optional(),
    months: z.number().int().optional(),
    annualRate: z.number().optional(),
  }),
  run: async (args, ctx?: ToolContext) => {
    const metrics = createMetricsCollector('finance.project_portfolio');

    try {
      // 1. Rate limit check
      await checkRateLimit('finance.project_portfolio', ctx);

      // 2. Input validation
      const missing: string[] = [];
      if (typeof args.initial !== 'number') missing.push('initial');
      if (typeof args.monthly !== 'number') missing.push('monthly');
      if (typeof args.months !== 'number') missing.push('months');
      if (typeof args.annualRate !== 'number') missing.push('annualRate');

      if (missing.length) {
        return {
          tool_call: {
            tool: 'finance.project_portfolio',
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

      // 3. Validate numeric ranges
      validateNumericRange(initial, 0, 100000000, 'initial', 'finance.project_portfolio');
      validateNumericRange(monthly, 0, 100000, 'monthly', 'finance.project_portfolio');
      validateNumericRange(months, 1, 1200, 'months', 'finance.project_portfolio');

      const r = normRate(Number(args.annualRate)) / 12;

      // 4. Start timeout (5s for projection)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      let balance = initial;
      let contributed = initial;

      const series = [];
      for (let m = 1; m <= months; m++) {
        // Check for abort signal periodically
        if (m % 100 === 0 && controller.signal.aborted) {
          throw new Error('Portfolio projection aborted due to timeout');
        }

        balance = balance * (1 + r) + monthly;
        contributed += monthly;
        series.push({
          month: m,
          balance: Number(balance.toFixed(2)),
          contributed: Number(contributed.toFixed(2)),
        });
      }

      clearTimeout(timeoutId);

      const last = series[series.length - 1];
      if (!last) throw new Error('Portfolio projection produced no results');

      const summary = {
        final_balance: last.balance,
        total_contributed: last.contributed,
        total_growth: Number((last.balance - last.contributed).toFixed(2)),
      };

      // 5. Record success metrics
      const toolMetrics = metrics.recordSuccess(ctx);
      recordToolMetrics(toolMetrics);

      return {
        tool_call: {
          tool: 'finance.project_portfolio',
          args,
          status: 'success',
          result: summary,
        },
        data: { summary, series },
      };
    } catch (error) {
      // 6. Error handling with standardized codes
      let toolError = wrapError(error, 'finance.project_portfolio');

      // Check if it's a timeout
      if (error instanceof Error && error.name === 'AbortError') {
        toolError = timeoutError('finance.project_portfolio', 5000);
      }

      // Record error metrics
      const toolMetrics = metrics.recordError(toolError.code, ctx, toolError.code === 'timeout');
      recordToolMetrics(toolMetrics);

      throw toolError;
    }
  },
};
