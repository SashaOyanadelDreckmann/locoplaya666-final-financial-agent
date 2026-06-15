'use client';

import { useId, useState } from 'react';

import { TX_PHOTO_FORMAT_EXAMPLES } from './tx-photo-format-examples';

export function TxPhotoFormatExamplesPanel() {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();

  return (
    <section className="tx-photo-format-examples" aria-label="Ejemplos de capturas para formato fotos">
      <button
        type="button"
        className="tx-photo-format-examples-toggle"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded((open) => !open)}
      >
        {expanded ? 'Ocultar ejemplo' : 'Ver ejemplo'}
      </button>

      {expanded ? (
        <div
          id={panelId}
          className="tx-photo-format-examples-grid"
          role="list"
          aria-label="Ejemplos de capturas para formato fotos"
        >
          {TX_PHOTO_FORMAT_EXAMPLES.map((example, index) => (
            <figure key={example.id} className="tx-photo-format-examples-item" role="listitem">
              <div className="tx-photo-format-examples-frame">
                <img src={example.src} alt={example.alt} loading="lazy" decoding="async" />
              </div>
              <figcaption>
                <span className="tx-photo-format-examples-index" aria-hidden="true">
                  {index + 1}
                </span>
                {example.caption}
              </figcaption>
            </figure>
          ))}
        </div>
      ) : null}
    </section>
  );
}
