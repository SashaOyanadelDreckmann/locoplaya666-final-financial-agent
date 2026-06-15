'use client';

import { type Ref } from 'react';
import {
  confidenceBand,
  confidenceBandLong,
  formatPercentCompact,
} from './presentation';
import type { useMovementAnalytics } from './use-movement-analytics';
import type { BankProduct } from './types';
import { TxExecutiveSummary } from './TxExecutiveSummary';
import { TxIndicativeNotice } from './TxIndicativeNotice';
import { TxAskChatButton, TxChatMessageBubble, TxChatStarterChips } from './tx-chat-ui';
import {
  buildAlertAskQuestion,
  buildMerchantAskQuestion,
  buildMetricAskQuestion,
} from './tx-click-to-ask.helpers';
import type { TxAssistantMessage, TxChatStarterChip } from './types';
import { TxMovementTable } from './TxMovementTable';
import { TxMovementEditor } from './TxMovementEditor';

type MovementAnalytics = ReturnType<typeof useMovementAnalytics>;

export interface TxAnalystDashboardProps {
  analytics: MovementAnalytics;
  activeBankProduct: BankProduct;
  summaryText: string | null;
  summaryGeneratedAt: string | null;
  summaryModel: string | null;
  hasSummary: boolean;
  summaryRegenerationsLeft: number;
  showAllMovements: boolean;
  onToggleShowAllMovements: () => void;
  execTab: 'summary' | 'metrics';
  onExecTabChange: (tab: 'summary' | 'metrics') => void;
  selectedMovement: MovementAnalytics['dedupedMovementRows'][number] | null;
  selectedMovementKey: string | null;
  onSelectMovementKey: (key: string | null) => void;
  overrideMerchantDraft: string;
  onOverrideMerchantDraftChange: (value: string) => void;
  overrideCategoryDraft: string;
  onOverrideCategoryDraftChange: (value: string) => void;
  groupCarouselRef: Ref<HTMLDivElement>;
  insightCarouselRef: Ref<HTMLDivElement>;
  onCarouselPause?: () => void;
  onCarouselResume?: () => void;
  assistantMessages: TxAssistantMessage[];
  starterChips: TxChatStarterChip[];
  highlightedMovementKeys: string[];
  txAssistantInput: string;
  onAssistantInputChange: (value: string) => void;
  txAssistantLoading: boolean;
  documentsLoading: boolean;
  onAskSuggestedQuestion: (question: string) => void;
  isSavedForBatch: boolean;
  onDeleteProduct: () => void;
  onGoToEvidence: () => void;
  onRequestEvidenceReset?: () => void;
  evidenceResetsLeft?: number;
  onSaveProductForBatch: () => void;
  onRefineSummary: (source: string, body: string) => void;
  onRegenerateSummary: () => void;
  onAssistantSend: () => void;
  onSaveMovementOverride: () => void;
  onClearMovementOverride: () => void;
  buildMovementRefinementText: (movement: MovementAnalytics['dedupedMovementRows'][number]) => string;
}

export function TxAnalystDashboard({
  analytics,
  activeBankProduct,
  summaryText,
  summaryGeneratedAt,
  summaryModel,
  hasSummary,
  summaryRegenerationsLeft,
  showAllMovements,
  onToggleShowAllMovements,
  execTab,
  onExecTabChange,
  selectedMovement,
  selectedMovementKey,
  onSelectMovementKey,
  overrideMerchantDraft,
  onOverrideMerchantDraftChange,
  overrideCategoryDraft,
  onOverrideCategoryDraftChange,
  groupCarouselRef,
  insightCarouselRef,
  onCarouselPause,
  onCarouselResume,
  assistantMessages,
  starterChips,
  highlightedMovementKeys,
  txAssistantInput,
  onAssistantInputChange,
  txAssistantLoading,
  documentsLoading,
  onAskSuggestedQuestion,
  isSavedForBatch,
  onDeleteProduct,
  onGoToEvidence,
  onRequestEvidenceReset,
  evidenceResetsLeft = 0,
  onSaveProductForBatch,
  onRefineSummary,
  onRegenerateSummary,
  onAssistantSend,
  onSaveMovementOverride,
  onClearMovementOverride,
  buildMovementRefinementText,
}: TxAnalystDashboardProps) {
  const isMovementChatHighlighted = (promptKey: string) => highlightedMovementKeys.includes(promptKey);
  const carouselInteractionProps = {
    onMouseEnter: onCarouselPause,
    onMouseLeave: onCarouselResume,
    onFocusCapture: onCarouselPause,
    onBlurCapture: onCarouselResume,
  };

  const chatBusy = txAssistantLoading || documentsLoading;
  const latestAssistantMessageId = [...assistantMessages].reverse().find((message) => message.role === 'assistant')?.id;
  const showStarterShortcuts =
    starterChips.length > 0 &&
    (assistantMessages.length === 0 || assistantMessages[assistantMessages.length - 1]?.role === 'user');

  const {
    formatCurrency,
    dashboardClusters,
    alertDetails,
    metricExplanations,
    dedupedMovementRows,
    incomeOrAbonoRows,
    expenseRows,
    incomeOrAbonoTotal,
    expenseTotal,
    tableDerivedMetrics,
    movementCount,
    netFlowFromTable,
    avgMovementFromTable,
    tablePeriod,
    summaryFromTable,
    alignedExecutiveSummary,
    inflowLabel,
    verifiedTableRows,
    highConfidenceMovementCount,
    movementCoverageDisplay,
    enrichedCategoryData,
    txNarrative,
    derivedTopMerchants,
    merchantConfidenceRows,
    isIndicativeEvidence,
    evidenceFidelityReason,
  } = analytics;

  const inflowSectionLabel =
    inflowLabel === 'abonos e ingresos'
      ? 'Abonos e ingresos'
      : inflowLabel === 'abonos'
        ? 'Abonos'
        : 'Ingresos';

  return (
    <section
      className={`tx-content-card is-main-center tx-summary-stage tx-step-reveal tx-ap-dashboard${isIndicativeEvidence ? ' is-indicative-evidence' : ''}`}
    >
      {isIndicativeEvidence ? <TxIndicativeNotice reason={evidenceFidelityReason} /> : null}
      <div className="tx-ap-masthead">
        <div className="tx-ap-masthead-top">
          <div className="tx-ap-masthead-meta">
            <span className="tx-ap-eyebrow">Resumen analítico · Paso 3</span>
            {summaryGeneratedAt ? (
              <span className="tx-ap-updated-badge">
                Actualizado {new Date(summaryGeneratedAt).toLocaleString('es-CL')}
              </span>
            ) : (
              <span className="tx-ap-updated-badge">En preparación</span>
            )}
          </div>
          <div className="tx-ap-masthead-actions">
            <button type="button" className="continue-ghost" onClick={() => onToggleShowAllMovements()}>
              {showAllMovements ? 'Ocultar tabla' : 'Ver tabla'}
            </button>
            {onRequestEvidenceReset && evidenceResetsLeft > 0 ? (
              <button type="button" className="continue-ghost" onClick={onRequestEvidenceReset}>
                Reiniciar evidencia ({evidenceResetsLeft})
              </button>
            ) : null}
          </div>
        </div>
        <div className="tx-ap-hero-numbers">
          <div className="tx-ap-hero-primary">
            <span className="tx-ap-hero-label">
              {isIndicativeEvidence ? `${inflowSectionLabel} estimados` : `${inflowSectionLabel} totales`}
            </span>
            <strong className="tx-ap-hero-value tx-ap-value-income">
              {isIndicativeEvidence
                ? `~${formatCurrency(tableDerivedMetrics.inflowsTotal)}`
                : formatCurrency(tableDerivedMetrics.inflowsTotal)}
            </strong>
          </div>
          <div className="tx-ap-hero-divider" aria-hidden="true" />
          <div className="tx-ap-hero-secondary">
            <div className="tx-ap-hero-pair">
              <span>{isIndicativeEvidence ? 'Egresos est.' : 'Egresos'}</span>
              <strong className="tx-ap-value-expense">
                {isIndicativeEvidence
                  ? `~${formatCurrency(tableDerivedMetrics.outflowsTotal)}`
                  : formatCurrency(tableDerivedMetrics.outflowsTotal)}
              </strong>
            </div>
            <div className="tx-ap-hero-pair">
              <span>{isIndicativeEvidence ? 'Flujo neto est.' : 'Flujo neto'}</span>
              <strong className={netFlowFromTable >= 0 ? 'tx-ap-value-positive' : 'tx-ap-value-negative'}>
                {isIndicativeEvidence ? `~${formatCurrency(netFlowFromTable)}` : formatCurrency(netFlowFromTable)}
              </strong>
            </div>
            <div className="tx-ap-hero-pair">
              <span>Movimientos</span>
              <strong>{movementCount.toLocaleString('es-CL')}</strong>
            </div>
            <div className="tx-ap-hero-pair">
              <span>{isIndicativeEvidence ? 'Ticket medio est.' : 'Ticket medio'}</span>
              <strong>
                {isIndicativeEvidence ? `~${formatCurrency(avgMovementFromTable)}` : formatCurrency(avgMovementFromTable)}
              </strong>
            </div>
          </div>
        </div>
        <div className="tx-ap-signal-chips" aria-label="Indicadores de fidelidad">
          <span className="tx-ap-signal-chip">
            {tablePeriod.from} → {tablePeriod.to}
          </span>
          <span className="tx-ap-signal-chip">Cobertura {formatPercentCompact(movementCoverageDisplay)}</span>
          <span className="tx-ap-signal-chip">
            Fidelidad {formatPercentCompact(movementCount > 0 ? (verifiedTableRows / movementCount) * 100 : 0)}
          </span>
          <span className="tx-ap-signal-chip">
            {confidenceBand(movementCount > 0 ? highConfidenceMovementCount / movementCount : 0)}
          </span>
          <span className="tx-ap-signal-chip">{activeBankProduct.dashboard?.currency || 'CLP'}</span>
        </div>
      </div>

      {showAllMovements ? (
        <TxMovementTable
          analytics={{
            formatCurrency,
            isCreditCardProduct: analytics.isCreditCardProduct,
            dedupedMovementRows,
            incomeOrAbonoRows,
            expenseRows,
            incomeOrAbonoTotal,
            expenseTotal,
            inflowLabel,
          }}
          selectedMovementKey={selectedMovementKey}
          onSelectMovementKey={onSelectMovementKey}
          isMovementChatHighlighted={isMovementChatHighlighted}
          chatBusy={chatBusy}
          onAskSuggestedQuestion={onAskSuggestedQuestion}
          onRefineSummary={onRefineSummary}
          buildMovementRefinementText={buildMovementRefinementText}
        />
      ) : null}

      {selectedMovement ? (
        <TxMovementEditor
          selectedMovement={selectedMovement}
          formatCurrency={formatCurrency}
          overrideMerchantDraft={overrideMerchantDraft}
          onOverrideMerchantDraftChange={onOverrideMerchantDraftChange}
          overrideCategoryDraft={overrideCategoryDraft}
          onOverrideCategoryDraftChange={onOverrideCategoryDraftChange}
          onSaveMovementOverride={onSaveMovementOverride}
          onClearMovementOverride={onClearMovementOverride}
        />
      ) : null}

      {merchantConfidenceRows.length > 0 ? (
        <div className="tx-merchant-quality">
          <div className="tx-ap-section-header">
            <span className="tx-ap-section-label">Precisión por comercio</span>
          </div>
          <ul className="tx-merchant-quality-rows" role="list">
            {merchantConfidenceRows.map((row) => (
              <li key={`${row.merchant}-${row.category}`} className="tx-merchant-quality-row">
                <div className="tx-merchant-quality-copy">
                  <strong>{row.merchant}</strong>
                  <p>
                    {row.category} · {row.count} mov.
                  </p>
                </div>
                <div className="tx-merchant-quality-metrics">
                  <span className="tx-merchant-quality-pct">{formatPercentCompact(row.avgConfidence * 100)}</span>
                  <span className={`tx-merchant-quality-band${row.manual ? ' is-manual' : ''}`}>
                    {row.manual ? 'Manual' : confidenceBandLong(row.avgConfidence)}
                  </span>
                  <TxAskChatButton
                    compact
                    disabled={chatBusy}
                    label={`Preguntar al chat sobre ${row.merchant}`}
                    onAsk={() => onAskSuggestedQuestion(buildMerchantAskQuestion(row.merchant))}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <TxExecutiveSummary
        hasSummary={hasSummary}
        summaryText={summaryText}
        summaryFromTable={summaryFromTable}
        alignedExecutiveSummary={alignedExecutiveSummary}
        summaryGeneratedAt={summaryGeneratedAt}
        summaryModel={summaryModel}
        summaryRegenerationsLeft={summaryRegenerationsLeft}
        execTab={execTab}
        onExecTabChange={onExecTabChange}
        txAssistantLoading={txAssistantLoading}
        onRegenerateSummary={onRegenerateSummary}
        onRefineSummary={onRefineSummary}
        netFlowFromTable={netFlowFromTable}
        tableInflowLabel={inflowLabel}
        movementCount={movementCount}
        verifiedTableRows={verifiedTableRows}
        highConfidenceMovementCount={highConfidenceMovementCount}
        movementCoverageDisplay={movementCoverageDisplay}
        txNarrative={txNarrative}
        derivedTopMerchants={derivedTopMerchants}
        enrichedCategoryData={enrichedCategoryData}
        dashboardClusters={dashboardClusters}
        isIndicativeEvidence={isIndicativeEvidence}
        evidenceFidelityReason={evidenceFidelityReason}
        movementRows={analytics.dedupedMovementRows}
        inflowLabel={inflowLabel}
      />

      <div className="tx-ap-intel-grid">
        <div className="tx-ap-intel-card">
          <div className="tx-ap-section-header">
            <span className="tx-ap-section-label">Grupos de gasto</span>
          </div>
          <div
            className="tx-ap-cluster-list"
            aria-label="Grupos de gasto"
            ref={groupCarouselRef}
            {...carouselInteractionProps}
          >
            {dashboardClusters.length === 0 ? (
              <p className="tx-ap-empty-note">Sin grupos suficientes. Sube una cartola con más movimientos.</p>
            ) : (
              dashboardClusters.slice(0, 6).map((cluster) => (
                <article key={cluster.name} className="tx-ap-cluster-item">
                  <div className="tx-ap-cluster-head">
                    <strong>{cluster.name}</strong>
                    <span>{cluster.share_pct.toFixed(1)}%</span>
                  </div>
                  <div className="tx-ap-cluster-bar" aria-hidden="true">
                    <span style={{ width: `${Math.min(100, Math.max(4, cluster.share_pct))}%` }} />
                  </div>
                  <p>
                    {formatCurrency(cluster.amount)} · {cluster.tx_count} mov. · {formatCurrency(cluster.avg_ticket)}{' '}
                    ticket
                  </p>
                </article>
              ))
            )}
          </div>
        </div>
        <div className="tx-ap-intel-card">
          <div className="tx-ap-section-header">
            <span className="tx-ap-section-label">Lectura fina</span>
          </div>
          <div
            className="tx-ap-insight-stack"
            aria-label="Señales analíticas"
            ref={insightCarouselRef}
            {...carouselInteractionProps}
          >
            {alertDetails.length === 0 && metricExplanations.length === 0 ? (
              <p className="tx-ap-empty-note">Sin señales analíticas suficientes aún.</p>
            ) : null}
            {(alertDetails.length > 0 ? alertDetails : []).slice(0, 4).map((alert) => (
              <article
                key={`${alert.title}-${alert.reason}`}
                className={`tx-ap-insight-row tx-ap-insight-row--${alert.severity} tx-refinable-block`}
                onDoubleClick={() => onRefineSummary(`señal "${alert.title}"`, `${alert.title}. ${alert.reason}`)}
                title="Doble clic para reanalizar esta señal"
              >
                <div className="tx-ap-insight-row-copy">
                  <strong>{alert.title}</strong>
                  <p>{alert.reason}</p>
                </div>
                <TxAskChatButton
                  compact
                  disabled={chatBusy}
                  label={`Preguntar al chat sobre ${alert.title}`}
                  onAsk={() => onAskSuggestedQuestion(buildAlertAskQuestion(alert.title, alert.reason))}
                />
              </article>
            ))}
            {metricExplanations.slice(0, 4).map((metric) => (
              <article
                key={`${metric.metric}-${metric.value}`}
                className="tx-ap-insight-row tx-refinable-block"
                onDoubleClick={() =>
                  onRefineSummary(`métrica "${metric.metric}"`, `${metric.metric}: ${metric.value}. ${metric.explanation}`)
                }
                title="Doble clic para reanalizar esta métrica"
              >
                <div className="tx-ap-insight-row-copy">
                  <strong>
                    {metric.metric}: {metric.value}
                  </strong>
                  <p>{metric.explanation}</p>
                </div>
                <TxAskChatButton
                  compact
                  disabled={chatBusy}
                  label={`Preguntar al chat sobre ${metric.metric}`}
                  onAsk={() => onAskSuggestedQuestion(buildMetricAskQuestion(metric.metric, metric.value))}
                />
              </article>
            ))}
          </div>
        </div>
      </div>

      <div className="tx-ap-chat-dock">
        <span className="tx-ap-section-label">Chat del resumen</span>
        <p className="tx-ap-chat-intro">
          Pregunta sobre movimientos, métricas o el análisis. El paso 2 quedó solo para subir archivos.
        </p>
        {assistantMessages.length > 0 && (
          <div className="tx-chat-thread tx-summary-chat-thread">
            {assistantMessages.slice(-6).map((message) => (
              <div
                key={`summary-${message.id}`}
                className={message.role === 'assistant' ? 'tx-refinable-block' : undefined}
                onDoubleClick={() => {
                  if (message.role !== 'assistant') return;
                  onRefineSummary('respuesta del chat', message.text);
                }}
                title={message.role === 'assistant' ? 'Doble clic para reanalizar esta respuesta' : undefined}
              >
                <TxChatMessageBubble
                  message={message}
                  highlightedMovementKeys={highlightedMovementKeys}
                  followupsDisabled={chatBusy}
                  onFollowupSelect={onAskSuggestedQuestion}
                  showFollowups={message.role !== 'assistant' || message.id === latestAssistantMessageId}
                />
              </div>
            ))}
          </div>
        )}
        {showStarterShortcuts ? (
          <div className="tx-chat-shortcuts">
            <span className="tx-chat-shortcuts-kicker">Atajos analíticos</span>
            <TxChatStarterChips chips={starterChips} disabled={chatBusy} onSelect={onAskSuggestedQuestion} />
          </div>
        ) : null}
        <div
          className="tx-composer-pro tx-composer-pro--summary"
          onFocusCapture={onCarouselPause}
          onBlurCapture={(event) => {
            const next = event.relatedTarget;
            if (next instanceof Node && event.currentTarget.contains(next)) return;
            onCarouselResume?.();
          }}
        >
          <textarea
            className="tx-composer-field"
            value={txAssistantInput}
            onChange={(e) => onAssistantInputChange(e.target.value)}
            placeholder="Pregunta sobre movimientos, categorías o el análisis"
            rows={2}
            aria-label="Mensaje del chat analítico"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!txAssistantLoading && !documentsLoading && txAssistantInput.trim()) {
                  onAssistantSend();
                }
              }
            }}
          />
          <button
            type="button"
            className="tx-composer-send"
            onClick={() => onAssistantSend()}
            disabled={txAssistantLoading || documentsLoading || !txAssistantInput.trim()}
            aria-label="Enviar mensaje"
            title="Enviar"
          >
            <svg className="tx-composer-send-icon" width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M2 8h10M9 4l5 4-5 4"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>

      <div className="tx-ap-footer-actions">
        <button type="button" className="continue-ghost tx-delete-product-btn" onClick={onDeleteProduct}>
          Eliminar producto
        </button>
        <div className="tx-ap-footer-actions-right">
          <button type="button" className="continue-ghost" onClick={onGoToEvidence}>
            Volver a evidencia
          </button>
          <button
            type="button"
            className={`button-primary ${isSavedForBatch ? 'is-saved-product' : ''}`}
            onClick={onSaveProductForBatch}
            disabled={documentsLoading}
          >
            {isSavedForBatch ? 'Producto guardado' : 'Guardar producto'}
          </button>
        </div>
      </div>
    </section>
  );
}
