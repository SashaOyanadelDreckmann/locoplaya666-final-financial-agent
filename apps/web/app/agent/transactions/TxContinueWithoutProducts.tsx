'use client';

type TxContinueWithoutProductsProps = {
  onContinue: () => void;
  compact?: boolean;
};

export function TxContinueWithoutProducts({ onContinue, compact = false }: TxContinueWithoutProductsProps) {
  return (
    <div className={`tx-skip-products${compact ? ' is-compact' : ''}`}>
      <button type="button" className="continue-ghost tx-skip-products-btn" onClick={onContinue}>
        Continuar sin productos
      </button>
      <p className="tx-skip-products-note">
        Puedes usar el agente y el presupuesto ahora. Más adelante podrás volver a conectar productos cuando quieras.
      </p>
    </div>
  );
}
