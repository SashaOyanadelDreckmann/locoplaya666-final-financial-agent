'use client';

import { AgentModalCloseButton } from '../comunes/AgentModalCloseButton';

export function AccountModal(props: {
  isOpen: boolean;
  sessionUserName?: string | null;
  sessionEmail?: string | null;
  isLoading: boolean;
  error: string | null;
  onClose: () => void;
  onLogout: () => void | Promise<void>;
  onDeleteAccount: () => void | Promise<void>;
}) {
  if (!props.isOpen) return null;

  const userName = String(props.sessionUserName ?? '').trim();

  return (
    <div className="agent-modal-overlay account-modal-overlay" onClick={props.onClose}>
      <div
        className="agent-modal account-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bcc-modal-header">
          <div className="bcc-modal-title-wrap">
            <span className="bcc-modal-eyebrow">Financieramente</span>
            <h3 id="account-modal-title" className="bcc-modal-title">Cuenta</h3>
            {userName ? <p className="questionnaire-user-name">{userName}</p> : null}
          </div>
          <AgentModalCloseButton onClick={props.onClose} />
        </div>
        <p className="agent-modal-intro account-modal-intro">
          Gestiona tu sesión actual. Cerrar sesión te devuelve al acceso; borrar cuenta elimina tus datos de forma permanente.
        </p>
        <div className="account-modal-dashboard questionnaire-dashboard">
          {props.error ? (
            <div className="account-modal-alert" role="alert">
              <span className="account-modal-alert-title">No se pudo completar la acción</span>
              <p>{props.error}</p>
            </div>
          ) : null}
          <div className="questionnaire-response-grid account-modal-info-grid">
            <div className="questionnaire-response-item is-blue">
              <span>Usuario</span>
              <strong>{props.sessionUserName || 'Cuenta activa'}</strong>
            </div>
            <div className="questionnaire-response-item is-gold">
              <span>Email</span>
              <strong>{props.sessionEmail || 'Sesión autenticada'}</strong>
            </div>
          </div>
          <div className="account-modal-actions">
            <button
              type="button"
              className="continue-button account-modal-logout"
              onClick={() => void props.onLogout()}
              disabled={props.isLoading}
            >
              {props.isLoading ? 'Cerrando…' : 'Cerrar sesión'}
            </button>
            <button
              type="button"
              className="continue-button danger account-modal-delete"
              onClick={() => void props.onDeleteAccount()}
              disabled={props.isLoading}
            >
              {props.isLoading ? 'Eliminando…' : 'Borrar cuenta'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
