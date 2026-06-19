import { describe, expect, it } from 'vitest';
import {
  buildQualitativeExecutiveSummary,
  inferEvidenceKindFromSignals,
  resolveAggregateEvidenceKind,
  shouldSuppressMovementLedger,
  usesBankingMovementPipeline,
} from './documentEvidenceKind.service';
import type { EvidenceKindResult } from './documentEvidenceKind.service';

describe('documentEvidenceKind.service', () => {
  it('detects insurance from policy keywords', () => {
    const result = inferEvidenceKindFromSignals({
      text: 'Póliza de seguro de vida MetLife prima mensual $45.000 cobertura UF 500 deducible',
      productLabelHint: 'Seguros',
    });
    expect(result?.evidence_kind).toBe('insurance');
    expect(usesBankingMovementPipeline(result!.evidence_kind)).toBe(false);
    expect(shouldSuppressMovementLedger('insurance', 0.8)).toBe(true);
  });

  it('detects investment from portfolio keywords', () => {
    const result = inferEvidenceKindFromSignals({
      text: 'Fondo mutuo Bice rentabilidad 12m valor cuota $1.234 patrimonio $12.500.000',
      productLabelHint: 'Acciones / ETF',
    });
    expect(result?.evidence_kind).toBe('investment');
    expect(usesBankingMovementPipeline(result!.evidence_kind)).toBe(false);
  });

  it('detects banking cartola signals', () => {
    const result = inferEvidenceKindFromSignals({
      text: 'Movimientos de Tarjeta Nacional Copec compras -$8.480 Pago pesos tef +$186.446',
      productLabelHint: 'Tarjeta de crédito',
      documentProfile: { format_family: 'visa_signature_tc' },
    });
    expect(result?.evidence_kind).toBe('banking_movements');
    expect(usesBankingMovementPipeline(result!.evidence_kind)).toBe(true);
  });

  it('aggregates mixed uploads toward banking when any doc is banking', () => {
    const map = new Map<string, EvidenceKindResult>([
      [
        'seguro.png',
        {
          evidence_kind: 'insurance',
          confidence: 0.9,
          uses_movement_pipeline: false,
          summary_blocks: [],
          highlights: [],
          visual_evidence: '',
        },
      ],
      [
        'tc.png',
        {
          evidence_kind: 'banking_movements',
          confidence: 0.88,
          uses_movement_pipeline: true,
          summary_blocks: [],
          highlights: [],
          visual_evidence: '',
        },
      ],
    ]);
    expect(resolveAggregateEvidenceKind(map)).toBe('banking_movements');
  });

  it('builds qualitative executive summary for insurance', () => {
    const summary = buildQualitativeExecutiveSummary([
      {
        evidence_kind: 'insurance',
        confidence: 0.91,
        uses_movement_pipeline: false,
        product_label: 'Seguro de vida',
        summary_blocks: [{ title: 'Cobertura', body: 'Vida e invalidez total.' }],
        highlights: ['Prima mensual ~$45.000'],
        visual_evidence: 'captura app seguro',
      },
    ]);
    expect(summary).toContain('seguro');
    expect(summary).toContain('Cobertura');
    expect(summary).toContain('no es una cartola bancaria');
  });
});
