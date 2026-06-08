'use client';

import { INDICATIVE_EVIDENCE_DISCLAIMER } from '@financial-agent/shared';

type TxIndicativeNoticeProps = {
  reason?: string | null;
  compact?: boolean;
};

export function TxIndicativeNotice({ reason, compact = false }: TxIndicativeNoticeProps) {
  return (
    <div
      className={`tx-evidence-fidelity-notice${compact ? ' is-compact' : ''}`}
      role="status"
      aria-live="polite"
    >
      <span className="tx-evidence-fidelity-kicker">Lectura orientativa</span>
      <p>{reason?.trim() || INDICATIVE_EVIDENCE_DISCLAIMER}</p>
    </div>
  );
}
