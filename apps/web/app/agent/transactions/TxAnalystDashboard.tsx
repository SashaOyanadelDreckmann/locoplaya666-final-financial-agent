'use client';

import type { KeyboardEvent, Ref } from 'react';
import {
  RETRO_CHART_COLORS,
  RETRO_CHART_NEGATIVE,
  RETRO_GRID,
  RETRO_TICK,
  RETRO_TOOLTIP_STYLE,
  RetroBarShape,
  RetroDot,
} from '@/components/ui/retro-chart';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts';
import {
  buildEditorialSummaryBlocks,
  confidenceBand,
  confidenceBandLong,
  formatPercentCompact,
  movementSourceLabel,
} from './presentation';
import { TX_CATEGORY_OPTIONS } from './constants';
import type { useMovementAnalytics } from './use-movement-analytics';
import type { BankProduct } from './types';

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
  assistantMessages: Array<{ id: string; role: 'assistant' | 'user'; text: string }>;
  txAssistantInput: string;
  onAssistantInputChange: (value: string) => void;
  txAssistantLoading: boolean;
  documentsLoading: boolean;
  isSavedForBatch: boolean;
  onDeleteProduct: () => void;
  onGoToEvidence: () => void;
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
  assistantMessages,
  txAssistantInput,
  onAssistantInputChange,
  txAssistantLoading,
  documentsLoading,
  isSavedForBatch,
  onDeleteProduct,
  onGoToEvidence,
  onSaveProductForBatch,
  onRefineSummary,
  onRegenerateSummary,
  onAssistantSend,
  onSaveMovementOverride,
  onClearMovementOverride,
  buildMovementRefinementText,
}: TxAnalystDashboardProps) {
  const {
    formatCurrency,
    isCreditCardProduct,
    dashboardClusters,
    alertDetails,
    metricExplanations,
    qualityAverage,
    qualityRowsChart,
    dedupedMovementRows,
    incomeOrAbonoRows,
    expenseRows,
    incomeOrAbonoTotal,
    expenseTotal,
    tableDerivedMetrics,
    movementCount,
    netFlowFromTable,
    avgMovementFromTable,
    flowRatioFromTable,
    tablePeriod,
    summaryFromTable,
    verifiedTableRows,
    highConfidenceMovementCount,
    movementCoverageDisplay,
    enrichedCategoryData,
    txNarrative,
    categoryChartData,
    derivedTopMerchants,
    merchantConfidenceRows,
  } = analytics;
  const summaryTabId = 'tx-ex-summary-tab';
  const metricsTabId = 'tx-ex-metrics-tab';
  const summaryPanelId = 'tx-ex-summary-panel';
  const metricsPanelId = 'tx-ex-metrics-panel';
  const onExecTabsKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      onExecTabChange(execTab === 'summary' ? 'metrics' : 'summary');
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      onExecTabChange(execTab === 'metrics' ? 'summary' : 'metrics');
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      onExecTabChange('summary');
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      onExecTabChange('metrics');
    }
  };

  return (
                  <section className="tx-content-card is-main-center tx-summary-stage tx-step-reveal tx-ap-dashboard">

                    {/* ── Editorial Masthead ── */}
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
                          <button
                            type="button"
                            className="continue-ghost"
                            onClick={() => onToggleShowAllMovements()}
                          >
                            {showAllMovements ? 'Ocultar tabla' : 'Ver tabla'}
                          </button>
                        </div>
                      </div>
                      <div className="tx-ap-hero-numbers">
                        <div className="tx-ap-hero-primary">
                          <span className="tx-ap-hero-label">{isCreditCardProduct ? 'Abonos totales' : 'Ingresos totales'}</span>
                          <strong className="tx-ap-hero-value tx-ap-value-income">{formatCurrency(tableDerivedMetrics.inflowsTotal)}</strong>
                        </div>
                        <div className="tx-ap-hero-divider" aria-hidden="true" />
                        <div className="tx-ap-hero-secondary">
                          <div className="tx-ap-hero-pair">
                            <span>Egresos</span>
                            <strong className="tx-ap-value-expense">{formatCurrency(tableDerivedMetrics.outflowsTotal)}</strong>
                          </div>
                          <div className="tx-ap-hero-pair">
                            <span>Flujo neto</span>
                            <strong className={netFlowFromTable >= 0 ? 'tx-ap-value-positive' : 'tx-ap-value-negative'}>
                              {formatCurrency(netFlowFromTable)}
                            </strong>
                          </div>
                          <div className="tx-ap-hero-pair">
                            <span>Movimientos</span>
                            <strong>{movementCount.toLocaleString('es-CL')}</strong>
                          </div>
                          <div className="tx-ap-hero-pair">
                            <span>Ticket medio</span>
                            <strong>{formatCurrency(avgMovementFromTable)}</strong>
                          </div>
                        </div>
                      </div>
                      <div className="tx-ap-signal-chips" aria-label="Indicadores de fidelidad">
                        <span className="tx-ap-signal-chip">{tablePeriod.from} → {tablePeriod.to}</span>
                        <span className="tx-ap-signal-chip">Cobertura {formatPercentCompact(movementCoverageDisplay)}</span>
                        <span className="tx-ap-signal-chip">Fidelidad {formatPercentCompact(movementCount > 0 ? (verifiedTableRows / movementCount) * 100 : 0)}</span>
                        <span className="tx-ap-signal-chip">{confidenceBand(movementCount > 0 ? highConfidenceMovementCount / movementCount : 0)}</span>
                        <span className="tx-ap-signal-chip">{activeBankProduct.dashboard?.currency || 'CLP'}</span>
                      </div>
                    </div>

                    {/* ── Movement Tables (optional, right after masthead) ── */}
                    {showAllMovements ? (
                      <>
                        <div className="tx-ap-table-card tx-ap-table-card--full">
                          <span className="tx-ap-section-label">Tabla completa de movimientos</span>
                          <div className="tx-movements-table-shell">
                            <table className="tx-movements-table tx-movements-table--pro" aria-label="Tabla completa de movimientos detectados">
                              <thead>
                                <tr>
                                  <th>Tipo</th>
                                  <th>Fecha</th>
                                  <th>Detalle</th>
                                  <th>Categoría</th>
                                  <th>Monto</th>
                                  <th>Fuente</th>
                                  <th>Conf.</th>
                                </tr>
                              </thead>
                              <tbody>
                                {dedupedMovementRows.length === 0 ? (
                                  <tr>
                                    <td colSpan={7}>No hay movimientos detectados aún. Sube una cartola más nítida o archivo XLSX/PDF.</td>
                                  </tr>
                                ) : (
                                  dedupedMovementRows.map((movement, idx) => (
                                    <tr
                                      key={`mv-all-${idx}-${movement.directionForTotals}-${movement.label}-${movement.amount}`}
                                      className={`tx-refinable-block${selectedMovementKey === movement.uiKey ? ' is-selected' : ''}`}
                                      onClick={() => onSelectMovementKey(movement.uiKey)}
                                      onDoubleClick={() =>
                                        onRefineSummary(
                                          'movimiento completo',
                                          buildMovementRefinementText(movement),
                                        )
                                      }
                                      title="Doble clic para revisar esta categorización"
                                    >
                                      <td>
                                        <span className={movement.directionForTotals === 'income' ? 'tx-type-income' : 'tx-type-expense'}>
                                          {movement.directionForTotals === 'income'
                                            ? isCreditCardProduct ? 'Abono' : 'Ingreso'
                                            : 'Egreso'}
                                        </span>
                                      </td>
                                      <td>{movement.date || 'N/D'}</td>
                                      <td>{movement.merchant ? `${movement.label} · ${movement.merchant}` : movement.label}</td>
                                      <td>
                                        {movement.category || 'Otros'}
                                        {movement.overrideApplied ? <span className="tx-override-pill">Manual</span> : null}
                                      </td>
                                      <td>{formatCurrency(movement.amount)}</td>
                                      <td>{movementSourceLabel(movement.sourceKind)}</td>
                                      <td>{movement.categoryConfidence ? formatPercentCompact(movement.categoryConfidence * 100) : movement.confidence ? formatPercentCompact(movement.confidence * 100) : 'N/D'}</td>
                                    </tr>
                                  ))
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                        <div className="tx-ap-split-tables">
                          <div className="tx-ap-table-card">
                            <span className="tx-ap-section-label">{isCreditCardProduct ? 'Abonos' : 'Ingresos'}</span>
                            <div className="tx-movements-table-shell">
                              <table className="tx-movements-table tx-movements-table--pro" aria-label="Tabla de ingresos y abonos">
                                <thead>
                                  <tr>
                                    <th>Tipo</th>
                                    <th>Fecha</th>
                                    <th>Detalle</th>
                                    <th>Categoría</th>
                                    <th>Monto</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {incomeOrAbonoRows.length === 0 ? (
                                    <tr>
                                      <td colSpan={5}>No hay ingresos/abonos detectados.</td>
                                    </tr>
                                  ) : (
                                    incomeOrAbonoRows.map((movement, idx) => (
                                      <tr
                                        key={`mv-in-${idx}-${movement.directionForTotals}-${movement.label}-${movement.amount}`}
                                        className={`tx-refinable-block${selectedMovementKey === movement.uiKey ? ' is-selected' : ''}`}
                                        onClick={() => onSelectMovementKey(movement.uiKey)}
                                        onDoubleClick={() =>
                                          onRefineSummary(
                                            isCreditCardProduct ? 'abono' : 'ingreso',
                                            buildMovementRefinementText(movement),
                                          )
                                        }
                                        title="Doble clic para revisar esta categorización"
                                      >
                                        <td><span className="tx-type-income">{isCreditCardProduct ? 'Abono' : 'Ingreso'}</span></td>
                                        <td>{movement.date || 'N/D'}</td>
                                        <td>{movement.merchant ? `${movement.label} · ${movement.merchant}` : movement.label}</td>
                                        <td>
                                          {movement.category || 'Otros'}
                                          {movement.overrideApplied ? <span className="tx-override-pill">Manual</span> : null}
                                        </td>
                                        <td>{formatCurrency(movement.amount)}</td>
                                      </tr>
                                    ))
                                  )}
                                </tbody>
                              </table>
                            </div>
                            <div className="tx-table-total-box is-income" role="status" aria-live="polite">
                              <span>{isCreditCardProduct ? 'Total abonos' : 'Total ingresos'}</span>
                              <strong>{formatCurrency(incomeOrAbonoTotal)}</strong>
                            </div>
                          </div>
                          <div className="tx-ap-table-card">
                            <span className="tx-ap-section-label">Egresos</span>
                            <div className="tx-movements-table-shell">
                              <table className="tx-movements-table tx-movements-table--pro" aria-label="Tabla de egresos">
                                <thead>
                                  <tr>
                                    <th>Tipo</th>
                                    <th>Fecha</th>
                                    <th>Detalle</th>
                                    <th>Categoría</th>
                                    <th>Monto</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {expenseRows.length === 0 ? (
                                    <tr>
                                      <td colSpan={5}>No hay egresos detectados.</td>
                                    </tr>
                                  ) : (
                                    expenseRows.map((movement, idx) => (
                                      <tr
                                        key={`mv-out-${idx}-${movement.directionForTotals}-${movement.label}-${movement.amount}`}
                                        className={`tx-refinable-block${selectedMovementKey === movement.uiKey ? ' is-selected' : ''}`}
                                        onClick={() => onSelectMovementKey(movement.uiKey)}
                                        onDoubleClick={() =>
                                          onRefineSummary(
                                            'egreso',
                                            buildMovementRefinementText(movement),
                                          )
                                        }
                                        title="Doble clic para revisar esta categorización"
                                      >
                                        <td><span className="tx-type-expense">Egreso</span></td>
                                        <td>{movement.date || 'N/D'}</td>
                                        <td>{movement.merchant ? `${movement.label} · ${movement.merchant}` : movement.label}</td>
                                        <td>
                                          {movement.category || 'Otros'}
                                          {movement.overrideApplied ? <span className="tx-override-pill">Manual</span> : null}
                                        </td>
                                        <td>{formatCurrency(movement.amount)}</td>
                                      </tr>
                                    ))
                                  )}
                                </tbody>
                              </table>
                            </div>
                            <div className="tx-table-total-box is-expense" role="status" aria-live="polite">
                              <span>Total egresos</span>
                              <strong>{formatCurrency(expenseTotal)}</strong>
                            </div>
                          </div>
                        </div>
                      </>
                    ) : null}

                    {selectedMovement ? (
                      <div className="tx-override-editor-card">
                        <div className="tx-override-editor-head">
                          <div>
                            <span className="tx-ap-section-label">Editor de categorización</span>
                            <p className="tx-override-editor-copy">
                              Ajusta comercio y categoría para este merchant. El aprendizaje queda guardado y se reutiliza en próximas revisiones.
                            </p>
                          </div>
                          <div className="tx-override-editor-meta">
                            <span>{selectedMovement.label}</span>
                            <strong>{formatCurrency(selectedMovement.amount)}</strong>
                          </div>
                        </div>
                        <div className="tx-override-editor-grid">
                          <label>
                            Comercio
                            <input
                              value={overrideMerchantDraft}
                              onChange={(e) => onOverrideMerchantDraftChange(e.target.value)}
                              placeholder="Nombre comercial canónico"
                            />
                          </label>
                          <label>
                            Categoría
                            <select
                              value={overrideCategoryDraft}
                              onChange={(e) => onOverrideCategoryDraftChange(e.target.value)}
                            >
                              {TX_CATEGORY_OPTIONS.map((category) => (
                                <option key={category} value={category}>
                                  {category}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <div className="tx-override-editor-actions">
                          <button type="button" className="button-primary" onClick={onSaveMovementOverride}>
                            Guardar aprendizaje
                          </button>
                          <button
                            type="button"
                            className="continue-ghost"
                            onClick={onClearMovementOverride}
                            disabled={!selectedMovement.overrideApplied}
                          >
                            Limpiar override
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {merchantConfidenceRows.length > 0 ? (
                      <div className="tx-merchant-quality-card">
                        <div className="tx-merchant-quality-head">
                          <span className="tx-ap-section-label">Precisión por comercio</span>
                          <span className="tx-meta-card-kicker">Confianza promedio y aprendizaje manual</span>
                        </div>
                        <div className="tx-merchant-quality-list">
                          {merchantConfidenceRows.map((row) => (
                            <article key={`${row.merchant}-${row.category}`} className="tx-merchant-quality-row">
                              <div>
                                <strong>{row.merchant}</strong>
                                <p>{row.category} · {row.count} mov.</p>
                              </div>
                              <div className="tx-merchant-quality-metrics">
                                <span>{formatPercentCompact(row.avgConfidence * 100)}</span>
                                <span>{row.manual ? 'Manual' : confidenceBandLong(row.avgConfidence)}</span>
                              </div>
                            </article>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {/* ── Executive Summary — interactive premium card ── */}
                    {(() => {
                      const execBlocks = buildEditorialSummaryBlocks(hasSummary ? summaryText : summaryFromTable).slice(0, 2);
                      const topMerchantLabel = derivedTopMerchants[0]?.merchant || enrichedCategoryData[0]?.name || dashboardClusters[0]?.name || '—';
                      const fidelityPct = movementCount > 0 ? (verifiedTableRows / movementCount) * 100 : 0;
                      const confPct = movementCount > 0 ? (highConfidenceMovementCount / movementCount) * 100 : 0;
                      return (
                        <div className="tx-ex-card" role="region" aria-label="Resumen ejecutivo">
                          {/* Header row */}
                          <div className="tx-ex-header">
                            <div className="tx-ex-header-left">
                              <span className="tx-ex-eyebrow">Resumen ejecutivo</span>
                              {summaryModel ? <span className="tx-ex-model-tag">{summaryModel}</span> : null}
                            </div>
                            <div className="tx-ex-tabs" role="tablist" aria-label="Vista del resumen" onKeyDown={onExecTabsKeyDown}>
                              <button
                                id={summaryTabId}
                                type="button"
                                role="tab"
                                aria-selected={execTab === 'summary'}
                                aria-controls={summaryPanelId}
                                tabIndex={execTab === 'summary' ? 0 : -1}
                                className={`tx-ex-tab${execTab === 'summary' ? ' is-active' : ''}`}
                                onClick={() => onExecTabChange('summary')}
                              >
                                Análisis
                              </button>
                              <button
                                id={metricsTabId}
                                type="button"
                                role="tab"
                                aria-selected={execTab === 'metrics'}
                                aria-controls={metricsPanelId}
                                tabIndex={execTab === 'metrics' ? 0 : -1}
                                className={`tx-ex-tab${execTab === 'metrics' ? ' is-active' : ''}`}
                                onClick={() => onExecTabChange('metrics')}
                              >
                                Métricas
                              </button>
                            </div>
                          </div>

                          {/* Summary tab */}
                          {execTab === 'summary' && (
                            <div className="tx-ex-body" role="tabpanel" id={summaryPanelId} aria-labelledby={summaryTabId}>
                              {execBlocks.length > 0 ? (
                                execBlocks.map((block, i) => (
                                  <div
                                    key={i}
                                    className={`tx-ex-block${block.lead ? ' is-lead' : ''} tx-refinable-block`}
                                    onDoubleClick={() =>
                                      onRefineSummary(
                                        block.kicker ? `bloque "${block.kicker}"` : 'bloque ejecutivo',
                                        block.body,
                                      )
                                    }
                                    title="Doble clic para reanalizar este bloque"
                                  >
                                    {block.kicker ? <span className="tx-ex-kicker">{block.kicker}</span> : null}
                                    <p className="tx-ex-para">{block.body}</p>
                                  </div>
                                ))
                              ) : (
                                <p className="tx-ex-para tx-ex-para--empty">Generando análisis…</p>
                              )}
                            </div>
                          )}

                          {/* Metrics tab — 4 KPI cards */}
                          {execTab === 'metrics' && (
                            <div className="tx-ex-metrics" role="tabpanel" id={metricsPanelId} aria-labelledby={metricsTabId}>
                              <article className="tx-ex-kpi" style={{ '--card-idx': 0 } as React.CSSProperties}>
                                <span className="tx-ex-kpi-label">Pulso de caja</span>
                                <strong className={`tx-ex-kpi-value${netFlowFromTable >= 0 ? ' is-pos' : ' is-neg'}`}>
                                  {formatCurrency(netFlowFromTable)}
                                </strong>
                                <p className="tx-ex-kpi-note">{txNarrative.cashAngle}</p>
                              </article>
                              <article className="tx-ex-kpi" style={{ '--card-idx': 1 } as React.CSSProperties}>
                                <span className="tx-ex-kpi-label">Motor del gasto</span>
                                <strong className="tx-ex-kpi-value is-accent">{topMerchantLabel}</strong>
                                <p className="tx-ex-kpi-note">{txNarrative.marketAngle}</p>
                              </article>
                              <article className="tx-ex-kpi" style={{ '--card-idx': 2 } as React.CSSProperties}>
                                <span className="tx-ex-kpi-label">Fidelidad del set</span>
                                <strong className="tx-ex-kpi-value is-pos">{formatPercentCompact(fidelityPct)}</strong>
                                <p className="tx-ex-kpi-note">{txNarrative.fidelityAngle}</p>
                              </article>
                              <article className="tx-ex-kpi" style={{ '--card-idx': 3 } as React.CSSProperties}>
                                <span className="tx-ex-kpi-label">Confianza operativa</span>
                                <strong className="tx-ex-kpi-value is-pos">{formatPercentCompact(confPct)}</strong>
                                <p className="tx-ex-kpi-note">{txNarrative.confidenceAngle}</p>
                              </article>
                            </div>
                          )}

                          {/* Footer */}
                          <div className="tx-ex-footer">
                            <button
                              type="button"
                              className="tx-ex-regen-btn"
                              disabled={txAssistantLoading || summaryRegenerationsLeft <= 0}
                              onClick={() => onRegenerateSummary()}
                            >
                              {txAssistantLoading ? (
                                <span className="tx-ex-regen-spinner" aria-hidden="true" />
                              ) : null}
                              {summaryRegenerationsLeft > 0 ? 'Revisar resumen' : 'Resumen final'}
                            </button>
                            <span className="tx-ex-revs">{summaryRegenerationsLeft} revisión(es)</span>
                          </div>
                        </div>
                      );
                    })()}

                    {/* ── Charts ── */}
                    <div className="tx-ap-charts-section">
                      <div className="tx-ap-section-header">
                        <span className="tx-ap-section-label">Gráficos clave</span>
                      </div>
                      <div className="tx-ap-chart-grid">
                        <article className="tx-ap-chart-card">
                          <h5 className="tx-ap-chart-title">Flujo financiero</h5>
                          <div style={{ width: '100%', height: 200 }}>
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart
                                data={[
                                  { metric: isCreditCardProduct ? 'Abonos' : 'Ingresos', value: tableDerivedMetrics.inflowsTotal },
                                  { metric: 'Egresos', value: tableDerivedMetrics.outflowsTotal },
                                  { metric: 'Flujo neto', value: netFlowFromTable },
                                ]}
                                margin={{ top: 8, right: 8, left: 0, bottom: 8 }}
                              >
                                <CartesianGrid strokeDasharray="8 8" stroke={RETRO_GRID} />
                                <XAxis dataKey="metric" interval={0} tick={RETRO_TICK} axisLine={false} tickLine={false} />
                                <YAxis tickFormatter={(value) => formatCurrency(Number(value))} tick={RETRO_TICK} axisLine={false} tickLine={false} />
                                <Tooltip
                                  formatter={(value) => formatCurrency(Number(value))}
                                  contentStyle={RETRO_TOOLTIP_STYLE}
                                  labelStyle={{ color: '#ffffff' }}
                                  itemStyle={{ color: '#ffffff' }}
                                />
                                <Bar dataKey="value" shape={<RetroBarShape />}>
                                  {[
                                    { metric: isCreditCardProduct ? 'Abonos' : 'Ingresos', value: tableDerivedMetrics.inflowsTotal },
                                    { metric: 'Egresos', value: tableDerivedMetrics.outflowsTotal },
                                    { metric: 'Flujo neto', value: netFlowFromTable },
                                  ].map((entry, idx) => (
                                    <Cell
                                      key={`flow-bar-${entry.metric}`}
                                      fill={entry.value >= 0 ? RETRO_CHART_COLORS[idx % RETRO_CHART_COLORS.length] : RETRO_CHART_NEGATIVE}
                                    />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </article>
                        <article className="tx-ap-chart-card">
                          <h5 className="tx-ap-chart-title">Categorías por monto</h5>
                          <div style={{ width: '100%', height: 200 }}>
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={categoryChartData} layout="vertical" margin={{ top: 8, right: 8, left: 20, bottom: 8 }}>
                                <CartesianGrid strokeDasharray="8 8" stroke={RETRO_GRID} />
                                <XAxis type="number" tickFormatter={(value) => formatCurrency(Number(value))} tick={RETRO_TICK} axisLine={false} tickLine={false} />
                                <YAxis dataKey="category" type="category" width={120} tick={RETRO_TICK} axisLine={false} tickLine={false} />
                                <Tooltip
                                  formatter={(value) => formatCurrency(Number(value))}
                                  contentStyle={RETRO_TOOLTIP_STYLE}
                                  labelStyle={{ color: '#ffffff' }}
                                  itemStyle={{ color: '#ffffff' }}
                                />
                                <Bar dataKey="amount" shape={<RetroBarShape />}>
                                  {categoryChartData.map((entry, idx) => (
                                    <Cell key={`cat-bar-${entry.category}`} fill={RETRO_CHART_COLORS[idx % RETRO_CHART_COLORS.length]} />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </article>
                        <article className="tx-ap-chart-card tx-ap-chart-card--wide">
                          <h5 className="tx-ap-chart-title">Calidad vs filas extraídas</h5>
                          <div className="tx-ap-chart-note-layout">
                            <div style={{ width: '100%', height: 200 }}>
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={qualityRowsChart} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                                  <CartesianGrid strokeDasharray="8 8" stroke={RETRO_GRID} />
                                  <XAxis dataKey="document" interval={0} tick={{ ...RETRO_TICK, fontSize: 10 }} axisLine={false} tickLine={false} />
                                  <YAxis yAxisId="left" tickFormatter={(value) => `${Number(value)}%`} tick={RETRO_TICK} domain={[0, 100]} axisLine={false} tickLine={false} />
                                  <YAxis yAxisId="right" orientation="right" tickFormatter={(value) => new Intl.NumberFormat('es-CL').format(Number(value))} tick={RETRO_TICK} axisLine={false} tickLine={false} />
                                  <Tooltip contentStyle={RETRO_TOOLTIP_STYLE} labelStyle={{ color: '#ffffff' }} itemStyle={{ color: '#ffffff' }} />
                                  <Legend />
                                  <Line yAxisId="left" type="stepAfter" dataKey="reliability" stroke={RETRO_CHART_COLORS[3]} strokeWidth={4} dot={<RetroDot stroke={RETRO_CHART_COLORS[3]} />} activeDot={<RetroDot stroke={RETRO_CHART_COLORS[0]} />} name="Confiabilidad %" />
                                  <Line yAxisId="right" type="stepAfter" dataKey="rows" stroke={RETRO_CHART_COLORS[1]} strokeWidth={4} dot={<RetroDot stroke={RETRO_CHART_COLORS[1]} />} activeDot={<RetroDot stroke={RETRO_CHART_COLORS[2]} />} name="Filas extraídas" />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                            <aside className="tx-ap-chart-note" aria-label="Cómo leer este gráfico">
                              <strong>Qué muestra</strong>
                              <p>Confiabilidad indica la calidad de extracción por respaldo. Filas extraídas mide el volumen detectado.</p>
                              <strong>Cómo leerlo</strong>
                              <p>Ideal: confiabilidad alta y filas suficientes. Si baja confiabilidad, mejorar nitidez o formato del respaldo.</p>
                            </aside>
                          </div>
                        </article>
                      </div>
                    </div>

                    {/* ── Clusters + Insights ── */}
                    <div className="tx-ap-intel-grid">
                      <div className="tx-ap-intel-card">
                        <div className="tx-ap-section-header">
                          <span className="tx-ap-section-label">Grupos de gasto</span>
                        </div>
                        <div className="tx-ap-cluster-list" aria-label="Grupos de gasto" ref={groupCarouselRef}>
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
                                <p>{formatCurrency(cluster.amount)} · {cluster.tx_count} mov. · {formatCurrency(cluster.avg_ticket)} ticket</p>
                                {cluster.examples.length > 0 ? (
                                  <div className="tx-ap-cluster-tags">
                                    {cluster.examples.slice(0, 3).map((example) => (
                                      <span key={`${cluster.name}-${example}`}>{example}</span>
                                    ))}
                                  </div>
                                ) : null}
                              </article>
                            ))
                          )}
                        </div>
                      </div>
                      <div className="tx-ap-intel-card">
                        <div className="tx-ap-section-header">
                          <span className="tx-ap-section-label">Lectura fina</span>
                        </div>
                        <div className="tx-ap-insight-stack" aria-label="Señales analíticas" ref={insightCarouselRef}>
                          {alertDetails.length === 0 && metricExplanations.length === 0 ? (
                            <p className="tx-ap-empty-note">Sin señales analíticas suficientes aún.</p>
                          ) : null}
                          {(alertDetails.length > 0 ? alertDetails : []).slice(0, 4).map((alert) => (
                            <article
                              key={`${alert.title}-${alert.reason}`}
                              className={`tx-ap-insight-row tx-ap-insight-row--${alert.severity} tx-refinable-block`}
                              onDoubleClick={() =>
                                onRefineSummary(
                                  `señal "${alert.title}"`,
                                  `${alert.title}. ${alert.reason}`,
                                )
                              }
                              title="Doble clic para reanalizar esta señal"
                            >
                              <strong>{alert.title}</strong>
                              <p>{alert.reason}</p>
                            </article>
                          ))}
                          {metricExplanations.slice(0, 4).map((metric) => (
                            <article
                              key={`${metric.metric}-${metric.value}`}
                              className="tx-ap-insight-row tx-refinable-block"
                              onDoubleClick={() =>
                                onRefineSummary(
                                  `métrica "${metric.metric}"`,
                                  `${metric.metric}: ${metric.value}. ${metric.explanation}`,
                                )
                              }
                              title="Doble clic para reanalizar esta métrica"
                            >
                              <strong>{metric.metric}: {metric.value}</strong>
                              <p>{metric.explanation}</p>
                            </article>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* ── Ficha Analítica ── */}
                    <div className="tx-ap-ficha">
                      <div className="tx-ap-section-header">
                        <span className="tx-ap-section-label">Ficha analítica del producto</span>
                        <div className="tx-ap-ficha-pills">
                          <span className="tx-ap-signal-chip">Calidad {qualityAverage > 0 ? `${qualityAverage}%` : 'N/D'}</span>
                        </div>
                      </div>
                      {summaryFromTable ? <p className="tx-ap-ficha-summary">{summaryFromTable}</p> : null}
                      <div className="tx-ap-kpi-secondary-grid">
                        <article className="tx-ap-kpi-secondary-card tx-ap-kpi--income">
                          <span>{isCreditCardProduct ? 'Abonos totales' : 'Ingresos totales'}</span>
                          <strong>{formatCurrency(tableDerivedMetrics.inflowsTotal)}</strong>
                        </article>
                        <article className="tx-ap-kpi-secondary-card tx-ap-kpi--expense">
                          <span>Egresos totales</span>
                          <strong>{formatCurrency(tableDerivedMetrics.outflowsTotal)}</strong>
                        </article>
                        <article className="tx-ap-kpi-secondary-card">
                          <span>Flujo neto</span>
                          <strong>{formatCurrency(netFlowFromTable)}</strong>
                        </article>
                        <article className="tx-ap-kpi-secondary-card">
                          <span>Movimientos</span>
                          <strong>{movementCount.toLocaleString('es-CL')}</strong>
                        </article>
                        <article className="tx-ap-kpi-secondary-card">
                          <span>Ticket promedio</span>
                          <strong>{formatCurrency(avgMovementFromTable)}</strong>
                        </article>
                        <article className="tx-ap-kpi-secondary-card">
                          <span>Ratio gasto/ingreso</span>
                          <strong>{flowRatioFromTable > 0 ? `${(flowRatioFromTable * 100).toFixed(1)}%` : 'N/D'}</strong>
                        </article>
                        <article className="tx-ap-kpi-secondary-card">
                          <span>Filas tabulares fieles</span>
                          <strong>{verifiedTableRows.toLocaleString('es-CL')}</strong>
                        </article>
                        <article className="tx-ap-kpi-secondary-card">
                          <span>Cobertura detectada</span>
                          <strong>{formatPercentCompact(movementCoverageDisplay)}</strong>
                        </article>
                        <article className="tx-ap-kpi-secondary-card">
                          <span>Alta confianza</span>
                          <strong>{highConfidenceMovementCount.toLocaleString('es-CL')}</strong>
                        </article>
                        <article className="tx-ap-kpi-secondary-card">
                          <span>Origen tabular</span>
                          <strong>{formatPercentCompact(movementCount > 0 ? (verifiedTableRows / movementCount) * 100 : 0)}</strong>
                        </article>
                      </div>
                    </div>

                    {/* ── Chat Dock ── */}
                    <div className="tx-ap-chat-dock">
                      <span className="tx-ap-section-label">Seguir conversación</span>
                      {assistantMessages.length > 0 && (
                        <div className="tx-chat-thread tx-summary-chat-thread">
                          {assistantMessages.slice(-2).map((message) => (
                            <div
                              key={`summary-${message.id}`}
                              className={`tx-chat-bubble ${message.role === 'user' ? 'is-user' : 'is-assistant'}${message.role === 'assistant' ? ' tx-refinable-block' : ''}`}
                              onDoubleClick={() => {
                                if (message.role !== 'assistant') return;
                                onRefineSummary('respuesta del chat', message.text);
                              }}
                              title={message.role === 'assistant' ? 'Doble clic para reanalizar esta respuesta' : undefined}
                            >
                              <div className="tx-chat-bubble-role">
                                {message.role === 'user' ? 'Tú' : 'Asistente'}
                              </div>
                              <div className="tx-chat-bubble-text">{message.text}</div>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="bcc-hero-input-wrap tx-chat-composer-wrap tx-chat-composer-wrap--premium tx-summary-chat-composer">
                        <input
                          className="bcc-hero-input"
                          value={txAssistantInput}
                          onChange={(e) => onAssistantInputChange(e.target.value)}
                          placeholder="Pregúntame algo sobre este resumen"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') onAssistantSend();
                          }}
                        />
                        <button
                          type="button"
                          className="bcc-hero-send"
                          onClick={() => onAssistantSend()}
                          disabled={txAssistantLoading || documentsLoading || !txAssistantInput.trim()}
                          aria-label="Enviar"
                          title="Enviar"
                        >
                          Enviar
                        </button>
                      </div>
                    </div>

                    {/* ── Footer Actions ── */}
                    <div className="tx-ap-footer-actions">
                      <button type="button" className="continue-ghost tx-delete-product-btn" onClick={onDeleteProduct}>Eliminar producto</button>
                      <div className="tx-ap-footer-actions-right">
                        <button
                          type="button"
                          className="continue-ghost"
                          onClick={onGoToEvidence}
                        >
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
