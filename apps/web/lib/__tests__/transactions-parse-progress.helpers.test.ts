import {
  advanceParseProgressTick,
  buildParseProgressLabels,
  resolveStepState,
} from '../transacciones/progreso-parse.helpers';

describe('transactions-parse-progress.helpers', () => {
  it('advances percent while extracting', () => {
    const next = advanceParseProgressTick({
      stage: 'extracting',
      percent: 40,
      detail: 'Extrayendo',
    });
    expect(next.percent).toBe(42);
  });

  it('builds stage-specific labels', () => {
    const labels = buildParseProgressLabels({
      stage: 'extracting',
      percent: 50,
      detail: 'OCR en curso',
    });
    expect(labels.modeLabel).toContain('Extrayendo');
    expect(labels.primaryCopy).toBe('OCR en curso');
  });

  it('marks earlier steps as done', () => {
    expect(resolveStepState('reading', 'structuring')).toBe('done');
    expect(resolveStepState('structuring', 'structuring')).toBe('active');
    expect(resolveStepState('summarizing', 'structuring')).toBe('pending');
  });
});
