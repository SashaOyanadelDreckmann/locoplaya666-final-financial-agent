import { EVIDENCE_TOOL_NAMES } from '../transacciones/evidence-policy';

export type PublicCitationLike = {
  doc_id?: string;
  doc_title?: string;
  source?: string;
  url?: string;
  title?: string;
  supporting_span?: string;
};

const INTERNAL_TOOL_NAME_SET = new Set(
  EVIDENCE_TOOL_NAMES.map((name) => name.toLowerCase()),
);

const INTERNAL_TOOL_PATTERN =
  /^(?:web|rag|market|finance|math|agent|regulatory)\.[a-z0-9_.-]+$/i;

const INTERNAL_DOC_ID_PATTERN = /^(?:agent|tool|prefetch):/i;

export function isInternalToolCitationLabel(value: unknown): boolean {
  const label = String(value ?? '').trim().toLowerCase();
  if (!label) return false;
  if (INTERNAL_TOOL_NAME_SET.has(label)) return true;
  if (INTERNAL_DOC_ID_PATTERN.test(label)) return true;
  if (INTERNAL_TOOL_PATTERN.test(label)) return true;
  if (label === 'marco de referencia temporal') return true;
  if (label === 'fuente' || label === 'fuente web') return false;
  return false;
}

export function isInternalToolCitation(citation: PublicCitationLike): boolean {
  const fields = [
    citation.doc_id,
    citation.doc_title,
    citation.source,
    citation.title,
  ];
  return fields.some((field) => isInternalToolCitationLabel(field));
}

export function hasPublicCitationUrl(citation: PublicCitationLike): boolean {
  const raw = String(citation.url ?? '').trim();
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    const host = parsed.hostname.toLowerCase();
    return host !== 'localhost' && host !== '127.0.0.1' && host !== '::1';
  } catch {
    return false;
  }
}

export function getPublicCitationTitle(citation: PublicCitationLike): string {
  const title = String(citation.doc_title ?? citation.title ?? '').trim();
  if (title && !isInternalToolCitationLabel(title)) return title;

  const source = String(citation.source ?? '').trim();
  if (source && !isInternalToolCitationLabel(source) && !/^web$/i.test(source)) {
    return source;
  }

  if (hasPublicCitationUrl(citation)) {
    try {
      return new URL(String(citation.url)).hostname.replace(/^www\./i, '');
    } catch {
      // ignore
    }
  }

  const span = String(citation.supporting_span ?? '').trim();
  if (span.length >= 12 && !isInternalToolCitationLabel(span)) {
    return span.slice(0, 120);
  }

  return '';
}

export function isPublicCitationRenderable(citation: PublicCitationLike): boolean {
  if (!citation || typeof citation !== 'object') return false;
  if (isInternalToolCitation(citation)) return false;
  if (hasPublicCitationUrl(citation)) return true;
  return getPublicCitationTitle(citation).length >= 4;
}

export function sanitizePublicCitations<T extends PublicCitationLike>(citations: T[] | undefined): T[] {
  if (!Array.isArray(citations)) return [];

  const merged = new Map<string, T>();
  for (const citation of citations) {
    if (!isPublicCitationRenderable(citation)) continue;
    const key = hasPublicCitationUrl(citation)
      ? String(citation.url).trim().toLowerCase()
      : getPublicCitationTitle(citation).toLowerCase();
    if (!key) continue;
    if (!merged.has(key)) merged.set(key, citation);
  }

  return [...merged.values()].slice(0, 8);
}

export function stripInternalToolSourceLines(message: string): string {
  const lines = String(message ?? '').split('\n');
  const filtered = lines.filter((line) => {
    const trimmed = line.trim();
    if (!/^fuentes?\s*:/i.test(trimmed)) return true;
    const payload = trimmed.replace(/^fuentes?\s*:\s*/i, '');
    const parts = payload
      .split(/[,;|]/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length === 0) return false;
    return !parts.every((part) => isInternalToolCitationLabel(part));
  });
  return filtered.join('\n').trim();
}
