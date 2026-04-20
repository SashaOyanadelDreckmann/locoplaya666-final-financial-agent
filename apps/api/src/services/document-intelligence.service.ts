import path from 'path';
import { toFile } from 'openai';
import type { StoredDocumentKind, StoredDocumentSource } from '../persistence/types';
import {
  createDocumentRecord,
  getUserVectorStoreRecord,
  patchDocumentRecord,
  searchUserDocumentsLocal,
  upsertUserVectorStoreRecord,
} from '../persistence/repos';
import { parseTransactionFile } from './transactionParser.service';
import { getOpenAIClient } from './llm.service';

export type DocumentSearchHit = {
  source: 'openai_file_search' | 'local_document_store';
  documentId?: string;
  title: string;
  text: string;
  score?: number;
  fileId?: string;
};

type IngestUserDocumentInput = {
  userId: string;
  name: string;
  buffer: Buffer;
  mimeType?: string;
  source?: StoredDocumentSource;
};

const MAX_INDEX_BYTES = Number(process.env.DOCUMENT_INDEX_MAX_BYTES || 24 * 1024 * 1024);

export function detectDocumentKind(filename: string): StoredDocumentKind {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.pdf') return 'PDF';
  if (ext === '.xlsx' || ext === '.xls') return 'EXCEL';
  if (ext === '.csv') return 'CSV';
  if (['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)) return 'IMAGE';
  if (ext === '.txt' || ext === '.md') return 'TEXT';
  return 'OTHER';
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}\n...[truncado]` : text;
}

function compactWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function inferDocumentSummary(text: string, filename: string): Record<string, unknown> {
  const compact = compactWhitespace(text);
  const moneyMatches = compact.match(/(?:\$|CLP|USD|UF)?\s?-?\d{1,3}(?:[.\s]\d{3})*(?:,\d+)?/gi) ?? [];
  const dateMatches = compact.match(/\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})\b/g) ?? [];
  const lower = compact.toLowerCase();
  const signals = [
    ['deuda', /deud|cuota|mora|inter[eé]s/.test(lower)],
    ['ingresos', /sueldo|abono|dep[oó]sito|ingreso|transferencia recibida/.test(lower)],
    ['gastos', /compra|cargo|pago|retiro|comisi[oó]n|suscripci[oó]n/.test(lower)],
    ['contrato', /contrato|cl[aá]usula|firma|anexo/.test(lower)],
    ['cartola', /saldo|movimiento|cartola|cuenta corriente|tarjeta/.test(lower)],
  ]
    .filter(([, ok]) => ok)
    .map(([label]) => label);

  return {
    filename,
    detectedSignals: signals,
    amountSamples: moneyMatches.slice(0, 12),
    dateSamples: dateMatches.slice(0, 12),
    preview: compact.slice(0, 800),
    characterCount: text.length,
  };
}

function extractStructuredFinancialData(text: string): Record<string, unknown> {
  const rows = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 1000);
  const possibleTransactions = rows
    .filter((line) => /\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2}/.test(line))
    .filter((line) => /-?\d{1,3}(?:[.\s]\d{3})+(?:,\d+)?|-?\d+(?:,\d{2})/.test(line))
    .slice(0, 120);

  return {
    rowCount: rows.length,
    possibleTransactionCount: possibleTransactions.length,
    possibleTransactions,
  };
}

async function ensureUserVectorStore(userId: string): Promise<string | undefined> {
  const existing = await getUserVectorStoreRecord(userId);
  if (existing?.vectorStoreId) return existing.vectorStoreId;

  const client = getOpenAIClient();
  const vectorStore = await client.vectorStores.create({
    name: `financial-agent-user-${userId}`,
    metadata: { userId, app: 'financial-agent' },
  });
  await upsertUserVectorStoreRecord(userId, vectorStore.id);
  return vectorStore.id;
}

async function uploadToVectorStore(params: {
  userId: string;
  filename: string;
  buffer: Buffer;
  documentId: string;
  kind: StoredDocumentKind;
}): Promise<{ vectorStoreId: string; fileId?: string; status: 'INDEXED' | 'PARSED'; error?: string }> {
  if (process.env.ENABLE_OPENAI_FILE_SEARCH === 'false') {
    return { vectorStoreId: '', status: 'PARSED', error: 'OpenAI File Search disabled' };
  }
  if (params.buffer.byteLength > MAX_INDEX_BYTES) {
    return { vectorStoreId: '', status: 'PARSED', error: 'Document too large for hosted indexing' };
  }

  const vectorStoreId = await ensureUserVectorStore(params.userId);
  if (!vectorStoreId) return { vectorStoreId: '', status: 'PARSED', error: 'Vector store unavailable' };

  const file = await toFile(params.buffer, params.filename);
  const indexedFile = await (getOpenAIClient().vectorStores.files as any).uploadAndPoll(vectorStoreId, file, {
    pollIntervalMs: 1000,
  });

  if (indexedFile?.status === 'failed') {
    return {
      vectorStoreId,
      fileId: indexedFile.id,
      status: 'PARSED',
      error: indexedFile.last_error?.message ?? 'Vector indexing failed',
    };
  }

  try {
    if (indexedFile?.id) {
      await (getOpenAIClient().vectorStores.files as any).update(indexedFile.id, {
        vector_store_id: vectorStoreId,
        attributes: {
          userId: params.userId,
          documentId: params.documentId,
          kind: params.kind,
        },
      });
    }
  } catch {
    // Attribute updates are nice-to-have; search still works without them.
  }

  return {
    vectorStoreId,
    fileId: indexedFile?.id,
    status: indexedFile?.status === 'completed' ? 'INDEXED' : 'PARSED',
  };
}

export async function ingestUserDocument(input: IngestUserDocumentInput) {
  const kind = detectDocumentKind(input.name);
  const extractedText = await parseTransactionFile(input.buffer, input.name);
  const summary = inferDocumentSummary(extractedText, input.name);
  const structuredData = extractStructuredFinancialData(extractedText);

  const document = await createDocumentRecord({
    userId: input.userId,
    name: input.name,
    kind,
    source: input.source ?? 'USER_UPLOAD',
    mimeType: input.mimeType,
    sizeBytes: input.buffer.byteLength,
    textPreview: truncate(extractedText, 2500),
    extractedText,
    summary,
    structuredData,
    status: 'PARSED',
  });

  let indexed = false;
  try {
    const upload = await uploadToVectorStore({
      userId: input.userId,
      filename: input.name,
      buffer: input.buffer,
      documentId: document.id,
      kind,
    });
    indexed = upload.status === 'INDEXED';
    await patchDocumentRecord(document.id, {
      openaiFileId: upload.fileId,
      vectorStoreId: upload.vectorStoreId || undefined,
      status: upload.status,
      error: upload.error,
    });
  } catch (error) {
    await patchDocumentRecord(document.id, {
      status: 'PARSED',
      error: `Index fallback activo: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  return {
    documentId: document.id,
    name: input.name,
    text: extractedText,
    summary,
    structuredData,
    indexed,
  };
}

export async function ingestGeneratedReportDocument(params: {
  userId: string;
  title: string;
  text: string;
}) {
  const filename = `${params.title.replace(/[^a-z0-9_-]+/gi, '_').slice(0, 80) || 'informe'}.txt`;
  const buffer = Buffer.from(params.text, 'utf-8');
  return ingestUserDocument({
    userId: params.userId,
    name: filename,
    buffer,
    mimeType: 'text/plain',
    source: 'AGENT_GENERATED',
  });
}

export async function searchUserDocumentContext(
  userId: string,
  query: string,
  limit = 6,
): Promise<DocumentSearchHit[]> {
  const hits: DocumentSearchHit[] = [];
  const vectorStore = await getUserVectorStoreRecord(userId);

  if (vectorStore?.vectorStoreId && process.env.ENABLE_OPENAI_FILE_SEARCH !== 'false') {
    try {
      const page = await getOpenAIClient().vectorStores.search(vectorStore.vectorStoreId, {
        query,
        max_num_results: limit,
      } as any);
      for (const result of (page as any).data ?? []) {
        const text = Array.isArray(result.content)
          ? result.content.map((chunk: { text?: string }) => chunk.text ?? '').join('\n')
          : '';
        if (!text.trim()) continue;
        hits.push({
          source: 'openai_file_search',
          title: result.filename ?? 'Documento indexado',
          text: truncate(text, 1600),
          score: result.score,
          fileId: result.file_id,
          documentId: result.attributes?.documentId,
        });
      }
    } catch {
      // Local retrieval below keeps the agent usable if hosted search is unavailable.
    }
  }

  const local = await searchUserDocumentsLocal(userId, query, limit);
  for (const doc of local) {
    if (hits.some((hit) => hit.documentId && hit.documentId === doc.id)) continue;
    hits.push({
      source: 'local_document_store',
      documentId: doc.id,
      title: doc.name,
      text: truncate(doc.extractedText ?? doc.textPreview ?? '', 1600),
      score: doc.score,
    });
  }

  return hits.slice(0, limit);
}

export function reportSpecToSearchableText(spec: {
  title: string;
  subtitle?: string;
  sections?: Array<{ heading: string; body: string }>;
  tables?: Array<{ title: string; columns: string[]; rows: Array<Array<string | number>> }>;
}) {
  const parts = [spec.title, spec.subtitle ?? ''];
  for (const section of spec.sections ?? []) {
    parts.push(section.heading, section.body);
  }
  for (const table of spec.tables ?? []) {
    parts.push(table.title, table.columns.join(' | '));
    for (const row of table.rows ?? []) parts.push(row.join(' | '));
  }
  return parts.filter(Boolean).join('\n\n');
}
