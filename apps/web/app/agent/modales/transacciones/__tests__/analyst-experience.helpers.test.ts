/** @jest-environment node */

import {
  computeDashboardMovementSignals,
  isDashboardHydratedForAnalystRouting,
  resolveAnalystExperience,
  resolveAnalystExperienceState,
  shouldOpenFullAnalystDashboard,
  shouldUseMinimalSummaryChat,
} from '../analyst-experience.helpers';

const tableDoc = {
  structuredData: {
    parserMeta: { mode: 'csv_exact', confidence: 0.99 },
    tables: [{ headers: ['fecha'], rows: [['2024-01-01']] }],
  },
};

const visionDoc = {
  structuredData: {
    parserMeta: { mode: 'pdf_vision', confidence: 0.7 },
    tables: [],
  },
};

function buildLineMovements(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    description: `Movimiento ${index + 1}`,
    amount: 1000 + index,
    direction: 'expense' as const,
    source_kind: 'line' as const,
    confidence: 0.9,
  }));
}

function buildDashboard(movements: ReturnType<typeof buildLineMovements>) {
  return {
    evidenceFidelity: 'authoritative' as const,
    keyMetrics: {
      inflows_total: 0,
      outflows_total: movements.reduce((sum, row) => sum + row.amount, 0),
      net_flow: -movements.reduce((sum, row) => sum + row.amount, 0),
      avg_movement: movements[0]?.amount ?? 0,
      movement_count: movements.length,
      high_confidence_movement_count: movements.length,
    },
    movements,
  };
}

describe('analyst experience routing', () => {
  it('keeps photos and text on the qualitative minimal path', () => {
    const dashboard = buildDashboard(buildLineMovements(8));
    expect(
      resolveAnalystExperience({
        selectedUploadFormat: 'photos',
        evidenceFidelity: 'authoritative',
        parsedDocuments: [tableDoc],
        dashboard,
      }).mode,
    ).toBe('minimal');
    expect(
      resolveAnalystExperience({
        selectedUploadFormat: 'text',
        evidenceFidelity: 'authoritative',
        parsedDocuments: [tableDoc],
        dashboard,
      }).mode,
    ).toBe('minimal');
  });

  it('opens full dashboard for authoritative pdf text extraction with enough movements', () => {
    const dashboard = buildDashboard(buildLineMovements(5));
    const decision = resolveAnalystExperience({
      selectedUploadFormat: 'pdf',
      evidenceFidelity: 'authoritative',
      parsedDocuments: [visionDoc],
      dashboard,
    });
    expect(decision.mode).toBe('full');
    expect(decision.reason).toMatch(/profundidad suficiente/i);
    expect(shouldUseMinimalSummaryChat({
      selectedUploadFormat: 'pdf',
      evidenceFidelity: 'authoritative',
      parsedDocuments: [visionDoc],
      dashboard,
    })).toBe(false);
  });

  it('keeps sparse authoritative pdf on minimal experience', () => {
    const dashboard = buildDashboard(buildLineMovements(2));
    expect(
      resolveAnalystExperience({
        selectedUploadFormat: 'pdf',
        evidenceFidelity: 'authoritative',
        parsedDocuments: [visionDoc],
        dashboard,
      }).mode,
    ).toBe('minimal');
  });

  it('opens full dashboard for spreadsheet and table signals', () => {
    expect(
      shouldOpenFullAnalystDashboard({
        selectedUploadFormat: 'spreadsheet',
        evidenceFidelity: 'authoritative',
        parsedDocuments: [tableDoc],
        dashboard: buildDashboard(buildLineMovements(1)),
      }),
    ).toBe(true);
    expect(
      shouldOpenFullAnalystDashboard({
        selectedUploadFormat: 'pdf',
        evidenceFidelity: 'authoritative',
        parsedDocuments: [tableDoc],
        dashboard: buildDashboard(buildLineMovements(1)),
      }),
    ).toBe(true);
  });

  it('uses indicative fidelity as a hard minimal gate', () => {
    expect(
      resolveAnalystExperience({
        selectedUploadFormat: 'spreadsheet',
        evidenceFidelity: 'indicative',
        parsedDocuments: [tableDoc],
        dashboard: buildDashboard(buildLineMovements(12)),
      }).mode,
    ).toBe('minimal');
  });

  it('computes movement signals from dashboard rows', () => {
    const signals = computeDashboardMovementSignals({
      keyMetrics: {
        inflows_total: 0,
        outflows_total: 3,
        net_flow: -3,
        avg_movement: 1,
        movement_count: 4,
        table_rows_verified: 2,
      },
      movements: [
        { description: 'A', amount: 1, direction: 'expense', source_kind: 'table' },
        { description: 'B', amount: 2, direction: 'expense', source_kind: 'line', confidence: 0.9 },
      ],
    });
    expect(signals.movementCount).toBe(4);
    expect(signals.tableRowsVerified).toBe(2);
    expect(signals.tableMovementRatio).toBe(0.25);
    expect(signals.highConfidenceMovementCount).toBeGreaterThanOrEqual(1);
  });

  it('opens full dashboard for unpinned evidence with parsed movements', () => {
    expect(
      shouldOpenFullAnalystDashboard({
        selectedUploadFormat: null,
        evidenceFidelity: null,
        parsedDocuments: [visionDoc],
        dashboard: buildDashboard(buildLineMovements(3)),
      }),
    ).toBe(true);
  });

  it('defers analyst routing while pipeline is busy or dashboard is not hydrated', () => {
    expect(
      resolveAnalystExperienceState({
        selectedUploadFormat: 'pdf',
        evidenceFidelity: 'authoritative',
        parsedDocuments: [visionDoc],
        dashboard: buildDashboard(buildLineMovements(5)),
        isPipelineBusy: true,
      }),
    ).toEqual({
      status: 'pending',
      reason: 'Procesando antecedentes y preparando el análisis…',
    });

    expect(
      isDashboardHydratedForAnalystRouting({
        parsedDocuments: [visionDoc],
        dashboard: null,
      }),
    ).toBe(false);

    expect(
      resolveAnalystExperienceState({
        selectedUploadFormat: 'pdf',
        evidenceFidelity: 'authoritative',
        parsedDocuments: [visionDoc],
        dashboard: null,
      }).status,
    ).toBe('pending');
  });
});
