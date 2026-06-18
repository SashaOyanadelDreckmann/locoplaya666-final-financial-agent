import type { Citation } from '../chat.types';
import type { FormatPhaseInput } from '../agent-types';
import { retrieveRAGContext } from '../../../services/rag.service';
import {
  buildMarketPanelCitations,
  EVIDENCE_TOOL_NAMES,
  isFactualInfoMode,
  sanitizePublicCitations,
  type FactualInfoMode,
} from '@financial-agent/shared';

type LooseCitation = Partial<Citation> & { url?: string; doc_id?: string; doc_title?: string };

function citationKey(citation: LooseCitation): string {
  return String(citation.url ?? citation.doc_id ?? citation.doc_title ?? '').trim().toLowerCase();
}

export function mergeCitations(...groups: Array<Citation[] | undefined>): Citation[] {
  const merged = new Map<string, Citation>();
  for (const group of groups) {
    if (!Array.isArray(group)) continue;
    for (const citation of group) {
      if (!citation || typeof citation !== 'object') continue;
      const key = citationKey(citation);
      if (!key) continue;
      if (!merged.has(key)) merged.set(key, citation);
    }
  }
  return [...merged.values()];
}

export function buildMarketSnapshotCitations(marketSnapshot: unknown): Citation[] {
  return buildMarketPanelCitations(marketSnapshot).map((entry) => ({
    doc_id: entry.url ?? entry.source,
    doc_title: entry.title ?? entry.source,
    supporting_span: entry.supporting_span ?? 'Referencia de mercado',
    supports: 'claim' as const,
    confidence: 0.95,
    url: entry.url,
  }));
}

export function extractCitationsFromToolOutputs(
  toolOutputs: Array<{ tool?: string; data?: unknown }> | undefined,
): Citation[] {
  if (!Array.isArray(toolOutputs)) return [];

  const citations: Citation[] = [];

  for (const output of toolOutputs) {
    const tool = String(output?.tool ?? '');
    const data = output?.data;
    if (!data || typeof data !== 'object') continue;
    const record = data as Record<string, unknown>;

    if (tool === 'web.search') {
      const resultRows = Array.isArray(record.results)
        ? record.results
        : Array.isArray((record as { data?: { results?: unknown[] } }).data?.results)
          ? ((record as { data?: { results?: unknown[] } }).data?.results ?? [])
          : [];

      for (const hit of resultRows.slice(0, 4)) {
        if (!hit || typeof hit !== 'object') continue;
        const row = hit as Record<string, unknown>;
        const url = typeof row.url === 'string' ? row.url : undefined;
        const title = typeof row.title === 'string' ? row.title : 'Fuente web';
        if (!url) continue;
        citations.push({
          doc_id: url,
          doc_title: title,
          supporting_span:
            typeof row.snippet === 'string' ? row.snippet : 'Resultado de búsqueda web verificable',
          supports: 'claim',
          confidence: 0.72,
          url,
        });
      }

      const trustedRead = record.trusted_page_read;
      if (trustedRead && typeof trustedRead === 'object') {
        const read = trustedRead as Record<string, unknown>;
        const url = typeof read.url === 'string' ? read.url : undefined;
        const title = typeof read.title === 'string' ? read.title : 'Fuente Chile';
        const excerpt = typeof read.excerpt === 'string' ? read.excerpt : undefined;
        if (url && excerpt) {
          citations.push({
            doc_id: url,
            doc_title: title,
            supporting_span: excerpt,
            supports: 'claim',
            confidence: 0.82,
            url,
          });
        }
      }
      continue;
    }

    if (Array.isArray(record.citations)) {
      for (const entry of record.citations.slice(0, 4)) {
        if (!entry || typeof entry !== 'object') continue;
        citations.push(entry as Citation);
      }
    }
  }

  return citations;
}

function usedSuccessfulEvidenceTools(input: FormatPhaseInput): boolean {
  return (input.execution_result?.tool_calls ?? []).some((call) => {
    const tool = String(call.tool ?? '');
    return (
      (EVIDENCE_TOOL_NAMES as readonly string[]).includes(tool) &&
      call.status !== 'error'
    );
  });
}

export async function ensureEvidenceCitations(input: FormatPhaseInput): Promise<Citation[]> {
  const fromExecution = input.execution_result?.citations ?? [];
  const fromTools = extractCitationsFromToolOutputs(input.execution_result?.tool_outputs);
  const fromMarket = buildMarketSnapshotCitations(input.context_summary?.market_snapshot);

  let merged = mergeCitations(fromExecution, fromTools, fromMarket);

  const needsCitationBackstop =
    isFactualInfoMode(input.mode) || usedSuccessfulEvidenceTools(input);

  if (merged.length === 0 && needsCitationBackstop) {
    try {
      const fallback = await retrieveRAGContext(
        `${input.user_message} CMF Ley 21.521 glosario financiero Chile`,
        { mode: input.mode, intent: input.user_message },
      );
      merged = mergeCitations(merged, fallback);
    } catch {
      // non-blocking
    }
  }

  if (merged.length === 0 && isFactualInfoMode(input.mode) && !usedSuccessfulEvidenceTools(input)) {
    const referenceDate =
      typeof input.context_summary?.reference_date === 'string'
        ? input.context_summary.reference_date
        : new Date().toISOString().slice(0, 10);
    merged = [
      {
        doc_id: 'agent:reference-date',
        doc_title: 'Marco de referencia temporal',
        supporting_span: `Respuesta contextualizada con fecha de referencia ${referenceDate} (Chile).`,
        supports: 'procedure',
        confidence: 0.55,
      },
    ];
  }

  return sanitizePublicCitations(merged).slice(0, 8);
}

export function buildReferenceDateContext(): {
  reference_date: string;
  reference_timezone: string;
} {
  return {
    reference_date: new Date().toISOString().slice(0, 10),
    reference_timezone: 'America/Santiago',
  };
}
