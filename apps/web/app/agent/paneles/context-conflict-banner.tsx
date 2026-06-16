'use client';

import type { ContextConflict } from '@financial-agent/shared';

import { AgentModalCloseButton } from '../modales/comunes/AgentModalCloseButton';
import {
  resolveContextConflictCopy,
  type ContextConflictUiAction,
} from '@/lib/context/context-conflict-ui';

type ContextConflictBannerProps = {
  conflicts: ContextConflict[];
  hiddenCount: number;
  onDismiss: (conflictId: string) => void;
  onAction: (action: ContextConflictUiAction) => void;
};

function severityClassName(severity: ContextConflict['severity']): string {
  if (severity === 'high' || severity === 'medium') return 'is-warning';
  return 'is-info';
}

export function ContextConflictBanner(props: ContextConflictBannerProps) {
  const primary = props.conflicts[0];
  if (!primary) return null;

  const copy = resolveContextConflictCopy(primary);
  const extraCount = Math.max(0, props.hiddenCount + Math.max(0, props.conflicts.length - 1));

  return (
    <div
      className={`context-conflict-banner ${severityClassName(primary.severity)}`}
      role="alert"
      aria-live="polite"
      data-conflict-code={primary.explanationCode}
    >
      <div className="context-conflict-banner__copy">
        <strong>Inconsistencia detectada</strong>
        <span className="context-conflict-banner__title">{copy.title}</span>
        <span className="context-conflict-banner__body">{copy.body}</span>
        {extraCount > 0 ? (
          <span className="context-conflict-banner__meta">
            Hay {extraCount} inconsistencia{extraCount === 1 ? '' : 's'} adicional
            {extraCount === 1 ? '' : 'es'} por revisar.
          </span>
        ) : null}
      </div>
      <div className="context-conflict-banner__actions">
        {copy.action && copy.ctaLabel ? (
          <button
            type="button"
            className="context-conflict-banner__cta"
            onClick={() => props.onAction(copy.action)}
          >
            {copy.ctaLabel}
          </button>
        ) : null}
        <AgentModalCloseButton
          className="context-conflict-banner__dismiss agent-modal-close agent-close-x"
          onClick={() => props.onDismiss(primary.conflictId)}
          aria-label="Ocultar aviso"
        />
      </div>
    </div>
  );
}
