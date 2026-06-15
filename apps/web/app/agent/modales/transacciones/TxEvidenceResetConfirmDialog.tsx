'use client';

import { ModalCloseConfirmDialog } from '../comunes/ModalCloseConfirmDialog';

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
    <ModalCloseConfirmDialog
      titleId="tx-evidence-reset-title"
      bodyId="tx-evidence-reset-body"
      title="Reiniciar evidencia"
      body={`Se borrarán los archivos analizados, el resumen y el chat de este producto. Podrás subir antecedentes nuevos. Te quedan ${resetsLeft} reinicio${resetsLeft === 1 ? '' : 's'} para este producto.`}
      dismissLabel="Cancelar"
      confirmLabel="Reiniciar y volver a evidencia"
      onDismiss={onDismiss}
      onConfirm={onConfirm}
    />
  );
}
