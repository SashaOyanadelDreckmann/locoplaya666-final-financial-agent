import crypto from 'crypto';
import type {
  StoredDocumentKind,
  StoredDocumentSource,
  StoredDocumentStatus,
  StoredUserDocument,
  StoredUserVectorStore,
} from '../types';
import { getPersistenceMode, getPrismaClient, memoryStore } from '../provider';

type CreateDocumentRecordInput = {
  userId: string;
  name: string;
  kind: StoredDocumentKind;
  source?: StoredDocumentSource;
  mimeType?: string;
  sizeBytes?: number;
  textPreview?: string;
  extractedText?: string;
  summary?: unknown;
  structuredData?: unknown;
  openaiFileId?: string;
  vectorStoreId?: string;
  status?: StoredDocumentStatus;
  error?: string;
};

type PatchDocumentRecordInput = Partial<
  Pick<
    StoredUserDocument,
    | 'textPreview'
    | 'extractedText'
    | 'summary'
    | 'structuredData'
    | 'openaiFileId'
    | 'vectorStoreId'
    | 'status'
    | 'error'
  >
>;

function nowIso(): string {
  return new Date().toISOString();
}

function toStoredDocument(record: Record<string, unknown>): StoredUserDocument {
  return {
    id: String(record.id),
    userId: String(record.userId),
    name: String(record.name),
    kind: String(record.kind) as StoredDocumentKind,
    source: String(record.source) as StoredDocumentSource,
    mimeType: (record.mimeType ?? undefined) as string | undefined,
    sizeBytes: record.sizeBytes == null ? undefined : Number(record.sizeBytes),
    textPreview: (record.textPreview ?? undefined) as string | undefined,
    extractedText: (record.extractedText ?? undefined) as string | undefined,
    summary: record.summary ?? undefined,
    structuredData: record.structuredData ?? undefined,
    openaiFileId: (record.openaiFileId ?? undefined) as string | undefined,
    vectorStoreId: (record.vectorStoreId ?? undefined) as string | undefined,
    status: String(record.status) as StoredDocumentStatus,
    error: (record.error ?? undefined) as string | undefined,
    createdAt: record.createdAt ? new Date(record.createdAt as string | Date).toISOString() : nowIso(),
    updatedAt: record.updatedAt ? new Date(record.updatedAt as string | Date).toISOString() : nowIso(),
  };
}

function toStoredVectorStore(record: Record<string, unknown>): StoredUserVectorStore {
  return {
    userId: String(record.userId),
    vectorStoreId: String(record.vectorStoreId),
    createdAt: record.createdAt ? new Date(record.createdAt as string | Date).toISOString() : nowIso(),
    updatedAt: record.updatedAt ? new Date(record.updatedAt as string | Date).toISOString() : nowIso(),
  };
}

export async function createDocumentRecord(input: CreateDocumentRecordInput): Promise<StoredUserDocument> {
  const timestamp = nowIso();
  const candidate: StoredUserDocument = {
    id: `doc_${crypto.randomUUID()}`,
    userId: input.userId,
    name: input.name,
    kind: input.kind,
    source: input.source ?? 'USER_UPLOAD',
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    textPreview: input.textPreview,
    extractedText: input.extractedText,
    summary: input.summary,
    structuredData: input.structuredData,
    openaiFileId: input.openaiFileId,
    vectorStoreId: input.vectorStoreId,
    status: input.status ?? 'PARSED',
    error: input.error,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  if (getPersistenceMode() === 'memory') {
    memoryStore.documents.set(candidate.id, candidate);
    return candidate;
  }

  const prisma = await getPrismaClient();
  const created = await (prisma as any).userDocument.create({
    data: {
      ...candidate,
      createdAt: new Date(candidate.createdAt),
      updatedAt: new Date(candidate.updatedAt),
    },
  });
  return toStoredDocument(created);
}

export async function patchDocumentRecord(id: string, patch: PatchDocumentRecordInput): Promise<StoredUserDocument | null> {
  if (getPersistenceMode() === 'memory') {
    const current = memoryStore.documents.get(id);
    if (!current) return null;
    const updated = { ...current, ...patch, updatedAt: nowIso() };
    memoryStore.documents.set(id, updated);
    return updated;
  }

  const prisma = await getPrismaClient();
  const updated = await (prisma as any).userDocument
    .update({
      where: { id },
      data: patch,
    })
    .catch((error: unknown) => {
      if ((error as { code?: string })?.code === 'P2025') return null;
      throw error;
    });
  return updated ? toStoredDocument(updated) : null;
}

export async function listUserDocuments(userId: string, limit = 20): Promise<StoredUserDocument[]> {
  if (getPersistenceMode() === 'memory') {
    return Array.from(memoryStore.documents.values())
      .filter((doc) => doc.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  const prisma = await getPrismaClient();
  const records = await (prisma as any).userDocument.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return records.map(toStoredDocument);
}

export async function getUserVectorStoreRecord(userId: string): Promise<StoredUserVectorStore | null> {
  if (getPersistenceMode() === 'memory') {
    return memoryStore.vectorStores.get(userId) ?? null;
  }

  const prisma = await getPrismaClient();
  const record = await (prisma as any).userVectorStore.findUnique({ where: { userId } });
  return record ? toStoredVectorStore(record) : null;
}

export async function upsertUserVectorStoreRecord(
  userId: string,
  vectorStoreId: string,
): Promise<StoredUserVectorStore> {
  const timestamp = nowIso();

  if (getPersistenceMode() === 'memory') {
    const current = memoryStore.vectorStores.get(userId);
    const updated: StoredUserVectorStore = {
      userId,
      vectorStoreId,
      createdAt: current?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    memoryStore.vectorStores.set(userId, updated);
    return updated;
  }

  const prisma = await getPrismaClient();
  const record = await (prisma as any).userVectorStore.upsert({
    where: { userId },
    create: { userId, vectorStoreId },
    update: { vectorStoreId },
  });
  return toStoredVectorStore(record);
}

export async function searchUserDocumentsLocal(
  userId: string,
  query: string,
  limit = 5,
): Promise<Array<StoredUserDocument & { score: number }>> {
  const docs = await listUserDocuments(userId, 80);
  const terms = query
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/i)
    .filter((term) => term.length >= 3)
    .slice(0, 16);

  if (terms.length === 0) return docs.slice(0, limit).map((doc) => ({ ...doc, score: 0.1 }));

  return docs
    .map((doc) => {
      const haystack = `${doc.name}\n${doc.textPreview ?? ''}\n${doc.extractedText ?? ''}`
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
      return { ...doc, score };
    })
    .filter((doc) => doc.score > 0)
    .sort((a, b) => b.score - a.score || b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}
