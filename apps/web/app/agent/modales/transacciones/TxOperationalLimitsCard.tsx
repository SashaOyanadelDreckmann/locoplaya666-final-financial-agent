'use client';

import { useMemo, useState } from 'react';
import {
  clampTxLimitPercent,
  deriveTxLimitsStatus,
  deriveTxLimitsStatusLabel,
  type TxLimitsStatus,
} from './tx-operational-limits.helpers';

type TxLimitMetricKey = 'active' | 'created' | 'remaining';

type TxLimitMetric = {
  key: TxLimitMetricKey;
  label: string;
  value: string;
  sublabel: string;
  current: number;
  max: number;
  detail: string;
};

type TxOperationalLimitsCardProps = {
  activeCount: number;
  maxActive: number;
  createdTotal: number;
  maxCreatedTotal: number;
  canAddMore: boolean;
  onAddProduct?: () => void;
};

const STATUS_TONE: Record<TxLimitsStatus, string> = {
  healthy: 'is-healthy',
  caution: 'is-caution',
  critical: 'is-critical',
};

export function TxOperationalLimitsCard({
  activeCount,
  maxActive,
  createdTotal,
  maxCreatedTotal,
  canAddMore,
  onAddProduct,
}: TxOperationalLimitsCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [focusedMetric, setFocusedMetric] = useState<TxLimitMetricKey>('active');

  const activeSlotsLeft = Math.max(0, maxActive - activeCount);
  const totalSlotsLeft = Math.max(0, maxCreatedTotal - createdTotal);
  const status = deriveTxLimitsStatus({
    activeCount,
    maxActive,
    createdTotal,
    maxCreatedTotal,
  });
  const statusLabel = deriveTxLimitsStatusLabel(status);

  const metrics = useMemo<TxLimitMetric[]>(
    () => [
      {
        key: 'active',
        label: 'Activos',
        value: `${activeCount}/${maxActive}`,
        sublabel: `${activeSlotsLeft} slot${activeSlotsLeft === 1 ? '' : 's'} libre${activeSlotsLeft === 1 ? '' : 's'}`,
        current: activeCount,
        max: maxActive,
        detail: 'Productos conectados simultáneamente en tu biblioteca operativa.',
      },
      {
        key: 'created',
        label: 'Creados',
        value: `${createdTotal}/${maxCreatedTotal}`,
        sublabel: 'Histórico de altas en esta cuenta',
        current: createdTotal,
        max: maxCreatedTotal,
        detail: 'Total de fichas creadas en el módulo, incluyendo las que ya eliminaste.',
      },
      {
        key: 'remaining',
        label: 'Quedan',
        value: String(totalSlotsLeft),
        sublabel: 'Altas totales disponibles',
        current: totalSlotsLeft,
        max: maxCreatedTotal,
        detail: 'Cupos restantes antes de alcanzar el límite histórico de creación.',
      },
    ],
    [activeCount, activeSlotsLeft, createdTotal, maxActive, maxCreatedTotal, totalSlotsLeft],
  );

  return (
    <article
      className={`tx-limits-card ${STATUS_TONE[status]} ${expanded ? 'is-expanded' : ''}`}
      aria-label="Límites operativos del módulo de transacciones"
      data-status={status}
    >
      <div className="tx-limits-card-sheen" aria-hidden="true" />

      <header className="tx-limits-card-head">
        <div className="tx-limits-card-title-wrap">
          <span className="tx-limits-card-kicker">Límites operativos</span>
        </div>
        <span className="tx-limits-status-pill" role="status">
          <span className="tx-limits-status-dot" aria-hidden="true" />
          {statusLabel}
        </span>
      </header>

      <div className="tx-limits-card-body">
        <div className="tx-limits-metrics" role="list">
          {metrics.map((metric) => {
            const percent = clampTxLimitPercent(metric.current, metric.max);
            const isFocused = focusedMetric === metric.key;
            return (
              <button
                key={metric.key}
                type="button"
                role="listitem"
                className={`tx-limits-metric ${isFocused ? 'is-focused' : ''}`}
                data-metric={metric.key}
                aria-pressed={isFocused}
                onClick={() => setFocusedMetric(metric.key)}
                onMouseEnter={() => setFocusedMetric(metric.key)}
                onFocus={() => setFocusedMetric(metric.key)}
              >
                <span className="tx-limits-metric-top">
                  <span className="tx-limits-metric-label">{metric.label}</span>
                  <span className="tx-limits-metric-value">{metric.value}</span>
                </span>
                <span className="tx-limits-metric-track" aria-hidden="true">
                  <span
                    className="tx-limits-metric-fill"
                    style={{ width: `${percent}%` }}
                    data-metric={metric.key}
                  />
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <footer className="tx-limits-card-foot">
        <button
          type="button"
          className="tx-limits-expand-btn"
          aria-expanded={expanded}
          onClick={() => setExpanded((prev) => !prev)}
        >
          <span className="tx-limits-expand-icon" aria-hidden="true">
            {expanded ? '−' : '+'}
          </span>
          {expanded ? 'Ocultar detalle de cupos' : 'Ver detalle de cupos'}
        </button>

        {canAddMore && onAddProduct ? (
          <button type="button" className="tx-limits-add-btn" onClick={onAddProduct}>
            + Agregar producto
          </button>
        ) : (
          <span className="tx-limits-cap-note" role="note">
            Sin cupos disponibles
          </span>
        )}
      </footer>

      {expanded ? (
        <div className="tx-limits-expanded-grid">
          {metrics.map((metric) => (
            <div key={`detail-${metric.key}`} className="tx-limits-expanded-item">
              <span className="tx-limits-expanded-label">{metric.label}</span>
              <strong>{metric.value}</strong>
              <p>{metric.detail}</p>
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}
