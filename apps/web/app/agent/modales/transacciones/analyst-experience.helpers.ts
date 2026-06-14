import type { BankProduct } from './types';
import { parsedDocumentsHaveTableSignals } from './transactions-modal.helpers';

/** Aligned with `resolveEvidenceFidelity` table-ratio gate in shared. */
export const ANALYST_TABLE_MOVEMENT_RATIO_THRESHOLD = 0.42;

/** Authoritative line-based PDFs/text extraction with enough rows merit full tooling. */
export const ANALYST_MIN_AUTHORITATIVE_LINE_MOVEMENTS = 3;

export const ANALYST_MIN_HIGH_CONFIDENCE_MOVEMENTS = 3;

export type AnalystExperienceMode = 'minimal' | 'full';

export type AnalystExperienceDecision = {
  mode: AnalystExperienceMode;
  reason: string;
};

export type AnalystExperienceState =
  | { status: 'pending'; reason: string }
  | { status: 'resolved'; decision: AnalystExperienceDecision };

type ParsedDocumentTableSignalSource = {
  structuredData?: unknown;
  documentProfile?: unknown;
};

export type DashboardMovementSignals = {
  movementCount: number;
  tableMovementRatio: number;
  tableRowsVerified: number;
  highConfidenceMovementCount: number;
};

export function computeDashboardMovementSignals(
  dashboard?: BankProduct['dashboard'] | null,
): DashboardMovementSignals {
  const movements = dashboard?.movements ?? [];
  const movementCount = Math.max(
    Number(dashboard?.keyMetrics?.movement_count ?? 0) || 0,
    movements.length,
  );
  const tableMovements = movements.filter((movement) => movement.source_kind === 'table').length;
  const highConfidenceMovementCount = movements.filter(
    (movement) => Number(movement.confidence ?? movement.category_confidence ?? 0) >= 0.82,
  ).length;

  return {
    movementCount,
    tableMovementRatio: movementCount > 0 ? tableMovements / movementCount : 0,
    tableRowsVerified: Number(dashboard?.keyMetrics?.table_rows_verified ?? 0) || 0,
    highConfidenceMovementCount: Math.max(
      Number(dashboard?.keyMetrics?.high_confidence_movement_count ?? 0) || 0,
      highConfidenceMovementCount,
    ),
  };
}

function isQualitativeUploadRail(format: string | null | undefined): boolean {
  return format === 'photos' || format === 'text';
}

function hasAuthoritativeContableDepth(
  signals: DashboardMovementSignals,
  hasDocTableSignals: boolean,
): boolean {
  if (hasDocTableSignals) return true;
  if (signals.tableRowsVerified > 0) return true;
  if (
    signals.tableMovementRatio >= ANALYST_TABLE_MOVEMENT_RATIO_THRESHOLD &&
    signals.movementCount > 0
  ) {
    return true;
  }
  if (signals.movementCount >= ANALYST_MIN_AUTHORITATIVE_LINE_MOVEMENTS) return true;
  if (
    signals.highConfidenceMovementCount >= ANALYST_MIN_HIGH_CONFIDENCE_MOVEMENTS &&
    signals.movementCount >= ANALYST_MIN_HIGH_CONFIDENCE_MOVEMENTS
  ) {
    return true;
  }
  return false;
}

function hasStructuredExplorationValue(
  signals: DashboardMovementSignals,
  hasDocTableSignals: boolean,
): boolean {
  if (hasDocTableSignals) return true;
  if (
    signals.tableMovementRatio >= ANALYST_TABLE_MOVEMENT_RATIO_THRESHOLD &&
    signals.movementCount >= 2
  ) {
    return true;
  }
  return signals.movementCount > 0;
}

export function isDashboardHydratedForAnalystRouting(params: {
  parsedDocuments?: Array<unknown>;
  dashboard?: BankProduct['dashboard'] | null;
}): boolean {
  const parsedCount = params.parsedDocuments?.length ?? 0;
  if (parsedCount === 0) return true;

  const dashboard = params.dashboard;
  if (!dashboard) return false;

  const movementCount = Number(dashboard.keyMetrics?.movement_count ?? 0) || 0;
  const movementsLength = dashboard.movements?.length ?? 0;
  const hasSummary = typeof dashboard.summary === 'string' && dashboard.summary.trim().length >= 20;
  const hasFidelity =
    dashboard.evidenceFidelity === 'authoritative' || dashboard.evidenceFidelity === 'indicative';

  return movementCount > 0 || movementsLength > 0 || hasSummary || hasFidelity;
}

export function resolveAnalystExperienceState(params: {
  selectedUploadFormat: string | null;
  evidenceFidelity?: 'authoritative' | 'indicative' | null;
  parsedDocuments?: ParsedDocumentTableSignalSource[];
  dashboard?: BankProduct['dashboard'] | null;
  isPipelineBusy?: boolean;
}): AnalystExperienceState {
  if (params.isPipelineBusy) {
    return {
      status: 'pending',
      reason: 'Procesando antecedentes y preparando el análisis…',
    };
  }

  if (!isDashboardHydratedForAnalystRouting(params)) {
    return {
      status: 'pending',
      reason: 'Sincronizando resultados del análisis…',
    };
  }

  return {
    status: 'resolved',
    decision: resolveAnalystExperience(params),
  };
}

export function resolveAnalystExperience(params: {
  selectedUploadFormat: string | null;
  evidenceFidelity?: 'authoritative' | 'indicative' | null;
  parsedDocuments?: ParsedDocumentTableSignalSource[];
  dashboard?: BankProduct['dashboard'] | null;
}): AnalystExperienceDecision {
  if (isQualitativeUploadRail(params.selectedUploadFormat)) {
    return {
      mode: 'minimal',
      reason: 'El formato elegido es cualitativo (fotos o texto libre).',
    };
  }

  if (params.evidenceFidelity === 'indicative') {
    return {
      mode: 'minimal',
      reason: 'La evidencia es orientativa, no contable.',
    };
  }

  const signals = computeDashboardMovementSignals(params.dashboard);
  const hasDocTableSignals = parsedDocumentsHaveTableSignals(params.parsedDocuments);

  if (params.selectedUploadFormat === 'spreadsheet') {
    return {
      mode: 'full',
      reason: 'Planilla estructurada: habilitar tablas y métricas completas.',
    };
  }

  if (signals.movementCount <= 0) {
    return {
      mode: 'minimal',
      reason: 'No hay movimientos suficientes para un tablero analítico.',
    };
  }

  if (params.evidenceFidelity === 'authoritative') {
    if (hasAuthoritativeContableDepth(signals, hasDocTableSignals)) {
      return {
        mode: 'full',
        reason: 'Evidencia contable con profundidad suficiente para exploración tabular.',
      };
    }
    return {
      mode: 'minimal',
      reason: 'Evidencia contable demasiado escasa para tablero completo.',
    };
  }

  if (hasStructuredExplorationValue(signals, hasDocTableSignals)) {
    return {
      mode: 'full',
      reason: 'Estructura detectada en movimientos o documento parseado.',
    };
  }

  return {
    mode: 'minimal',
    reason: 'Resumen ejecutivo sin estructura tabular confiable.',
  };
}

export function shouldOpenFullAnalystDashboard(params: {
  selectedUploadFormat: string | null;
  evidenceFidelity?: 'authoritative' | 'indicative' | null;
  parsedDocuments?: ParsedDocumentTableSignalSource[];
  dashboard?: BankProduct['dashboard'] | null;
}): boolean {
  return resolveAnalystExperience(params).mode === 'full';
}

export function shouldUseMinimalSummaryChat(params: {
  selectedUploadFormat: string | null;
  evidenceFidelity?: 'authoritative' | 'indicative' | null;
  parsedDocuments?: ParsedDocumentTableSignalSource[];
  dashboard?: BankProduct['dashboard'] | null;
}): boolean {
  return !shouldOpenFullAnalystDashboard(params);
}
