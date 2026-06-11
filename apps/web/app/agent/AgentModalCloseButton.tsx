'use client';

import { forwardRef } from 'react';

type Props = {
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
};

export const AgentModalCloseButton = forwardRef<HTMLButtonElement, Props>(function AgentModalCloseButton(
  { onClick, disabled, className = 'agent-modal-close', 'aria-label': ariaLabel = 'Cerrar' },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={className}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M2 2l12 12M14 2L2 14"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
});
