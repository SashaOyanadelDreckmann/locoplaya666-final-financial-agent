import type { Citation } from '../../../agents/core.agent/chat.types';

export const TRUSTED_CHILE_HOST_SUFFIXES = [
  'cmfchile.cl',
  'cmfeduca.cl',
  'leychile.cl',
  'bcn.cl',
  'bcentral.cl',
  'hacienda.cl',
  'mindicador.cl',
] as const;

export function isTrustedChileUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    return TRUSTED_CHILE_HOST_SUFFIXES.some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`),
    );
  } catch {
    return false;
  }
}

export function stripHtmlToText(input: string): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3)
    .slice(0, 12);
}

function bestSnippet(text: string, tokens: string[]): string {
  const low = text.toLowerCase();
  let bestIdx = -1;
  let bestTokenLen = 0;

  for (const token of tokens) {
    const idx = low.indexOf(token);
    if (idx >= 0 && token.length > bestTokenLen) {
      bestIdx = idx;
      bestTokenLen = token.length;
    }
  }

  if (bestIdx === -1) {
    return text.slice(0, 480);
  }

  const start = Math.max(0, bestIdx - 180);
  const end = Math.min(text.length, bestIdx + 320);
  return text.slice(start, end);
}

export type TrustedPageRead = {
  url: string;
  title: string;
  excerpt: string;
};

export async function fetchTrustedPageExcerpt(
  url: string,
  query: string,
  timeoutMs = 8000,
): Promise<TrustedPageRead | null> {
  if (!isTrustedChileUrl(url)) return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'FinancialAgent/1.0 (trusted read)' },
    });
    if (!res.ok) return null;

    const html = await res.text();
    const text = stripHtmlToText(html);
    if (!text || text.length < 80) return null;

    const tokens = tokenizeQuery(query);
    const excerpt = bestSnippet(text, tokens);
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? stripHtmlToText(titleMatch[1]) : 'Fuente Chile';

    return { url, title, excerpt };
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function pickTrustedSearchUrl(
  results: Array<{ url?: string }> | undefined,
): string | null {
  if (!Array.isArray(results)) return null;
  for (const hit of results) {
    const url = typeof hit?.url === 'string' ? hit.url : '';
    if (url && isTrustedChileUrl(url)) return url;
  }
  return null;
}

export function buildTrustedPageCitation(read: TrustedPageRead): Citation {
  return {
    doc_id: read.url,
    doc_title: read.title,
    supporting_span: read.excerpt,
    supports: 'claim',
    confidence: 0.82,
    url: read.url,
  };
}

export async function enrichWebSearchWithTrustedRead(params: {
  query: string;
  results?: Array<{ url?: string; title?: string; snippet?: string }>;
}): Promise<{ trusted_page_read: TrustedPageRead | null; citation: Citation | null }> {
  const trustedUrl = pickTrustedSearchUrl(params.results);
  if (!trustedUrl) {
    return { trusted_page_read: null, citation: null };
  }

  const read = await fetchTrustedPageExcerpt(trustedUrl, params.query);
  if (!read) {
    return { trusted_page_read: null, citation: null };
  }

  return {
    trusted_page_read: read,
    citation: buildTrustedPageCitation(read),
  };
}
