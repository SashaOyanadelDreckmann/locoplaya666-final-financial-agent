'use client';

import type { BudgetCloseConfirmKind } from '../presupuesto/use-budget-close-confirm';

type BudgetCloseConfirmDialogProps = {
  kind: BudgetCloseConfirmKind;
  onDismiss: () => void;
  onConfirm: () => void;
};

export function BudgetCloseConfirmDialog({ kind, onDismiss, onConfirm }: BudgetCloseConfirmDialogProps) {
  return (
    <div className="budget-close-confirm-layer" role="presentation">
      <div
        className="budget-close-confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="budget-close-confirm-title"
        aria-describedby="budget-close-confirm-body"
      >
        <h4 id="budget-close-confirm-title" className="budget-close-confirm-title">
          {kind === 'busy' ? 'Asistente en curso' : 'Confirmación pendiente'}
        </h4>
        <p id="budget-close-confirm-body" className="budget-close-confirm-body">
          {kind === 'busy'
            ? 'El asistente está procesando tu respuesta. Si cierras ahora, se cancelará la solicitud en curso.'
            : 'Hay un cambio pendiente de confirmación. Si cierras, no se aplicará a la tabla.'}
        </p>
        <div className="budget-close-confirm-actions">
          <button type="button" className="continue-ghost" onClick={onDismiss}>
            Seguir en presupuesto
          </button>
          <button type="button" className="button-primary" onClick={onConfirm}>
            Cerrar igual
          </button>
        </div>
      </div>
    </div>
  );
}
