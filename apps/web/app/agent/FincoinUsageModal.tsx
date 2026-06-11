'use client';

import React, { useEffect } from 'react';
import { Coins } from 'lucide-react';
import { AgentModalCloseButton } from './AgentModalCloseButton';
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
            <Coins size={18} />
          </span>
          <p className="fincoin-usage-subtitle">Presupuesto incluido para usar el agente</p>
          <span className={`fincoin-usage-pill ${statusClass}`}>{statusLabel}</span>
        </div>

        <SpendingLimitCard
          title="Consumo de sesión"
          dateRange={`${usage.initialFincoins} Fincoins incluidos en tu cuenta`}
          currentSpending={usage.spentFincoins}
          limit={usage.initialFincoins}
          currency="FC"
          segments={10}
          filledColorClass={
            usage.depleted
              ? 'bg-rose-400/90'
              : usage.lowBalance
                ? 'bg-amber-300/90'
                : 'bg-emerald-400/90'
          }
          unfilledColorClass="bg-white/10"
          footerNote={
            usage.depleted
              ? 'Sin Fincoins el sistema queda en pausa: no se envían chats, voz, análisis ni llamadas con costo. Tus resúmenes finales siguen disponibles en cada chat desbloqueado.'
              : usage.lowBalance
                ? 'Te quedan pocos Fincoins. Prioriza preguntas clave para no interrumpir el flujo.'
                : 'Cada interacción con IA consume Fincoins. Cuando lleguen a cero, el agente se detiene automáticamente.'
          }
        />

        <div className="fincoin-usage-metrics">
          <div>
            <span>Disponibles</span>
            <strong>{usage.remainingFincoins} FC</strong>
          </div>
          <div>
            <span>Consumidos</span>
            <strong>{usage.spentFincoins} FC</strong>
          </div>
        </div>

        {props.loading ? <p className="fincoin-usage-loading">Actualizando saldo…</p> : null}
      </div>
    </div>
  );
}
