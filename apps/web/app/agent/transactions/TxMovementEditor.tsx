'use client';

import { TX_CATEGORY_OPTIONS } from './constants';
import type { useMovementAnalytics } from './use-movement-analytics';

type MovementRow = MovementAnalytics['dedupedMovementRows'][number];
type MovementAnalytics = ReturnType<typeof useMovementAnalytics>;

export interface TxMovementEditorProps {
  selectedMovement: MovementRow;
  formatCurrency: (value: number) => string;
  overrideMerchantDraft: string;
  onOverrideMerchantDraftChange: (value: string) => void;
  overrideCategoryDraft: string;
  onOverrideCategoryDraftChange: (value: string) => void;
  onSaveMovementOverride: () => void;
  onClearMovementOverride: () => void;
}

export function TxMovementEditor({
  selectedMovement,
  formatCurrency,
  overrideMerchantDraft,
  onOverrideMerchantDraftChange,
  overrideCategoryDraft,
  onOverrideCategoryDraftChange,
  onSaveMovementOverride,
  onClearMovementOverride,
}: TxMovementEditorProps) {
  return (
    <div className="tx-override-editor-card">
      <div className="tx-override-editor-head">
        <div>
          <span className="tx-ap-section-label">Editor de categorización</span>
          <p className="tx-override-editor-copy">
            Ajusta comercio y categoría para este merchant. El aprendizaje queda guardado y se reutiliza en
            próximas revisiones.
          </p>
        </div>
        <div className="tx-override-editor-meta">
          <span>{selectedMovement.label}</span>
          <strong>{formatCurrency(selectedMovement.amount)}</strong>
        </div>
      </div>
      <div className="tx-override-editor-grid">
        <label>
          Comercio
          <input
            value={overrideMerchantDraft}
            onChange={(e) => onOverrideMerchantDraftChange(e.target.value)}
            placeholder="Nombre comercial canónico"
          />
        </label>
        <label>
          Categoría
          <select value={overrideCategoryDraft} onChange={(e) => onOverrideCategoryDraftChange(e.target.value)}>
            {TX_CATEGORY_OPTIONS.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="tx-override-editor-actions">
        <button type="button" className="button-primary" onClick={onSaveMovementOverride}>
          Guardar aprendizaje
        </button>
        <button
          type="button"
          className="continue-ghost"
          onClick={onClearMovementOverride}
          disabled={!selectedMovement.overrideApplied}
        >
          Limpiar override
        </button>
      </div>
    </div>
  );
}
