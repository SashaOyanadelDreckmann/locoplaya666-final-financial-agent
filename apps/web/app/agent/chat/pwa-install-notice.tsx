'use client';

import type { PwaInstallGuide } from '@/lib/interfaz/pwa-install.helpers';

type PwaInstallNoticeProps = {
  guide: PwaInstallGuide;
  platformLabel: string;
  showPrimaryAction: boolean;
  primaryLabel: string;
  statusMessage: string | null;
  onPrimaryAction: () => void;
  onDismiss: () => void;
};

export function PwaInstallNotice({
  guide,
  platformLabel,
  showPrimaryAction,
  primaryLabel,
  statusMessage,
  onPrimaryAction,
  onDismiss,
}: PwaInstallNoticeProps) {
  return (
    <div
      className="agent-bubble assistant pwa-install-notice"
      data-pwa-install-notice="true"
      role="region"
      aria-label="Instalar la app en tu dispositivo"
    >
      <div className="pwa-install-notice__copy">
        <p className="pwa-install-notice__kicker">Sugerencia</p>
        <p className="pwa-install-notice__title">{guide.accent}</p>
        <p className="pwa-install-notice__dek">{guide.helper}</p>
      </div>

      <ul className="pwa-install-notice__steps">
        {guide.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ul>

      {statusMessage ? <p className="pwa-install-notice__status">{statusMessage}</p> : null}

      <div className="pwa-install-notice__actions">
        {platformLabel ? (
          <span className="pwa-install-notice__platform" aria-hidden="true">
            {platformLabel}
          </span>
        ) : null}
        <div className="pwa-install-notice__buttons">
          {showPrimaryAction ? (
            <button
              type="button"
              className="pwa-install-notice__primary"
              onClick={() => void onPrimaryAction()}
            >
              {primaryLabel}
            </button>
          ) : null}
          <button type="button" className="pwa-install-notice__dismiss" onClick={onDismiss}>
            Estoy bien así
          </button>
        </div>
      </div>
    </div>
  );
}
