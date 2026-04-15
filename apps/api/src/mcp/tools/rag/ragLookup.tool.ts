import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import type { MCPTool, ToolContext } from '../types';
import { sanitizeSearchQuery } from '../input-sanitizer';
import { createMetricsCollector, recordToolMetrics } from '../telemetry';
import { wrapError } from '../error';

// __dirname = apps/api/src/mcp/tools/rag/
// rag_data  = apps/rag_data/
const RAG_DATA_DIR = path.resolve(__dirname, '../../../../../rag_data');
const MCP_DIR = path.resolve(__dirname, '../../');

function collectFiles(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(root)) {
    const p = path.join(root, entry);
    const stat = fs.statSync(p);
    if (stat.isDirectory()) out.push(...collectFiles(p));
    else if (/\.(md|json|txt)$/i.test(entry)) out.push(p);
  }
  return out;
}

function readSafe(p: string): string {
  try { return fs.readFileSync(p, 'utf-8'); } catch { return ''; }
}

/** Extract frontmatter title (--- titulo: ... ---) or fall back to filename */
function extractTitle(content: string, filePath: string): string {
  const m = content.match(/^---[\s\S]*?titulo:\s*(.+?)[\r\n]/m);
  if (m) return m[1].trim();
  const m2 = content.match(/^#\s+(.+)/m);
  if (m2) return m2[1].trim();
  return path.basename(filePath, path.extname(filePath)).replace(/[-_]/g, ' ');
}

/** Score a document against query terms; returns hits count + best snippet */
function scoreAndSnippet(
  content: string,
  terms: string[],
): { score: number; snippets: string[] } {
  const low = content.toLowerCase();
  let score = 0;
  const snippets: string[] = [];

  for (const term of terms) {
    let pos = 0;
    let termHits = 0;
    while ((pos = low.indexOf(term, pos)) !== -1) {
      score += 1;
      termHits++;
      if (termHits <= 2) {
        const start = Math.max(0, pos - 120);
        const end = Math.min(content.length, pos + 200);
        snippets.push(content.slice(start, end).replace(/\s+/g, ' ').trim());
      }
      pos += term.length;
    }
  }

  return { score, snippets };
}

export const ragLookupTool: MCPTool = {
  name: 'rag.lookup',
  description:
    'Busca información financiera en el corpus RAG local (CMF, normativa, mercado, papers académicos). ' +
    'Retorna citas con fragmentos relevantes. Úsalo para preguntas sobre regulación, productos bancarios, ' +
    'APV, fondos mutuos, seguros, tasas de crédito, leyes Fintech o conceptos del sistema financiero chileno.',
  argsSchema: z.object({
    query: z.string().min(1),
    limit: z.number().optional(),
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
    const metrics = createMetricsCollector('rag.lookup');

    try {
      // 1. Input validation
      const rawQuery = sanitizeSearchQuery(String(args.query), 'rag.lookup');
      const limit = Math.max(1, Math.min(10, Math.floor(Number(args.limit ?? 5))));

      // 2. Split query into meaningful terms (≥3 chars)
      const terms = rawQuery
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length >= 3);
      if (terms.length === 0) terms.push(rawQuery.toLowerCase());

      // 3. Primary corpus: rag_data (all subdirs)
      const primaryFiles = collectFiles(RAG_DATA_DIR);

      // 4. Secondary corpus: legacy mcp knowledge/guides dirs
      const secondaryFiles = [
        ...collectFiles(path.join(MCP_DIR, 'knowledge')),
        ...collectFiles(path.join(MCP_DIR, 'guides')),
        ...collectFiles(path.join(MCP_DIR, 'contracts')),
        ...collectFiles(path.join(MCP_DIR, 'examples')),
      ];

      const allFiles = [...primaryFiles, ...secondaryFiles];

      type Hit = {
        file: string;
        title: string;
        score: number;
        snippets: string[];
        isPrimary: boolean;
      };

      const hits: Hit[] = [];

      for (const f of allFiles) {
        const content = readSafe(f);
        if (!content) continue;

        const { score, snippets } = scoreAndSnippet(content, terms);
        if (score === 0) continue;

        hits.push({
          file: f,
          title: extractTitle(content, f),
          score: score + (primaryFiles.includes(f) ? 0.5 : 0), // boost primary corpus
          snippets,
          isPrimary: primaryFiles.includes(f),
        });
      }

      hits.sort((a, b) => b.score - a.score);
      const top = hits.slice(0, limit);

      const citations = top.flatMap((h, i) =>
        h.snippets.slice(0, 2).map((snippet, j) => ({
          doc_id: h.file,
          doc_title: h.title,
          chunk_id: `rag_${i}_${j}`,
          supporting_span: snippet,
          supports: 'claim' as const,
          confidence: Math.min(0.95, 0.6 + h.score * 0.04),
          url: undefined,
        })),
      ).slice(0, limit);

      // 5. Record success metrics
      const toolMetrics = metrics.recordSuccess(ctx);
      recordToolMetrics(toolMetrics);

      return {
        tool_call: { tool: 'rag.lookup', args, status: 'success', result: { found: citations.length } },
        data: { found: citations.length, citations },
        citations,
      };
    } catch (error) {
      // 6. Error handling with standardized codes
      let toolError = wrapError(error, 'rag.lookup');

      // Record error metrics
      const toolMetrics = metrics.recordError(toolError.code, ctx);
      recordToolMetrics(toolMetrics);

      throw toolError;
    }
  },
};
