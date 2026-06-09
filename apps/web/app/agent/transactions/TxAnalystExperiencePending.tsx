'use client';

import { TxParseProgress } from './TxParseProgress';
import type { DocumentsParseProgress } from '@/lib/transactions-parse-progress.helpers';

export function TxAnalystExperiencePending(props: {
  reason: string;
  documentsLoading: boolean;
  txAssistantLoading: boolean;
  documentsParseProgress?: DocumentsParseProgress | null;
  processingModeLabel: string;
  processingMetaLabel: string;
  processingPrimaryCopy: string;
}) {
  const isBusy = props.documentsLoading || props.txAssistantLoading;

  return (
    <section className="tx-content-card is-main-center tx-analyst-pending-shell" aria-busy="true" aria-live="polite">
      <div className="tx-analyst-pending-card" role="status">
        <span className="tx-analyst-pending-kicker">Preparando vista analítica</span>
        <p className="tx-analyst-pending-copy">{props.reason}</p>
        <p className="tx-analyst-pending-subcopy">
          Estamos consolidando movimientos, fidelidad de evidencia y el resumen antes de mostrar el tablero.
        </p>
      </div>
      {isBusy ? (
        <TxParseProgress
          progress={props.documentsParseProgress}
          fallbackModeLabel={props.processingModeLabel}
          fallbackMetaLabel={props.processingMetaLabel}
          fallbackPrimaryCopy={props.processingPrimaryCopy}
          chatMode={!props.documentsLoading && props.txAssistantLoading}
        />
      ) : (
        <div className="tx-analyst-pending-skeleton" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      )}
    </section>
  );
}
