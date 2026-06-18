import type { Citation } from '@/lib/agente/agent.response.types';
import { getPublicCitationTitle, isPublicCitationRenderable } from '@financial-agent/shared';

type CitationBubbleProps = {
  citation: Citation;
};

export function getCitationLabel(citation: Citation): string {
  const label = getPublicCitationTitle({
    title: citation.title,
    source: citation.source,
    url: citation.url,
  });
  if (label) return label;
  return 'Fuente';
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
