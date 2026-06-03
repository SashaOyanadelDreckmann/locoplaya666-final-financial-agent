import type { BankProduct } from '@/app/agent/transactions/types';

type ParsedDocument = BankProduct['parsedDocuments'][number];

type ParsedDocInput = {
  documentId?: unknown;
  name?: unknown;
  text?: unknown;
  summary?: unknown;
  structuredData?: unknown;
};

type InsightMap = Map<string, unknown>;

function toDocumentId(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function toStringSafe(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function normalizeParsedUploadDocuments(
  incomingDocs: ParsedDocInput[],
  insightByName: InsightMap,
): ParsedDocument[] {
  return incomingDocs.map((doc) => {
    const name = toStringSafe(doc.name);
    return {
      documentId: toDocumentId(doc.documentId),
      name,
      text: toStringSafe(doc.text),
      summary: doc.summary,
      structuredData: doc.structuredData,
      insight: insightByName.get(name) as ParsedDocument['insight'],
    };
  });
}

export function mergeParsedDocumentsByIdentity(
  existingDocs: ParsedDocument[],
  incomingDocs: ParsedDocument[],
): ParsedDocument[] {
  const nextDocs = [...existingDocs];
  for (const doc of incomingDocs) {
    const existingIdx = nextDocs.findIndex((existing) => {
      if (doc.documentId && existing.documentId) return existing.documentId === doc.documentId;
      return existing.name === doc.name;
    });
    if (existingIdx >= 0) nextDocs[existingIdx] = doc;
    else nextDocs.push(doc);
  }
  return nextDocs;
}

export function applyUploadToTargetProduct(
  products: BankProduct[],
  targetProductId: string,
  normalizedIncomingDocs: ParsedDocument[],
  fileNames: string[],
): {
  products: BankProduct[];
  targetProduct: BankProduct | null;
} {
  let updatedProduct: BankProduct | null = null;
  const nextProducts = products.map((product) => {
    if (product.id !== targetProductId) return product;
    const nextFiles = Array.from(new Set([...(product.uploadedFiles ?? []), ...fileNames]));
    const nextDocs = mergeParsedDocumentsByIdentity(product.parsedDocuments ?? [], normalizedIncomingDocs);
    updatedProduct = {
      ...product,
      uploadedFiles: nextFiles,
      parsedDocuments: nextDocs,
    };
    return updatedProduct;
  });
  return { products: nextProducts, targetProduct: updatedProduct };
}
