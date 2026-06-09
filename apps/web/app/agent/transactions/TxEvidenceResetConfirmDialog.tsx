'use client';

type TxEvidenceResetConfirmDialogProps = {
  resetsLeft: number;
  onDismiss: () => void;
  onConfirm: () => void;
};

export function TxEvidenceResetConfirmDialog({
  resetsLeft,
  onDismiss,
  onConfirm,
}: TxEvidenceResetConfirmDialogProps) {
  return (
    <div className="tx-close-confirm-layer" role="presentation">
      <div
        className="tx-close-confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="tx-evidence-reset-title"
        aria-describedby="tx-evidence-reset-body"
      >
        <h4 id="tx-evidence-reset-title" className="tx-close-confirm-title">
          Reiniciar evidencia
        </h4>
        <p id="tx-evidence-reset-body" className="tx-close-confirm-body">
          Se borrarán los archivos analizados, el resumen y el chat de este producto. Podrás subir
          antecedentes nuevos. Te quedan {resetsLeft} reinicio{resetsLeft === 1 ? '' : 's'} para este
          producto.
        </p>
        <div className="tx-close-confirm-actions">
          <button type="button" className="continue-ghost" onClick={onDismiss}>
            Cancelar
          </button>
          <button type="button" className="button-primary" onClick={onConfirm}>
            Reiniciar y volver a evidencia
          </button>
        </div>
      </div>
    </div>
  );
}
