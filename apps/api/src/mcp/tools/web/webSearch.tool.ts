import { z } from 'zod';
import type { MCPTool, ToolContext } from '../types';
import { checkRateLimit } from '../rate-limiter';
import { sanitizeSearchQuery, sanitizeLargeText } from '../input-sanitizer';
import { createMetricsCollector, recordToolMetrics } from '../telemetry';
import { wrapError, timeoutError } from '../error';

type SearchHit = {
  title: string;
  url: string;
  snippet?: string;
};

function decodeHtml(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTags(input: string): string {
  return decodeHtml(input.replace(/<[^>]+>/g, ' '));
}

function unwrapDuckDuckGoRedirect(href: string): string {
  try {
    const parsed = new URL(href, 'https://duckduckgo.com');
    if (!parsed.pathname.startsWith('/l/')) return href;
    const target = parsed.searchParams.get('uddg');
    return target ? decodeURIComponent(target) : href;
  } catch {
    return href;
  }
}

function parseSearchResults(html: string, limit: number): SearchHit[] {
  const blocks = html.split('class="result"');
  const hits: SearchHit[] = [];

  for (const block of blocks) {
    if (hits.length >= limit) break;

    const linkMatch = block.match(
      /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i
    );
    if (!linkMatch) continue;

    const rawHref = decodeHtml(linkMatch[1]);
    const url = unwrapDuckDuckGoRedirect(rawHref);
    const title = stripTags(linkMatch[2]);
    if (!url || !title) continue;

    const snippetMatch = block.match(
      /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i
    );
    const snippet = snippetMatch ? stripTags(snippetMatch[1]) : undefined;

    hits.push({ title, url, snippet });
  }

  return hits;
}

export const webSearchTool: MCPTool = {
  name: 'web.search',
  description:
    'Busca en internet por texto libre y retorna resultados con enlaces y resumen.',
  argsSchema: z.object({
    query: z.string().min(2),
    limit: z.number().int().min(1).max(10).optional().default(5),
  }),
  schema: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      limit: { type: 'number' },
    },
    required: ['query'],
  },
  run: async (args, ctx?: ToolContext) => {
    const metrics = createMetricsCollector('web.search');

    try {
      // 1. Input validation
      const query = sanitizeSearchQuery(String(args.query), 'web.search');
      const limit = Math.min(Number(args.limit ?? 5), 10);

      // 2. Rate limit check
      await checkRateLimit('web.search', ctx);

      // 3. Execute with timeout (5 seconds)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const endpoint = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const res = await fetch(endpoint, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; FinancialAgent/1.0)',
        },
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      // 4. Parse response with size limit (1MB)
      let html = await res.text();
      html = sanitizeLargeText(html, 1024 * 1024, 'web.search');

      const results = parseSearchResults(html, limit);

      // 5. Record success metrics
      const toolMetrics = metrics.recordSuccess(ctx);
      recordToolMetrics(toolMetrics);

      return {
        tool_call: {
          tool: 'web.search',
          args,
          status: 'success',
          result: {
            total: results.length,
            query,
          },
        },
        data: {
          query,
          total: results.length,
          results,
        },
        citations: results.slice(0, 3).map((r) => ({
          doc_id: r.url,
          doc_title: r.title,
          supporting_span: r.snippet ?? 'Resultado de busqueda web',
          supports: 'claim' as const,
          confidence: 0.65,
          url: r.url,
        })),
      };
    } catch (error) {
      // 6. Error handling with standardized codes
      let toolError = wrapError(error, 'web.search');

      // Check if it's an abort (timeout)
      if (error instanceof Error && error.name === 'AbortError') {
        toolError = timeoutError('web.search', 5000);
      }

      // Record error metrics
      const toolMetrics = metrics.recordError(toolError.code, ctx, toolError.code === 'timeout');
      recordToolMetrics(toolMetrics);

      throw toolError;
    }
  },
};
