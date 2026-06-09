/** @jest-environment node */

import { shouldSurfaceTxFeedback } from '../tx-feedback.helpers';

describe('tx-feedback.helpers', () => {
  it('hides errors while evidence is loading or assistant is busy', () => {
    expect(
      shouldSurfaceTxFeedback({
        message: 'Falló el parseo',
        documentsLoading: true,
        txAssistantLoading: false,
        kind: 'error',
      }),
    ).toBe(false);
    expect(
      shouldSurfaceTxFeedback({
        message: 'Falló el resumen',
        documentsLoading: false,
        txAssistantLoading: true,
        kind: 'error',
      }),
    ).toBe(false);
  });

  it('shows notices only when upload pipeline is idle', () => {
    expect(
      shouldSurfaceTxFeedback({
        message: 'Detectamos Excel / CSV en tus archivos.',
        documentsLoading: false,
        txAssistantLoading: true,
        kind: 'notice',
      }),
    ).toBe(true);
    expect(
      shouldSurfaceTxFeedback({
        message: 'Detectamos Excel / CSV en tus archivos.',
        documentsLoading: true,
        txAssistantLoading: false,
        kind: 'notice',
      }),
    ).toBe(false);
  });
});
