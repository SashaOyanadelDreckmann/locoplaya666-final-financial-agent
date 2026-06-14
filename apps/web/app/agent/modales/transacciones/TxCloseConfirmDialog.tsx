'use client';

import type { TxCloseConfirmKind } from './use-tx-close-confirm';

type TxCloseConfirmDialogProps = {
  kind: TxCloseConfirmKind;
  onDismiss: () => void;
  onConfirm: () => void;
};

export function TxCloseConfirmDialog({ kind, onDismiss, onConfirm }: TxCloseConfirmDialogProps) {
  return (
    <div className="tx-close-confirm-layer" role="presentation">
      <div
        className="tx-close-confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="tx-close-confirm-title"
        aria-describedby="tx-close-confirm-body"
      >
        <h4 id="tx-close-confirm-title" className="tx-close-confirm-title">
          {kind === 'busy' ? 'Análisis en curso' : 'Borrador sin enviar'}
        </h4>
        <p id="tx-close-confirm-body" className="tx-close-confirm-body">
          {kind === 'busy'
            ? 'Hay un análisis en curso. Si cierras ahora, el proceso puede quedar incompleto.'
            : 'Tienes archivos o notas sin enviar. Si cierras, se descartará ese borrador.'}
        </p>
        <div className="tx-close-confirm-actions">
          <button type="button" className="continue-ghost" onClick={onDismiss}>
            Seguir en el panel
          </button>
          <button type="button" className="button-primary" onClick={onConfirm}>
            Cerrar igual
          </button>
        </div>
      </div>
    </div>
  );
}
