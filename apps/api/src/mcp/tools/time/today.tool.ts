import { z } from 'zod';
import type { MCPTool } from '../types';
import {
  createMetricsCollector,
  recordToolMetrics,
} from '../../security/telemetry';
import {
  validateNumericRange,
} from '../../security/input-sanitizer';
import { wrapError } from '../../security/error';

const TOOL_NAME = 'time.today';

/**
 * Returns today's date in ISO format (YYYY-MM-DD) and timezone offset.
 * Supports computing date in different timezone offsets.
 * Includes metrics collection and error handling.
 */
export const todayTool: MCPTool = {
  name: TOOL_NAME,
  description:
    'Returns today date in ISO (YYYY-MM-DD) and timezone offset. Supports custom timezone offset (minutes from UTC).',
  argsSchema: z.object({
    tzOffsetMinutes: z.number().optional(), // if provided, compute date in that offset
  }),
  schema: {
    type: 'object',
    properties: { tzOffsetMinutes: { type: 'number' } },
    required: [],
  },
  run: async (args) => {
    const metrics = createMetricsCollector(TOOL_NAME);

    try {
      // Validate offset if provided (range: -14 to +14 hours)
      let offsetMin: number | null = null;
      if (typeof args.tzOffsetMinutes === 'number') {
        offsetMin = validateNumericRange(
          Math.trunc(args.tzOffsetMinutes),
          -840, // -14 hours
          840, // +14 hours
          'tzOffsetMinutes'
        );
      }

      // Compute date
      const now = new Date();
      const ms =
        offsetMin === null
          ? now.getTime()
          : now.getTime() +
            offsetMin * 60_000 -
            now.getTimezoneOffset() * 60_000;

      const d = new Date(ms);
      const iso = d.toISOString().slice(0, 10);

      // Record metrics
      const metrics_result = metrics.recordSuccess();
      recordToolMetrics(metrics_result);

      return {
        tool_call: {
          tool: TOOL_NAME,
          args,
          status: 'success',
          result: { date: iso },
        },
        data: {
          date: iso,
          tzOffsetMinutes: offsetMin ?? -now.getTimezoneOffset(),
        },
      };
    } catch (error) {
      const toolError = wrapError(error, TOOL_NAME);
      const metrics_error = metrics.recordError(toolError.code);
      recordToolMetrics(metrics_error);
      throw toolError;
    }
  },
};
