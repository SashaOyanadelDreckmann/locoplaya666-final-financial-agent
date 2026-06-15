'use client';

import React, { useEffect } from 'react';
import { AgentModalCloseButton } from '../comunes/AgentModalCloseButton';
import { FincoinIcon } from '@/components/marca/FincoinIcon';
import { SpendingLimitCard } from '@/components/ui/spending-limit-card';
import type { FincoinUsageState } from './use-fincoin-usage';

export function FincoinUsageModal(props: {
  isOpen: boolean;
  onClose: () => void;
  usage: FincoinUsageState;
  loading?: boolean;
}) {
  useEffect(() => {
    if (!props.isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') props.onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [props.isOpen, props.onClose]);

  if (!props.isOpen) return null;

  const { usage } = props;
  const statusLabel = usage.depleted
    ? 'Agotado'
    : usage.lowBalance
      ? 'Uso elevado'
      : 'Activo';

  const statusClass = usage.depleted
    ? 'is-depleted'
    : usage.lowBalance
      ? 'is-warning'
      : 'is-healthy';

  return (
    <div className="fincoin-usage-overlay" role="presentation" onClick={props.onClose}>
      <div
        className="fincoin-usage-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fincoin-usage-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="bcc-modal-header fincoin-usage-header">
          <div className="bcc-modal-title-wrap">
            <span className="bcc-modal-eyebrow">Financieramente</span>
            <h2 id="fincoin-usage-title" className="bcc-modal-title">Fincoins</h2>
          </div>
          <AgentModalCloseButton onClick={props.onClose} aria-label="Cerrar uso de Fincoins" />
        </div>

        <div className="fincoin-usage-head">
          <span className="fincoin-usage-icon" aria-hidden="true">
            <FincoinIcon size="lg" />
          </span>
          <div className="fincoin-usage-head-copy">
            <p className="fincoin-usage-subtitle">Presupuesto incluido para usar el agente</p>
            <span className={`fincoin-usage-pill ${statusClass}`}>{statusLabel}</span>
          </div>
        </div>

        <div className="fincoin-usage-body">
        <SpendingLimitCard
          className="fincoin-usage-consumption"
          title="Consumo de sesión"
          dateRange={`${usage.initialFincoins} Fincoins incluidos`}
          currentSpending={usage.spentFincoins}
          limit={usage.initialFincoins}
          currency="FC"
          segments={1}
          filledColorClass={`fincoin-progress-fill ${statusClass}`}
          unfilledColorClass="fincoin-progress-track"
          footerNote={
            usage.depleted
              ? 'Sin Fincoins el sistema queda en pausa: no se envían chats, voz, análisis ni llamadas con costo. Tus resúmenes finales siguen disponibles en cada chat desbloqueado.'
              : usage.lowBalance
                ? 'Te quedan pocos Fincoins. Prioriza preguntas clave para no interrumpir el flujo.'
                : 'Cada interacción con IA consume Fincoins. Cuando lleguen a cero, el agente se detiene automáticamente.'
          }
        />

        <div className="fincoin-usage-metrics" role="group" aria-label="Resumen de Fincoins">
          <div className="fincoin-usage-metric">
            <span className="fincoin-usage-metric-label">Disponibles</span>
            <strong className="fincoin-usage-metric-value">{usage.remainingFincoins} FC</strong>
          </div>
          <div className="fincoin-usage-metric-divider" aria-hidden="true" />
          <div className="fincoin-usage-metric">
            <span className="fincoin-usage-metric-label">Consumidos</span>
            <strong className="fincoin-usage-metric-value">{usage.spentFincoins} FC</strong>
          </div>
        </div>

        {props.loading ? <p className="fincoin-usage-loading">Actualizando saldo…</p> : null}
        </div>
      </div>
    </div>
  );
}
