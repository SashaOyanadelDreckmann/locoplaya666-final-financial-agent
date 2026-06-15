'use client';

import { useMemo } from 'react';
import { formatPercentCompact, movementSourceLabel } from './presentation';
import { TxAskChatButton } from './tx-chat-ui';
import { buildMovementAskQuestion } from './tx-click-to-ask.helpers';
import type { MovementHeatKind } from './transactions-modal.helpers';
import { buildMovementHeatProps, movementTypeLabel } from './tx-movement-table.helpers';
import type { useMovementAnalytics } from './use-movement-analytics';

type MovementAnalytics = ReturnType<typeof useMovementAnalytics>;
type MovementRow = MovementAnalytics['dedupedMovementRows'][number];

export interface TxMovementTableProps {
  analytics: Pick<
    MovementAnalytics,
    | 'formatCurrency'
    | 'isCreditCardProduct'
    | 'dedupedMovementRows'
    | 'incomeOrAbonoRows'
    | 'expenseRows'
    | 'incomeOrAbonoTotal'
    | 'expenseTotal'
    | 'inflowLabel'
  >;
  selectedMovementKey: string | null;
  onSelectMovementKey: (key: string | null) => void;
  isMovementChatHighlighted: (promptKey: string) => boolean;
  chatBusy: boolean;
  onAskSuggestedQuestion: (question: string) => void;
  onRefineSummary: (source: string, body: string) => void;
  buildMovementRefinementText: (movement: MovementRow) => string;
}

export function TxMovementTable({
  analytics,
  selectedMovementKey,
  onSelectMovementKey,
  isMovementChatHighlighted,
  chatBusy,
  onAskSuggestedQuestion,
  onRefineSummary,
  buildMovementRefinementText,
}: TxMovementTableProps) {
  const {
    formatCurrency,
    isCreditCardProduct,
    dedupedMovementRows,
    incomeOrAbonoRows,
    expenseRows,
    incomeOrAbonoTotal,
    expenseTotal,
    inflowLabel,
  } = analytics;

  const inflowSectionLabel =
    inflowLabel === 'abonos e ingresos'
      ? 'Abonos e ingresos'
      : inflowLabel === 'abonos'
        ? 'Abonos'
        : 'Ingresos';

  const movementHeatProps = useMemo(
    () => buildMovementHeatProps(incomeOrAbonoRows, expenseRows),
    [incomeOrAbonoRows, expenseRows],
  );

  const renderMovementAskButton = (movement: MovementRow) => (
    <TxAskChatButton
      compact
      disabled={chatBusy}
      label={`Preguntar al chat sobre ${movement.merchant || movement.label}`}
      onAsk={() => onAskSuggestedQuestion(buildMovementAskQuestion(movement))}
    />
  );

  const renderMovementDetailCell = (movement: MovementRow) => {
    const detail = movement.merchant ? `${movement.label} · ${movement.merchant}` : movement.label;
    return (
      <td className="tx-movement-detail-cell">
        <span className="tx-movement-detail-text" title={detail}>
          {detail}
        </span>
      </td>
    );
  };

  return (
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
                <th aria-label="Acciones de chat">Chat</th>
              </tr>
            </thead>
            <tbody>
              {dedupedMovementRows.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    No hay movimientos detectados aún. Sube una cartola más nítida o archivo XLSX/PDF.
                  </td>
                </tr>
              ) : (
                dedupedMovementRows.map((movement, idx) => {
                  const heatKind: MovementHeatKind =
                    movement.directionForTotals === 'income' ? 'income' : 'expense';
                  const heat = movementHeatProps(movement.amount, heatKind);
                  return (
                    <tr
                      key={`mv-all-${idx}-${movement.directionForTotals}-${movement.label}-${movement.amount}`}
                      className={`tx-refinable-block ${heat.className}${selectedMovementKey === movement.uiKey ? ' is-selected' : ''}${isMovementChatHighlighted(movement.promptKey) ? ' is-chat-highlighted' : ''}`}
                      style={heat.style}
                      onClick={() => onSelectMovementKey(movement.uiKey)}
                      onDoubleClick={() =>
                        onRefineSummary('movimiento completo', buildMovementRefinementText(movement))
                      }
                      title="Clic para seleccionar · Doble clic para revisar categorización"
                    >
                      <td>
                        <span
                          className={
                            movement.directionForTotals === 'income' ? 'tx-type-income' : 'tx-type-expense'
                          }
                        >
                          {movementTypeLabel(movement, isCreditCardProduct)}
                        </span>
                      </td>
                      <td>{movement.date || 'N/D'}</td>
                      {renderMovementDetailCell(movement)}
                      <td>
                        {movement.category || 'Otros'}
                        {movement.overrideApplied ? <span className="tx-override-pill">Manual</span> : null}
                      </td>
                      <td>{formatCurrency(movement.amount)}</td>
                      <td>{movementSourceLabel(movement.sourceKind)}</td>
                      <td>
                        {movement.categoryConfidence
                          ? formatPercentCompact(movement.categoryConfidence * 100)
                          : movement.confidence
                            ? formatPercentCompact(movement.confidence * 100)
                            : 'N/D'}
                      </td>
                      <td className="tx-movement-chat-action">{renderMovementAskButton(movement)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className="tx-ap-split-tables">
        <div className="tx-ap-table-card">
          <span className="tx-ap-section-label">{inflowSectionLabel}</span>
          <div className="tx-movements-table-shell">
            <table className="tx-movements-table tx-movements-table--pro" aria-label={`Tabla de ${inflowLabel}`}>
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Fecha</th>
                  <th>Detalle</th>
                  <th>Categoría</th>
                  <th>Monto</th>
                  <th aria-label="Acciones de chat">Chat</th>
                </tr>
              </thead>
              <tbody>
                {incomeOrAbonoRows.length === 0 ? (
                  <tr>
                    <td colSpan={6}>No hay ingresos/abonos detectados.</td>
                  </tr>
                ) : (
                  incomeOrAbonoRows.map((movement, idx) => {
                    const heat = movementHeatProps(movement.amount, 'income');
                    return (
                      <tr
                        key={`mv-in-${idx}-${movement.directionForTotals}-${movement.label}-${movement.amount}`}
                        className={`tx-refinable-block ${heat.className}${selectedMovementKey === movement.uiKey ? ' is-selected' : ''}${isMovementChatHighlighted(movement.promptKey) ? ' is-chat-highlighted' : ''}`}
                        style={heat.style}
                        onClick={() => onSelectMovementKey(movement.uiKey)}
                        onDoubleClick={() =>
                          onRefineSummary(
                            isCreditCardProduct ? 'abono' : 'ingreso',
                            buildMovementRefinementText(movement),
                          )
                        }
                        title="Clic para seleccionar · Doble clic para revisar categorización"
                      >
                        <td>
                          <span className="tx-type-income">{movementTypeLabel(movement, isCreditCardProduct)}</span>
                        </td>
                        <td>{movement.date || 'N/D'}</td>
                        {renderMovementDetailCell(movement)}
                        <td>
                          {movement.category || 'Otros'}
                          {movement.overrideApplied ? <span className="tx-override-pill">Manual</span> : null}
                        </td>
                        <td>{formatCurrency(movement.amount)}</td>
                        <td className="tx-movement-chat-action">{renderMovementAskButton(movement)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="tx-table-total-box is-income" role="status" aria-live="polite">
            <span>
              {inflowSectionLabel.startsWith('Abonos')
                ? `Total ${inflowSectionLabel.toLowerCase()}`
                : 'Total ingresos'}
            </span>
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
                  <th aria-label="Acciones de chat">Chat</th>
                </tr>
              </thead>
              <tbody>
                {expenseRows.length === 0 ? (
                  <tr>
                    <td colSpan={6}>No hay egresos detectados.</td>
                  </tr>
                ) : (
                  expenseRows.map((movement, idx) => {
                    const heat = movementHeatProps(movement.amount, 'expense');
                    return (
                      <tr
                        key={`mv-out-${idx}-${movement.directionForTotals}-${movement.label}-${movement.amount}`}
                        className={`tx-refinable-block ${heat.className}${selectedMovementKey === movement.uiKey ? ' is-selected' : ''}${isMovementChatHighlighted(movement.promptKey) ? ' is-chat-highlighted' : ''}`}
                        style={heat.style}
                        onClick={() => onSelectMovementKey(movement.uiKey)}
                        onDoubleClick={() =>
                          onRefineSummary('egreso', buildMovementRefinementText(movement))
                        }
                        title="Clic para seleccionar · Doble clic para revisar categorización"
                      >
                        <td>
                          <span className="tx-type-expense">Egreso</span>
                        </td>
                        <td>{movement.date || 'N/D'}</td>
                        {renderMovementDetailCell(movement)}
                        <td>
                          {movement.category || 'Otros'}
                          {movement.overrideApplied ? <span className="tx-override-pill">Manual</span> : null}
                        </td>
                        <td>{formatCurrency(movement.amount)}</td>
                        <td className="tx-movement-chat-action">{renderMovementAskButton(movement)}</td>
                      </tr>
                    );
                  })
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
  );
}
