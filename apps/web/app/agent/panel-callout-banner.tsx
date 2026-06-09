'use client';

type PanelCalloutBannerProps = {
  callout: { section: string; message: string };
  onClose: () => void;
  variant?: 'inline' | 'mobile-composer';
};

export function PanelCalloutBanner(props: PanelCalloutBannerProps) {
  const variant = props.variant ?? 'inline';

  return (
    <div
      className={`panel-callout panel-callout-${props.callout.section}${
        variant === 'mobile-composer' ? ' panel-callout--mobile-composer' : ''
      }`}
      role="status"
      aria-live="polite"
    >
      <div className="panel-callout-icon">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="10" cy="10" r="8" />
          <path d="M10 6v4l2.5 2.5" strokeLinecap="round" />
        </svg>
      </div>
      <div className="panel-callout-content">
        <span className="panel-callout-tag">Agente</span>
        <p className="panel-callout-msg">{props.callout.message}</p>
      </div>
      <button type="button" className="panel-callout-close" onClick={props.onClose} aria-label="Cerrar">
        ×
      </button>
      <div className="panel-callout-progress" />
    </div>
  );
}
