'use client';

import { TxContinueWithoutProducts } from './TxContinueWithoutProducts';

type TxEmptyStateProps = {
  canAddMoreProducts: boolean;
  onCreateProduct: () => void;
  onContinueWithoutProducts?: () => void;
};

export function TxEmptyState({
  canAddMoreProducts,
  onCreateProduct,
  onContinueWithoutProducts,
}: TxEmptyStateProps) {
  return (
    <div className="transactions-summary-card pt-empty-state">
      <div className="pt-empty-head">
        <span className="transactions-summary-title">Comienza aquí</span>
        <h4>Activa tu primera ficha financiera</h4>
      </div>
      <div className="pt-empty-grid" role="list" aria-label="Capacidades del panel">
        <article className="pt-empty-item" role="listitem">
          <span>1</span>
          <div>
            <strong>Configura producto</strong>
          </div>
        </article>
        <article className="pt-empty-item" role="listitem">
          <span>2</span>
          <div>
            <strong>Sube evidencias</strong>
          </div>
        </article>
        <article className="pt-empty-item" role="listitem">
          <span>3</span>
          <div>
            <strong>Obtén insights</strong>
          </div>
        </article>
      </div>
      <div className="agent-modal-actions pt-empty-actions">
        <button
          type="button"
          className="button-primary tx-create-product-btn"
          onClick={onCreateProduct}
          disabled={!canAddMoreProducts}
        >
          Crear primer producto
        </button>
        {onContinueWithoutProducts ? (
          <TxContinueWithoutProducts onContinue={onContinueWithoutProducts} />
        ) : null}
      </div>
    </div>
  );
}
