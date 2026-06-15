'use client';

import type { BudgetCloseConfirmKind } from '../presupuesto/use-budget-close-confirm';
import { ModalCloseConfirmDialog } from './ModalCloseConfirmDialog';

type BudgetCloseConfirmDialogProps = {
  kind: BudgetCloseConfirmKind;
  onDismiss: () => void;
  onConfirm: () => void;
};

export function BudgetCloseConfirmDialog({ kind, onDismiss, onConfirm }: BudgetCloseConfirmDialogProps) {
  return (
    <ModalCloseConfirmDialog
      titleId="budget-close-confirm-title"
      bodyId="budget-close-confirm-body"
      title={kind === 'busy' ? 'Asistente en curso' : 'Confirmación pendiente'}
      body={
        kind === 'busy'
          ? 'El asistente está procesando tu respuesta. Si cierras ahora, se cancelará la solicitud en curso.'
          : 'Hay un cambio pendiente de confirmación. Si cierras, no se aplicará a la tabla.'
      }
      dismissLabel="Seguir en presupuesto"
      confirmLabel="Cerrar igual"
      onDismiss={onDismiss}
      onConfirm={onConfirm}
    />
  );
}
