/** @jest-environment node */

import {
  asksForSummaryRegeneration,
  inferUploadFormatFromMessage,
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
});
