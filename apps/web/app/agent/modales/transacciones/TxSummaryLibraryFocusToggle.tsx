'use client';

import { PanelLeft, PanelLeftClose } from 'lucide-react';

type TxSummaryLibraryFocusToggleProps = {
  libraryHidden: boolean;
  onToggle: () => void;
};

export function TxSummaryLibraryFocusToggle({
  libraryHidden,
  onToggle,
}: TxSummaryLibraryFocusToggleProps) {
  return (
    <div className="tx-summary-focus-toolbar" role="toolbar" aria-label="Vista del resumen">
      <button
        type="button"
        className="tx-summary-focus-btn focus-ring"
        onClick={onToggle}
        aria-pressed={libraryHidden}
        aria-label={libraryHidden ? 'Mostrar biblioteca de productos' : 'Ocultar biblioteca y ampliar resumen'}
      >
        {libraryHidden ? (
          <>
            <PanelLeft size={14} strokeWidth={2} aria-hidden />
            <span>Biblioteca</span>
          </>
        ) : (
          <>
            <PanelLeftClose size={14} strokeWidth={2} aria-hidden />
            <span>Solo resumen</span>
          </>
        )}
      </button>
    </div>
  );
}
