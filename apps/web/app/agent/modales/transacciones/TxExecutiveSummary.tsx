'use client';

import type { CSSProperties, KeyboardEvent } from 'react';
import { EditorialSummary, formatPercentCompact } from './presentation';
import { TxIndicativeNotice } from './TxIndicativeNotice';
import type { NormalizedMovementRow } from './compute-movement-analytics';
import { TxSummaryChartsPanel } from './TxSummaryChartsPanel';

type TxExecutiveSummaryProps = {
  hasSummary: boolean;
  summaryText: string | null;
  summaryFromTable: string | null;
  alignedExecutiveSummary?: string | null;
  summaryGeneratedAt: string | null;
  summaryModel: string | null;
  summaryRegenerationsLeft: number;
  execTab: 'summary' | 'metrics';
  onExecTabChange: (tab: 'summary' | 'metrics') => void;
  txAssistantLoading: boolean;
  onRegenerateSummary: () => void;
  onRefineSummary: (source: string, body: string) => void;
  netFlowFromTable: number;
  tableInflowLabel: string;
  movementCount: number;
  verifiedTableRows: number;
  highConfidenceMovementCount: number;
  movementCoverageDisplay: number;
  txNarrative: {
    cashAngle: string;
    marketAngle: string;
    fidelityAngle: string;
    confidenceAngle: string;
  };
  derivedTopMerchants: Array<{ merchant: string }>;
  enrichedCategoryData: Array<{ name: string }>;
  dashboardClusters: Array<{ name: string }>;
  isIndicativeEvidence?: boolean;
  evidenceFidelityReason?: string | null;
  movementRows?: NormalizedMovementRow[];
  inflowLabel?: string;
};

export function TxExecutiveSummary(props: TxExecutiveSummaryProps) {
  const summaryTabId = 'tx-ex-summary-tab';
  const metricsTabId = 'tx-ex-metrics-tab';
  const summaryPanelId = 'tx-ex-summary-panel';
  const metricsPanelId = 'tx-ex-metrics-panel';
  const onExecTabsKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      props.onExecTabChange(props.execTab === 'summary' ? 'metrics' : 'summary');
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      props.onExecTabChange(props.execTab === 'metrics' ? 'summary' : 'metrics');
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      props.onExecTabChange('summary');
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      props.onExecTabChange('metrics');
    }
  };

  const executiveText =
    props.alignedExecutiveSummary?.trim() ||
    props.summaryFromTable?.trim() ||
    (props.hasSummary ? props.summaryText : null);
  const topMerchantLabel = props.derivedTopMerchants[0]?.merchant || props.enrichedCategoryData[0]?.name || props.dashboardClusters[0]?.name || '—';
  const fidelityPct = props.movementCount > 0 ? (props.verifiedTableRows / props.movementCount) * 100 : 0;
  const confPct = props.movementCount > 0 ? (props.highConfidenceMovementCount / props.movementCount) * 100 : 0;

  const formatApproxCurrency = (value: number) =>
    props.isIndicativeEvidence ? `~${value.toLocaleString('es-CL')}` : value.toLocaleString('es-CL');

  return (
    <section
      className={`tx-ex-summary${props.isIndicativeEvidence ? ' is-indicative-evidence' : ''}`}
      aria-label="Resumen ejecutivo"
    >
      {props.isIndicativeEvidence ? (
        <TxIndicativeNotice reason={props.evidenceFidelityReason} compact />
      ) : null}
      <div className="tx-ex-header">
        <div className="tx-ex-header-left">
          <span className="tx-ex-eyebrow">Resumen ejecutivo</span>
          {props.summaryModel ? <span className="tx-ex-model-tag">{props.summaryModel}</span> : null}
        </div>
        <div className="tx-ex-tabs" role="tablist" aria-label="Vista del resumen" onKeyDown={onExecTabsKeyDown}>
          <button
            id={summaryTabId}
            type="button"
            role="tab"
            aria-selected={props.execTab === 'summary'}
            aria-controls={summaryPanelId}
            tabIndex={props.execTab === 'summary' ? 0 : -1}
            className={`tx-ex-tab${props.execTab === 'summary' ? ' is-active' : ''}`}
            onClick={() => props.onExecTabChange('summary')}
          >
            Análisis
          </button>
          <button
            id={metricsTabId}
            type="button"
            role="tab"
            aria-selected={props.execTab === 'metrics'}
            aria-controls={metricsPanelId}
            tabIndex={props.execTab === 'metrics' ? 0 : -1}
            className={`tx-ex-tab${props.execTab === 'metrics' ? ' is-active' : ''}`}
            onClick={() => props.onExecTabChange('metrics')}
          >
            Métricas
          </button>
        </div>
      </div>

      {props.execTab === 'summary' && (
        <div className="tx-ex-body" role="tabpanel" id={summaryPanelId} aria-labelledby={summaryTabId}>
          {executiveText ? (
            <EditorialSummary
              text={executiveText}
              onBlockDoubleClick={({ kicker, body }) =>
                props.onRefineSummary(
                  kicker ? `bloque "${kicker}"` : 'bloque ejecutivo',
                  kicker ? `${kicker}\n${body}` : body,
                )
              }
            />
          ) : (
            <p className="tx-ex-para tx-ex-para--empty">Generando análisis…</p>
          )}
          <TxSummaryChartsPanel movementRows={props.movementRows} inflowLabel={props.inflowLabel} />
        </div>
      )}

      {props.execTab === 'metrics' && (
        <div className="tx-ex-metrics" role="tabpanel" id={metricsPanelId} aria-labelledby={metricsTabId}>
          <article className="tx-ex-kpi" style={{ '--card-idx': 0 } as CSSProperties}>
            <span className="tx-ex-kpi-label">
              {props.isIndicativeEvidence ? 'Patrón de caja (aprox.)' : 'Pulso de caja'}
            </span>
            <strong className={`tx-ex-kpi-value${props.netFlowFromTable >= 0 ? ' is-pos' : ' is-neg'}`}>
              {formatApproxCurrency(props.netFlowFromTable)}
            </strong>
            <p className="tx-ex-kpi-note">{props.txNarrative.cashAngle}</p>
          </article>
          <article className="tx-ex-kpi" style={{ '--card-idx': 1 } as CSSProperties}>
            <span className="tx-ex-kpi-label">Motor del gasto</span>
            <strong className="tx-ex-kpi-value is-accent">{topMerchantLabel}</strong>
            <p className="tx-ex-kpi-note">{props.txNarrative.marketAngle}</p>
          </article>
          <article className="tx-ex-kpi" style={{ '--card-idx': 2 } as CSSProperties}>
            <span className="tx-ex-kpi-label">Fidelidad del set</span>
            <strong className="tx-ex-kpi-value is-pos">{formatPercentCompact(fidelityPct)}</strong>
            <p className="tx-ex-kpi-note">{props.txNarrative.fidelityAngle}</p>
          </article>
          <article className="tx-ex-kpi" style={{ '--card-idx': 3 } as CSSProperties}>
            <span className="tx-ex-kpi-label">Confianza operativa</span>
            <strong className="tx-ex-kpi-value is-pos">{formatPercentCompact(confPct)}</strong>
            <p className="tx-ex-kpi-note">{props.txNarrative.confidenceAngle}</p>
          </article>
        </div>
      )}

      <div className="tx-ex-actions">
        <button
          type="button"
          className="tx-ex-regen-btn"
          disabled={props.txAssistantLoading || props.summaryRegenerationsLeft <= 0}
          onClick={() => props.onRegenerateSummary()}
        >
          {props.txAssistantLoading ? <span className="tx-ex-regen-spinner" aria-hidden="true" /> : null}
          {props.summaryRegenerationsLeft > 0 ? 'Revisar resumen' : 'Resumen final'}
        </button>
        <span className="tx-ex-revs">{props.summaryRegenerationsLeft} revisión(es)</span>
      </div>
    </section>
  );
}
