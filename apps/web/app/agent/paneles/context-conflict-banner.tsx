'use client';

import type { ContextConflict } from '@financial-agent/shared';

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
      className={`agent-bubble assistant context-conflict-notice ${severityClassName(primary.severity)}`}
      role="status"
      aria-live="polite"
      data-conflict-code={primary.explanationCode}
      data-chat-export-skip="true"
    >
      <div className="context-conflict-notice__copy">
        <p className="context-conflict-notice__kicker">Inconsistencia detectada</p>
        <p className="context-conflict-notice__title">{copy.title}</p>
        <p className="context-conflict-notice__body">{copy.body}</p>
        {extraCount > 0 ? (
          <p className="context-conflict-notice__meta">
            Hay {extraCount} inconsistencia{extraCount === 1 ? '' : 's'} adicional
            {extraCount === 1 ? '' : 'es'} por revisar.
          </p>
        ) : null}
      </div>
      <div className="context-conflict-notice__actions">
        <div className="context-conflict-notice__buttons">
          {copy.action && copy.ctaLabel ? (
            <button
              type="button"
              className="context-conflict-notice__cta"
              onClick={() => props.onAction(copy.action)}
            >
              {copy.ctaLabel}
            </button>
          ) : null}
          <button
            type="button"
            className="context-conflict-notice__dismiss"
            onClick={() => props.onDismiss(primary.conflictId)}
          >
            Ocultar
          </button>
        </div>
      </div>
    </div>
  );
}
