/** @jest-environment node */

import { decodeBase64File, isSupportedDocumentFilename } from './documents';

describe('chat attachment validation helpers', () => {
  it('accepts supported chat attachment filenames', () => {
    expect(isSupportedDocumentFilename('foto.jpg')).toBe(true);
    expect(isSupportedDocumentFilename('cartola.pdf')).toBe(true);
    expect(isSupportedDocumentFilename('movs.csv')).toBe(true);
    expect(isSupportedDocumentFilename('archivo.exe')).toBe(false);
  });

  it('decodes base64 payloads for supported files', () => {
    const payload = Buffer.from('hello').toString('base64');
    const decoded = decodeBase64File(payload, 'notas.txt');
    expect(decoded.toString('utf8')).toBe('hello');
  });
});
