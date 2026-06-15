'use client';

export type ModalCloseConfirmDialogProps = {
  titleId: string;
  bodyId: string;
  title: string;
  body: string;
  dismissLabel: string;
  confirmLabel: string;
  onDismiss: () => void;
  onConfirm: () => void;
};

export function ModalCloseConfirmDialog({
  titleId,
  bodyId,
  title,
  body,
  dismissLabel,
  confirmLabel,
  onDismiss,
  onConfirm,
}: ModalCloseConfirmDialogProps) {
  return (
    <div className="modal-close-confirm-layer" role="presentation">
      <div
        className="modal-close-confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
      >
        <h4 id={titleId} className="modal-close-confirm-title">
          {title}
        </h4>
        <p id={bodyId} className="modal-close-confirm-body">
          {body}
        </p>
        <div className="modal-close-confirm-actions">
          <button type="button" className="continue-ghost" onClick={onDismiss}>
            {dismissLabel}
          </button>
          <button type="button" className="button-primary" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
