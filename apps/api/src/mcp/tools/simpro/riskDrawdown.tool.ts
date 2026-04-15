import { z } from 'zod';
import type { MCPTool, ToolContext } from '../types';
import { checkRateLimit } from '../rate-limiter';
import { validateArrayLength } from '../input-sanitizer';
import { createMetricsCollector, recordToolMetrics } from '../telemetry';
import { wrapError } from '../error';

function maxDrawdown(values: number[]) {
  let peak = values[0] ?? 0;
  let maxDD = 0;
  let peakIdx = 0;
  let troughIdx = 0;

  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v > peak) {
      peak = v;
      peakIdx = i;
    }
    const dd = peak > 0 ? (peak - v) / peak : 0;
    if (dd > maxDD) {
      maxDD = dd;
      troughIdx = i;
    }
  }

  return {
    max_drawdown: Number(maxDD.toFixed(6)),
    peak_month: peakIdx + 1,
    trough_month: troughIdx + 1,
  };
}

export const riskDrawdownTool: MCPTool = {
  name: 'finance.risk_drawdown',
  description: "Computes maximum drawdown for a portfolio series.",
  argsSchema: z.object({
    series: z.array(z.object({ month: z.number().int().min(1), balance: z.number() })).optional(),
  }),
  run: async (args, ctx?: ToolContext) => {
    const metrics = createMetricsCollector('finance.risk_drawdown');

    try {
      // 1. Rate limit check
      await checkRateLimit('finance.risk_drawdown', ctx);

      // 2. Input validation
      if (!Array.isArray(args.series) || args.series.length < 2) {
        return {
          tool_call: { tool: 'finance.risk_drawdown', args, status: 'success', result: { requested: ['series'] } },
          data: { requested: ['series'] },
        };
      }

      validateArrayLength(args.series, 2, 5000, 'series', 'finance.risk_drawdown');

      const balances = args.series.map((p: any) => Number(p.balance));
      const dd = maxDrawdown(balances);

      // 3. Record success metrics
      const toolMetrics = metrics.recordSuccess(ctx);
      recordToolMetrics(toolMetrics);

      return {
        tool_call: { tool: 'finance.risk_drawdown', args, status: 'success', result: dd },
        data: { drawdown: dd },
      };
    } catch (error) {
      // 4. Error handling with standardized codes
      let toolError = wrapError(error, 'finance.risk_drawdown');

      // Record error metrics
      const toolMetrics = metrics.recordError(toolError.code, ctx);
      recordToolMetrics(toolMetrics);

      throw toolError;
    }
  },
};
