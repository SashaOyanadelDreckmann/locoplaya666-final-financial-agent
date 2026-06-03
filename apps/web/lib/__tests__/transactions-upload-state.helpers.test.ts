/** @jest-environment node */

import {
  applyUploadToTargetProduct,
  mergeParsedDocumentsByIdentity,
  normalizeParsedUploadDocuments,
} from '../transactions-upload-state.helpers';

describe('transactions upload state helpers', () => {
  it('normalizes parsed documents preserving canonical documentId', () => {
    const insightByName = new Map<string, unknown>([['cartola.pdf', { reliability: 0.9 }]]);
    const normalized = normalizeParsedUploadDocuments(
      [
        {
          documentId: 'doc-123',
          name: 'cartola.pdf',
          text: 'contenido',
          summary: { ok: true },
          structuredData: { rows: 3 },
        },
      ],
      insightByName,
    );

    expect(normalized).toEqual([
      {
        documentId: 'doc-123',
        name: 'cartola.pdf',
        text: 'contenido',
        summary: { ok: true },
        structuredData: { rows: 3 },
        insight: { reliability: 0.9 },
      },
    ]);
  });

  it('merges existing docs by documentId first, then by name', () => {
    const merged = mergeParsedDocumentsByIdentity(
      [
        { documentId: 'doc-1', name: 'a.pdf', text: 'old-a' },
        { name: 'b.pdf', text: 'old-b' },
      ] as any,
      [
        { documentId: 'doc-1', name: 'a-renamed.pdf', text: 'new-a' },
        { name: 'b.pdf', text: 'new-b' },
        { documentId: 'doc-3', name: 'c.pdf', text: 'new-c' },
      ] as any,
    );

    expect(merged).toEqual([
      { documentId: 'doc-1', name: 'a-renamed.pdf', text: 'new-a' },
      { name: 'b.pdf', text: 'new-b' },
      { documentId: 'doc-3', name: 'c.pdf', text: 'new-c' },
    ]);
  });

  it('applies upload only to target product', () => {
    const products = [
      { id: 'p-1', uploadedFiles: ['old-1.pdf'], parsedDocuments: [{ name: 'old-1.pdf', text: 'x' }] },
      { id: 'p-2', uploadedFiles: ['old-2.pdf'], parsedDocuments: [{ name: 'old-2.pdf', text: 'y' }] },
    ] as any;

    const result = applyUploadToTargetProduct(
      products,
      'p-2',
      [{ documentId: 'doc-new', name: 'new.pdf', text: 'new' }] as any,
      ['new.pdf'],
    );

    expect(result.targetProduct?.id).toBe('p-2');
    expect(result.products[0]).toEqual(products[0]);
    expect(result.products[1].uploadedFiles).toEqual(['old-2.pdf', 'new.pdf']);
    expect(result.products[1].parsedDocuments).toEqual([
      { name: 'old-2.pdf', text: 'y' },
      { documentId: 'doc-new', name: 'new.pdf', text: 'new' },
    ]);
  });
});
