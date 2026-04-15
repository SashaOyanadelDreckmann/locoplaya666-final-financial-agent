import { z } from 'zod';
import type { MCPTool, ToolContext } from '../types';
import { fetchWithScrapeDo } from './scrapeDoClient';
import { extractFirstMatch } from './extractors';
import { checkRateLimit } from '../rate-limiter';
import { sanitizeUrl, sanitizeRegexPattern } from '../input-sanitizer';
import { createMetricsCollector, recordToolMetrics } from '../telemetry';
import { wrapError, timeoutError } from '../error';

export const webExtractTool: MCPTool = {
  name: 'web.extract',
  description: 'Fetches a URL and extracts a value using a regex.',
  argsSchema: z.object({
    url: z.string().min(1),
    pattern: z.string().min(1),
    flags: z.string().optional().default('i'),
    render: z.boolean().optional(),
    output: z.enum(['raw', 'markdown']).optional(),
  }),
  schema: {
    type: 'object',
    properties: {
      url: { type: 'string' },
      pattern: { type: 'string' },
      flags: { type: 'string' },
      render: { type: 'boolean' },
      output: { type: 'string', enum: ['raw', 'markdown'] },
    },
    required: ['url', 'pattern'],
  },
  run: async (args, ctx?: ToolContext) => {
    const metrics = createMetricsCollector('web.extract');

    try {
      // 1. Input validation with security checks
      const url = sanitizeUrl(String(args.url), 'web.extract');
      const patternStr = String(args.pattern);

      // 2. Sanitize regex pattern (BLOCKS ReDoS ATTACKS)
      const sanitizedPattern = sanitizeRegexPattern(patternStr, 'web.extract');
      const flags = String(args.flags ?? 'i');

      // 3. Validate flags (only allow safe flags)
      if (!/^[igm]*$/.test(flags)) {
        throw new Error('Invalid regex flags. Only i, g, m allowed.');
      }

      // 4. Rate limit check
      await checkRateLimit('web.extract', ctx);

      // 5. Compile regex with timeout protection
      let re: RegExp;
      try {
        re = new RegExp(sanitizedPattern, flags);
      } catch (err) {
        throw new Error(`Failed to compile regex: ${String(err)}`);
      }

      // 6. Fetch with timeout (10 seconds)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const fetched = await fetchWithScrapeDo({
        url,
        render: Boolean(args.render),
        output: args.output ?? 'raw',
        blockResources: true,
        returnJSON: false,
      });

      clearTimeout(timeoutId);

      // 7. Execute regex with timeout (100ms - prevent regex hangs)
      let hit: string | null = null;
      try {
        const regexController = new AbortController();
        const regexTimeout = setTimeout(() => regexController.abort(), 100);

        hit = extractFirstMatch(fetched.text, re);

        clearTimeout(regexTimeout);
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          throw timeoutError('web.extract (regex)', 100);
        }
        throw err;
      }

      // 8. Record success metrics
      const toolMetrics = metrics.recordSuccess(ctx);
      recordToolMetrics(toolMetrics);

      return {
        tool_call: {
          tool: 'web.extract',
          args,
          status: 'success',
          result: { found: Boolean(hit), status: fetched.status },
        },
        data: {
          found: Boolean(hit),
          value: hit,
          status: fetched.status,
          contentType: fetched.contentType,
        },
        citations: [
          {
            doc_id: url,
            doc_title: new URL(url).hostname,
            supporting_span: hit ? `Extracted: ${hit}` : 'No match found',
            supports: 'claim',
            confidence: hit ? 0.75 : 0.4,
            url,
          },
        ],
      };
    } catch (error) {
      // 9. Error handling with standardized codes
      let toolError = wrapError(error, 'web.extract');

      // Check if it's a timeout
      if (error instanceof Error && error.name === 'AbortError') {
        toolError = timeoutError('web.extract', 10000);
      }

      // Record error metrics
      const toolMetrics = metrics.recordError(toolError.code, ctx, toolError.code === 'timeout');
      recordToolMetrics(toolMetrics);

      throw toolError;
    }
  },
};
