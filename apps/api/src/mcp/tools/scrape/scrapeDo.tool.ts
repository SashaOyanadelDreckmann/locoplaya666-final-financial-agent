import { z } from 'zod';
import type { MCPTool } from '../types';
import {
  ToolError,
  wrapError,
  timeoutError,
} from '../../security/error';
import { checkRateLimit } from '../../security/rate-limiter';
import {
  sanitizeUrl,
  sanitizeLargeText,
  sanitizeString,
} from '../../security/input-sanitizer';
import {
  createMetricsCollector,
  recordToolMetrics,
} from '../../security/telemetry';

const TOOL_NAME = 'web.scrape';
const TIMEOUT_MS = 10000; // 10 seconds
const MAX_RESPONSE_SIZE = 5 * 1024 * 1024; // 5MB

function requireToken(): string {
  const token = process.env.SCRAPE_DO_API_KEY;
  if (!token) throw new Error('SCRAPE_DO_API_KEY not set');
  return token;
}

/**
 * Fetch from Scrape.do with retry logic
 * Implements exponential backoff for transient failures
 */
async function fetchWithRetry(
  url: string,
  maxRetries = 3
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        TIMEOUT_MS
      );

      const response = await fetch(url, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response;
    } catch (err) {
      lastError = err as Error;

      // Don't retry on last attempt
      if (attempt < maxRetries - 1) {
        // Exponential backoff: 100ms, 200ms, 400ms
        const delayMs = 100 * Math.pow(2, attempt);
        await new Promise((resolve) =>
          setTimeout(resolve, delayMs)
        );
      }
    }
  }

  throw lastError || new Error('Fetch failed after retries');
}

export const scrapeDoTool: MCPTool = {
  name: TOOL_NAME,
  description:
    'Fetches public web pages via Scrape.do (handles anti-bot). Returns raw text or markdown. Subject to rate limiting (5 req/min) and 10s timeout.',
  argsSchema: z.object({
    url: z.string().min(1),
    render: z.boolean().optional(),
    device: z.enum(['desktop', 'mobile', 'tablet']).optional(),
    geoCode: z.string().optional(),
    timeout: z.number().optional(),
    output: z.enum(['raw', 'markdown']).optional(),
    blockResources: z.boolean().optional(),
    returnJSON: z.boolean().optional(),
  }),
  schema: {
    type: 'object',
    properties: {
      url: { type: 'string' },
      render: { type: 'boolean' },
      device: {
        type: 'string',
        enum: ['desktop', 'mobile', 'tablet'],
      },
      geoCode: { type: 'string' },
      timeout: { type: 'number' },
      output: { type: 'string', enum: ['raw', 'markdown'] },
      blockResources: { type: 'boolean' },
      returnJSON: { type: 'boolean' },
    },
    required: ['url'],
  },
  run: async (args, { user_id } = {}) => {
    const metrics = createMetricsCollector(TOOL_NAME);

    try {
      // 1. Input validation & sanitization
      const url = sanitizeUrl(String(args.url));

      // 2. Rate limiting check
      const limiterUserId = user_id || 'anonymous';
      checkRateLimit(limiterUserId, TOOL_NAME);

      // 3. Prepare request parameters
      const token = requireToken();
      const params = new URLSearchParams();
      params.set('token', token);
      params.set('url', url);

      if (typeof args.render === 'boolean')
        params.set('render', String(args.render));
      if (args.device) params.set('device', args.device);
      if (args.geoCode)
        params.set(
          'geoCode',
          sanitizeString(args.geoCode, { max: 100 })
        );
      if (typeof args.timeout === 'number')
        params.set('timeout', String(args.timeout));
      if (args.output) params.set('output', args.output);
      if (typeof args.blockResources === 'boolean')
        params.set('blockResources', String(args.blockResources));
      if (typeof args.returnJSON === 'boolean')
        params.set('returnJSON', String(args.returnJSON));

      const endpoint = `https://api.scrape.do/?${params.toString()}`;

      // 4. Execute fetch with timeout & retry logic
      const res = await fetchWithRetry(endpoint);
      const contentType = res.headers.get('content-type') ?? '';

      // 5. Read response with size limit
      let text = await res.text();
      if (text.length > MAX_RESPONSE_SIZE) {
        text = sanitizeLargeText(text, MAX_RESPONSE_SIZE);
      }

      if (!res.ok) {
        throw new ToolError(
          `Scrape.do error ${res.status}: ${text.slice(0, 300)}`,
          'EXTERNAL_API_ERROR' as any,
          { retryable: res.status >= 500, statusCode: res.status }
        );
      }

      // 6. Parse response
      let data: any = text;
      if (contentType.includes('application/json')) {
        try {
          data = JSON.parse(text);
        } catch {
          // If JSON parsing fails, keep raw text
        }
      }

      // 7. Record metrics
      const metrics_result = metrics.recordSuccess();
      recordToolMetrics(metrics_result);

      return {
        tool_call: {
          tool: TOOL_NAME,
          args,
          status: 'success',
          result: {
            status: res.status,
            contentType,
            sizeBytes: text.length,
          },
        },
        data,
        citations: [
          {
            doc_id: url,
            doc_title: 'Web source',
            supporting_span: 'Fetched via Scrape.do',
            supports: 'claim',
            confidence: 0.7,
            url,
          },
        ],
      };
    } catch (error) {
      // Handle timeout specifically
      if (error instanceof Error && error.name === 'AbortError') {
        const toolError = timeoutError(TOOL_NAME, TIMEOUT_MS);
        const metrics_error = metrics.recordError(toolError.code);
        recordToolMetrics(metrics_error);
        throw toolError;
      }

      // Wrap other errors
      const toolError = error instanceof ToolError
        ? error
        : wrapError(error, TOOL_NAME);

      const metrics_error = metrics.recordError(toolError.code);
      recordToolMetrics(metrics_error);
      throw toolError;
    }
  },
};
