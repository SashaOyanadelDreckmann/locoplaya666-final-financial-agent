/** @jest-environment node */

import {
  alignEvidenceUploadFormat,
  assertHomogeneousEvidenceFiles,
  classifyEvidenceFile,
  fileMatchesUploadFormat,
  getEvidenceFileAccept,
  inferUploadFormatFromEvidenceFiles,
} from '../compartido/evidence-format.helpers';

function mockFile(name: string, type = ''): File {
  return { name, type } as File;
}

describe('evidence-format.helpers', () => {
  it('classifies files by extension and mime', () => {
    expect(classifyEvidenceFile(mockFile('a.png', 'image/png'))).toBe('photos');
    expect(classifyEvidenceFile(mockFile('cartola.pdf', 'application/pdf'))).toBe('pdf');
    expect(classifyEvidenceFile(mockFile('movimientos.xlsx'))).toBe('spreadsheet');
    expect(classifyEvidenceFile(mockFile('notas.txt', 'text/plain'))).toBe('text');
    expect(classifyEvidenceFile(mockFile('clip.mp4', 'video/mp4'))).toBe('video');
    expect(classifyEvidenceFile(mockFile('payload.json', 'application/json'))).toBe('unsupported');
  });

  it('returns format-specific accept strings', () => {
    expect(getEvidenceFileAccept('photos')).toContain('image/*');
    expect(getEvidenceFileAccept('pdf')).toContain('.pdf');
    expect(getEvidenceFileAccept('spreadsheet')).toContain('.xlsx');
    expect(getEvidenceFileAccept('text')).toContain('.txt');
    expect(getEvidenceFileAccept(null)).toContain('image/*');
    expect(getEvidenceFileAccept(null)).toContain('.pdf');
  });

  it('rejects mixed batches and videos', () => {
    expect(
      assertHomogeneousEvidenceFiles([
        mockFile('a.png', 'image/png'),
        mockFile('b.pdf', 'application/pdf'),
      ]).ok,
    ).toBe(false);
    expect(assertHomogeneousEvidenceFiles([mockFile('clip.mp4', 'video/mp4')]).ok).toBe(false);
    expect(
      assertHomogeneousEvidenceFiles([
        mockFile('a.png', 'image/png'),
        mockFile('b.jpg', 'image/jpeg'),
      ]).ok,
    ).toBe(true);
  });

  it('infers upload format from homogeneous files', () => {
    expect(inferUploadFormatFromEvidenceFiles([mockFile('a.csv')])).toBe('spreadsheet');
    expect(inferUploadFormatFromEvidenceFiles([mockFile('a.png', 'image/png')])).toBe('photos');
    expect(inferUploadFormatFromEvidenceFiles([])).toBeNull();
  });

  it('matches files against selected format', () => {
    expect(fileMatchesUploadFormat(mockFile('a.png', 'image/png'), 'photos')).toBe(true);
    expect(fileMatchesUploadFormat(mockFile('a.pdf', 'application/pdf'), 'photos')).toBe(false);
  });

  it('aligns selected format to detected files when they differ', () => {
    const aligned = alignEvidenceUploadFormat({
      uploadFormat: 'photos',
      files: [mockFile('movimientos.xlsx')],
    });
    expect(aligned.ok).toBe(true);
    if (!aligned.ok) return;
    expect(aligned.effectiveFormat).toBe('spreadsheet');
    expect(aligned.sourceHint).toBe('spreadsheet');
    expect(aligned.realigned).toBe(true);
    expect(aligned.notice).toMatch(/Excel \/ CSV/i);
  });

  it('keeps aligned format when selection matches files', () => {
    const aligned = alignEvidenceUploadFormat({
      uploadFormat: 'pdf',
      files: [mockFile('cartola.pdf', 'application/pdf')],
    });
    expect(aligned.ok).toBe(true);
    if (!aligned.ok) return;
    expect(aligned.effectiveFormat).toBe('pdf');
    expect(aligned.realigned).toBe(false);
    expect(aligned.notice).toBeNull();
  });

  it('infers format when none is selected', () => {
    const aligned = alignEvidenceUploadFormat({
      uploadFormat: null,
      files: [mockFile('captura.png', 'image/png')],
    });
    expect(aligned.ok).toBe(true);
    if (!aligned.ok) return;
    expect(aligned.effectiveFormat).toBe('photos');
    expect(aligned.realigned).toBe(false);
  });
});
