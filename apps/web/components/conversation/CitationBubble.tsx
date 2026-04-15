import type { Citation } from '@/lib/agent.response.types';

type CitationBubbleProps = {
  citation: Citation;
};

export function CitationBubble({ citation }: CitationBubbleProps) {
  return (
    <div className="citation-bubble">
      <strong>{citation.title ?? citation.source}</strong>
      {citation.url ? (
        <div>
          <a href={citation.url} target="_blank" rel="noreferrer">
            Ver fuente
          </a>
        </div>
      ) : null}
    </div>
  );
}
