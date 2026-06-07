'use client';

type TxEmptyStateProps = {
  canAddMoreProducts: boolean;
  onCreateProduct: () => void;
};

export function TxEmptyState({ canAddMoreProducts, onCreateProduct }: TxEmptyStateProps) {
  return (
    <div className="transactions-summary-card pt-empty-state">
      <div className="pt-empty-head">
        <span className="transactions-summary-title">Comienza aquí</span>
        <h4>Activa tu primera ficha financiera</h4>
        <p>Crea un producto para iniciar un flujo simple y validable.</p>
      </div>
      <div className="pt-empty-grid" role="list" aria-label="Capacidades del panel">
        <article className="pt-empty-item" role="listitem">
          <span>1</span>
          <div>
            <strong>Configura producto</strong>
            <p>Define banco, tipo y alias para organizar tu biblioteca.</p>
          </div>
        </article>
        <article className="pt-empty-item" role="listitem">
          <span>2</span>
          <div>
            <strong>Sube evidencias</strong>
            <p>Adjunta cartolas o respaldos y el sistema extrae datos clave.</p>
          </div>
        </article>
        <article className="pt-empty-item" role="listitem">
          <span>3</span>
          <div>
            <strong>Obtén insights</strong>
            <p>Recibe indicadores y hallazgos listos para el agente core.</p>
          </div>
        </article>
      </div>
      <div className="agent-modal-actions pt-empty-actions">
        <button
          type="button"
          className="continue-ghost tx-create-product-btn"
          onClick={onCreateProduct}
          disabled={!canAddMoreProducts}
        >
          Crear primer producto
        </button>
      </div>
    </div>
  );
}
