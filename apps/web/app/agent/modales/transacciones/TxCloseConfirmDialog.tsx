'use client';

import type { TxCloseConfirmKind } from './use-tx-close-confirm';
import { ModalCloseConfirmDialog } from '../comunes/ModalCloseConfirmDialog';

type TxCloseConfirmDialogProps = {
  kind: TxCloseConfirmKind;
  onDismiss: () => void;
  onConfirm: () => void;
};

export function TxCloseConfirmDialog({ kind, onDismiss, onConfirm }: TxCloseConfirmDialogProps) {
  return (
    <ModalCloseConfirmDialog
      titleId="tx-close-confirm-title"
      bodyId="tx-close-confirm-body"
      title={kind === 'busy' ? 'Análisis en curso' : 'Borrador sin enviar'}
      body={
        kind === 'busy'
          ? 'Hay un análisis en curso. Si cierras ahora, el proceso puede quedar incompleto.'
          : 'Tienes archivos o notas sin enviar. Si cierras, se descartará ese borrador.'
      }
      dismissLabel="Seguir en el panel"
      confirmLabel="Cerrar igual"
      onDismiss={onDismiss}
      onConfirm={onConfirm}
    />
  );
}
