/** @jest-environment node */

import {
  asksForSummaryRegeneration,
  inferUploadFormatFromMessage,
  isUploadAssistanceMessage,
  shouldBlockEvidenceStepAnalysisChat,
  wantsTextEvidenceUpload,
} from '../tx-assistant.helpers';

describe('tx assistant helpers', () => {
  it('infers upload format from user message', () => {
    expect(inferUploadFormatFromMessage('tengo un pdf de la cartola')).toBe('pdf');
    expect(inferUploadFormatFromMessage('te mando fotos')).toBe('photos');
    expect(inferUploadFormatFromMessage('hola')).toBeNull();
  });

  it('detects summary regeneration intent', () => {
    expect(asksForSummaryRegeneration('corrige el resumen', true)).toBe(true);
    expect(asksForSummaryRegeneration('gracias', true)).toBe(false);
    expect(asksForSummaryRegeneration('regenera', false)).toBe(false);
  });

  it('detects text-only evidence upload intent', () => {
    expect(
      wantsTextEvidenceUpload({
        analysisAlreadyDone: false,
        uploadFormat: 'text',
        text: 'movimiento 1000',
        hasAttachedFiles: false,
      }),
    ).toBe(true);
    expect(
      wantsTextEvidenceUpload({
        analysisAlreadyDone: false,
        uploadFormat: 'pdf',
        text: 'movimiento 1000',
        hasAttachedFiles: false,
      }),
    ).toBe(false);
  });

  it('allows upload assistance and blocks analytical questions on evidence step', () => {
    expect(isUploadAssistanceMessage('¿Cómo subo un PDF?')).toBe(true);
    expect(
      shouldBlockEvidenceStepAnalysisChat({
        txWizardStep: 'upload',
        analysisAlreadyDone: false,
        text: '¿Cuánto gasté en PedidosYa?',
        hasAttachedFiles: false,
        shouldUploadTextEvidence: false,
      }),
    ).toBe(true);
    expect(
      shouldBlockEvidenceStepAnalysisChat({
        txWizardStep: 'upload',
        analysisAlreadyDone: true,
        text: '¿Cuánto gasté?',
        hasAttachedFiles: false,
        shouldUploadTextEvidence: false,
      }),
    ).toBe(true);
    expect(
      shouldBlockEvidenceStepAnalysisChat({
        txWizardStep: 'dashboard',
        analysisAlreadyDone: true,
        text: '¿Cuánto gasté?',
        hasAttachedFiles: false,
        shouldUploadTextEvidence: false,
      }),
    ).toBe(false);
  });
});
