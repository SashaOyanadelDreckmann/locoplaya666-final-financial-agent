'use client';

import type { WelcomeProductHint } from '@financial-agent/shared';

type WelcomeProductHintsStripProps = {
  hints: WelcomeProductHint[];
};

export function WelcomeProductHintsStrip({ hints }: WelcomeProductHintsStripProps) {
  if (!hints.length) return null;

  return (
    <div className="welcome-product-hints" aria-label="Referencias de productos financieros">
      {hints.map((hint) => (
        <div key={`${hint.label}-${hint.fact.slice(0, 24)}`} className="welcome-product-hints__item">
          <span className="welcome-product-hints__label">{hint.label}</span>
          <p className="welcome-product-hints__fact">{hint.fact}</p>
          {hint.url ? (
            <a
              className="welcome-product-hints__source"
              href={hint.url}
              target="_blank"
              rel="noreferrer"
            >
              {hint.source}
            </a>
          ) : (
            <span className="welcome-product-hints__source">{hint.source}</span>
          )}
        </div>
      ))}
    </div>
  );
}

export default WelcomeProductHintsStrip;
