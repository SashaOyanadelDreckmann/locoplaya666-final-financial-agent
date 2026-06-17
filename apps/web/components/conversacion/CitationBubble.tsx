import type { Citation } from '@/lib/agente/agent.response.types';

type CitationBubbleProps = {
  citation: Citation;
};

export function getCitationLabel(citation: Citation): string {
  const title = citation.title?.trim();
  if (title) return title;

  const source = citation.source?.trim();
  if (source && !/^web$/i.test(source)) return source;

  const url = citation.url?.trim();
  if (url) {
    try {
      const host = new URL(url).hostname.replace(/^www\./i, '');
      if (host) return host;
    } catch {
      // ignore invalid URLs
    }
  }

  return source || 'Fuente';
}

export function CitationBubble({ citation }: CitationBubbleProps) {
  const label = getCitationLabel(citation);

  return (
    <div className="citation-bubble">
      {citation.url ? (
        <a href={citation.url} target="_blank" rel="noreferrer">
          {label}
        </a>
      ) : (
        <strong>{label}</strong>
      )}
    </div>
  );
}
