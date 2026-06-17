import { webSearchTool } from '../mcp/tools/web/webSearch.tool';
import {
  buildProductSearchQueries,
  type WelcomeProductHint,
} from '@financial-agent/shared';

type SearchHit = {
  title: string;
  url: string;
  snippet?: string;
};

function normalizeHint(hit: SearchHit, label: string): WelcomeProductHint | null {
  const fact = String(hit.snippet ?? hit.title ?? '').replace(/\s+/g, ' ').trim();
  if (!fact) return null;

  let source = 'Web';
  try {
    const host = new URL(hit.url).hostname.replace(/^www\./, '');
    if (host) source = host;
  } catch {
    // keep default source
  }

  return {
    label,
    fact: fact.length > 180 ? `${fact.slice(0, 177).trim()}…` : fact,
    source,
    url: hit.url,
  };
}

function labelForQuery(query: string): string {
  const normalized = query.toLowerCase();
  if (normalized.includes('esg') || normalized.includes('sostenib') || normalized.includes('impacto')) {
    return 'Finanzas con impacto';
  }
  if (normalized.includes('fintual')) return 'Fintual';
  if (normalized.includes('tarjeta') || normalized.includes('crédito') || normalized.includes('credito')) {
    return 'Tarjetas / crédito';
  }
  if (normalized.includes('acciones') || normalized.includes('corredora')) return 'Acciones';
  if (normalized.includes('deuda') || normalized.includes('refinanc')) return 'Deuda';
  if (normalized.includes('apv')) return 'APV';
  if (normalized.includes('cuenta')) return 'Cuentas';
  return 'Mercado Chile';
}

async function searchOnce(params: {
  userId: string;
  query: string;
}): Promise<WelcomeProductHint | null> {
  try {
    const result = await webSearchTool.run(
      { query: params.query, limit: 3 },
      { user_id: params.userId },
    );
    const results = Array.isArray((result.data as { results?: SearchHit[] } | undefined)?.results)
      ? ((result.data as { results: SearchHit[] }).results ?? [])
      : [];
    const hit = results.find((entry) => entry?.title && entry?.url);
    if (!hit) return null;
    return normalizeHint(hit, labelForQuery(params.query));
  } catch {
    return null;
  }
}

export async function researchWelcomeProductHints(params: {
  userId: string;
  intake: Record<string, unknown>;
  chatId: 'chat-1' | 'chat-2' | 'chat-3';
}): Promise<WelcomeProductHint[]> {
  const queries = buildProductSearchQueries(params.intake, params.chatId);
  const hints = await Promise.all(
    queries.map((query) => searchOnce({ userId: params.userId, query })),
  );

  const seen = new Set<string>();
  const unique: WelcomeProductHint[] = [];
  for (const hint of hints) {
    if (!hint) continue;
    const key = `${hint.label}:${hint.fact.slice(0, 40)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(hint);
  }

  return unique.slice(0, 3);
}
