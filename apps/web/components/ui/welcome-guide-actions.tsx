'use client';

import type { WelcomeGuideAction } from '@financial-agent/shared';

type WelcomeGuideActionsProps = {
  actions: WelcomeGuideAction[];
  disabled?: boolean;
  onMessage: (message: string) => void;
  onPanelAction: (section: NonNullable<WelcomeGuideAction['panelSection']>, message: string) => void;
};

export function WelcomeGuideActions({
  actions,
  disabled = false,
  onMessage,
  onPanelAction,
}: WelcomeGuideActionsProps) {
  if (!actions.length) return null;

  return (
    <div className="welcome-guide-actions" role="group" aria-label="Acciones guiadas del chat">
      <p className="welcome-guide-actions__label">Guía rápida</p>
      <div className="welcome-guide-actions__chips">
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            className="welcome-guide-actions__chip"
            disabled={disabled}
            onClick={() => {
              if (action.kind === 'panel' && action.panelSection) {
                onPanelAction(action.panelSection, action.message ?? action.label);
                return;
              }
              if (action.message) onMessage(action.message);
            }}
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default WelcomeGuideActions;
