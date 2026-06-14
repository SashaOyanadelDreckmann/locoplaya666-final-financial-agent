/** @jest-environment node */

import {
  resolveEvidenceFidelity,
  buildIndicativeExecutiveSummary,
} from '@financial-agent/shared';
import {
  inferEvidenceSourceFromFiles,
  isIndicativeEvidenceProduct,
  readProductEvidenceFidelity,
  resolveUploadEvidenceSourceHint,
} from '../compartido/evidence-fidelity.helpers';

describe('evidence fidelity helpers', () => {
  it('marks photos and loose text as indicative', () => {
    expect(resolveEvidenceFidelity({ sourceHint: 'photos' })).toBe('indicative');
    expect(resolveEvidenceFidelity({ sourceHint: 'text', looseTextEvidence: true })).toBe('indicative');
    expect(resolveEvidenceFidelity({ fileNames: ['cartola.png'] })).toBe('indicative');
  });

  it('keeps structured spreadsheets authoritative when parser is exact', () => {
    expect(
      resolveEvidenceFidelity({
        sourceHint: 'spreadsheet',
        parserModes: ['xlsx_exact'],
        parserConfidences: [0.95],
        tableMovementRatio: 0.9,
        movementCount: 12,
      }),
    ).toBe('authoritative');
  });

  it('infers upload hints from files and assistant format', () => {
    expect(
      inferEvidenceSourceFromFiles([{ name: 'a.png', type: 'image/png' } as File]),
    ).toBe('photos');
    expect(
      resolveUploadEvidenceSourceHint({
        uploadFormat: 'spreadsheet',
        files: [{ name: 'movimientos.xlsx', type: 'application/vnd.ms-excel' } as File],
      }),
    ).toBe('spreadsheet');
    expect(resolveUploadEvidenceSourceHint({ looseTextEvidence: true })).toBe('text');
  });

  it('prefers detected file format over mismatched user selection', () => {
    expect(
      resolveUploadEvidenceSourceHint({
        uploadFormat: 'photos',
        files: [{ name: 'movimientos.xlsx', type: 'application/vnd.ms-excel' } as File],
      }),
    ).toBe('spreadsheet');
    expect(
      resolveUploadEvidenceSourceHint({
        uploadFormat: 'pdf',
        files: [{ name: 'captura.png', type: 'image/png' } as File],
      }),
    ).toBe('photos');
  });

  it('reads indicative fidelity from dashboard and builds qualitative summary', () => {
    const product = {
      dashboard: {
        evidenceFidelity: 'indicative' as const,
        keyMetrics: {
          inflows_total: 0,
          outflows_total: 120000,
          net_flow: -120000,
          avg_movement: 60000,
          movement_count: 2,
        },
        topCategories: [{ name: 'Supermercado', amount: 120000 }],
        topMerchants: [{ merchant: 'Jumbo', amount: 120000, category: 'Supermercado', tx_count: 1 }],
        topExpenses: [{ label: 'Jumbo', amount: 120000 }],
      },
      parsedDocuments: [],
    };
    expect(readProductEvidenceFidelity(product)).toBe('indicative');
    expect(isIndicativeEvidenceProduct(product)).toBe(true);
    const summary = buildIndicativeExecutiveSummary({
      productType: 'credit_card',
      movementCount: 2,
      topExpenses: product.dashboard.topExpenses,
      topCategories: product.dashboard.topCategories,
      topMerchants: product.dashboard.topMerchants,
      formatAmount: (value) => `$${value}`,
    });
    expect(summary).toMatch(/Lectura orientativa/i);
    expect(summary).not.toMatch(/flujo neto/i);
  });
});
