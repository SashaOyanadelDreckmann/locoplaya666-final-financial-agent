import { z } from 'zod';
import type { MCPTool, ToolContext } from '../types';
import { checkRateLimit } from '../rate-limiter';
import { validateNumericRange } from '../input-sanitizer';
import { createMetricsCollector, recordToolMetrics } from '../telemetry';
import { wrapError } from '../error';

function normRate(x: number) {
  return x > 1 ? x / 100 : x;
}

export const simulatorTool: MCPTool = {
  name: 'finance.simulate',
  description: "Simulates portfolio value over time with fixed contributions.",
  argsSchema: z.object({
    initial: z.number().optional(),
    monthly: z.number().optional(),
    months: z.number().int().optional(),
    annualRate: z.number().optional(), // e.g. 0.07 or 7
  }),
  run: async (args, ctx?: ToolContext) => {
    const metrics = createMetricsCollector('finance.simulate');

    try {
      // 1. Rate limit check
      await checkRateLimit('finance.simulate', ctx);

      // 2. Input validation
      const missing: string[] = [];
      if (typeof args.initial !== 'number') missing.push('initial (capital inicial)');
      if (typeof args.monthly !== 'number') missing.push('monthly (aporte mensual)');
      if (typeof args.months !== 'number') missing.push('months (horizonte en meses)');
      if (typeof args.annualRate !== 'number') missing.push('annualRate (tasa anual)');

      if (missing.length) {
        return {
          tool_call: { tool: 'finance.simulate', args, status: 'success', result: { requested: missing } },
          data: { requested: missing },
        };
      }

      const initial = Number(args.initial);
      const monthly = Number(args.monthly);
      const months = Math.max(1, Math.floor(Number(args.months)));

      // 3. Validate numeric ranges
      validateNumericRange(initial, 0, 100000000, 'initial', 'finance.simulate');
      validateNumericRange(monthly, 0, 100000, 'monthly', 'finance.simulate');
      validateNumericRange(months, 1, 1200, 'months', 'finance.simulate');

      const annualRate = normRate(Number(args.annualRate));
      const r = annualRate / 12;

      let balance = initial;
      const series: Array<{ month: number; balance: number; contributed: number }> = [];
      let contributed = initial;

      for (let m = 1; m <= months; m++) {
        balance = balance * (1 + r) + monthly;
        contributed += monthly;
        series.push({
          month: m,
          balance: Number(balance.toFixed(2)),
          contributed: Number(contributed.toFixed(2)),
        });
      }

      const last = series[series.length - 1];

      if (!last) {
        throw new Error('Simulation produced no results');
      }

      const summary = {
        final_balance: last.balance,
        total_contributed: last.contributed,
        total_growth: Number(
          (last.balance - last.contributed).toFixed(2)
        ),
      };

      // 4. Record success metrics
      const toolMetrics = metrics.recordSuccess(ctx);
      recordToolMetrics(toolMetrics);

      return {
        tool_call: { tool: 'finance.simulate', args, status: 'success', result: summary },
        data: { summary, series },
      };
    } catch (error) {
      // 5. Error handling with standardized codes
      let toolError = wrapError(error, 'finance.simulate');

      // Record error metrics
      const toolMetrics = metrics.recordError(toolError.code, ctx);
      recordToolMetrics(toolMetrics);

      throw toolError;
    }
  },
};
