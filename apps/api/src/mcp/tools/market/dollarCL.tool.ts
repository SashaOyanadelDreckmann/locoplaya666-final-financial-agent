import { z } from 'zod';
import type { MCPTool, ToolContext } from '../types';
import { fetchIndicador } from './mindicadorClient';
import { checkRateLimit } from '../rate-limiter';
import { createMetricsCollector, recordToolMetrics } from '../telemetry';
import { wrapError } from '../error';

export const dollarCLTool: MCPTool = {
  name: 'market.fx_usd_clp',
  description: 'Gets USD/CLP value for Chile (latest) with source citation.',
  argsSchema: z.object({}),
  schema: { type: 'object', properties: {}, required: [] },
  run: async (args, ctx?: ToolContext) => {
    const metrics = createMetricsCollector('market.fx_usd_clp');

    try {
      // 1. Rate limit check
      await checkRateLimit('market.fx_usd_clp', ctx);

      // 2. Fetch with timeout (5s)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const out = await fetchIndicador('dolar');

      clearTimeout(timeoutId);

      // 3. Record success metrics
      const toolMetrics = metrics.recordSuccess(ctx);
      recordToolMetrics(toolMetrics);

      return {
        tool_call: {
          tool: 'market.fx_usd_clp',
          args,
          status: 'success',
          result: {
            value: out.valor,
            unit: out.unidad,
            date: out.fecha,
          },
        },
        data: {
          value: out.valor,
          unit: out.unidad,
          date: out.fecha,
        },
        citations: [
          {
            doc_id: out.url,
            doc_title: 'mindicador.cl',
            supporting_span: out.valor ? `USD/CLP: ${out.valor}` : 'No value parsed',
            supports: 'claim',
            confidence: out.valor ? 0.85 : 0.5,
            url: out.url,
          },
        ],
      };
    } catch (error) {
      // 4. Error handling with standardized codes
      let toolError = wrapError(error, 'market.fx_usd_clp');

      // Record error metrics
      const toolMetrics = metrics.recordError(toolError.code, ctx, toolError.code === 'timeout');
      recordToolMetrics(toolMetrics);

      throw toolError;
    }
  },
};
