'use client';

import type { Artifact } from '@/lib/agent.response.types';
import { getApiBaseUrl } from '@/lib/apiBase';

type DocumentBubbleProps = {
  artifact: Artifact;
  onSaved?: (payload: { artifact: Artifact; publicUrl: string; sourceRect: DOMRect | null }) => void;
};

export function DocumentBubble({ artifact, onSaved }: DocumentBubbleProps) {
  const resolveArtifactUrl = (raw?: string) => {
    if (!raw) return '#';
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith('/')) return `${getApiBaseUrl()}${raw}`;
    return `${getApiBaseUrl()}/${raw.replace(/^\/+/, '')}`;
  };

  const url = resolveArtifactUrl(artifact.fileUrl ?? artifact.previewImageUrl);
  const documentTitle = artifact.title || 'Documento';

  return (
    <article
      className="document-bubble"
      role="region"
      aria-label={`Documento: ${documentTitle}`}
    >
      <div className="document-bubble-content">
        <h4 className="document-bubble-title">{documentTitle}</h4>
        {artifact.description && (
          <p className="document-bubble-desc">{artifact.description}</p>
        )}
      </div>
      <div className="document-bubble-actions">
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="document-btn document-btn-secondary focus-ring"
          aria-label={`Abrir documento: ${documentTitle}`}
        >
          Abrir
        </a>
        <button
          type="button"
          className="document-btn document-btn-secondary focus-ring"
          onClick={(e) => {
            const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
            onSaved?.({ artifact, publicUrl: url, sourceRect: rect });
          }}
          aria-label={`Guardar documento: ${documentTitle}`}
        >
          Guardar
        </button>
      </div>
    </article>
  );
}
