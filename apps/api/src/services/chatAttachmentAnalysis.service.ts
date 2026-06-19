/**
 * Análisis inteligente de adjuntos del chat principal (independiente del modal de transacciones).
 * Combina extracción local + visión general cuando hace falta, con enfoque financiero adaptativo.
 */

import path from 'path';
import PDFParse from 'pdf-parse';
import { createDocumentRecord } from '../persistencia/repos';
import { detectDocumentKind } from './document-intelligence.service';
import {
  isPdfExtractionWeak,
  parseCsvBufferDetailed,
  parseExcelBufferDetailed,
  type ParsedTable,
} from './transactionParser.service';
import { completeStructuredWithSchema } from './llm.service';

export const CHAT_ATTACH_MAX_FILES = 5;
export const CHAT_ATTACH_MAX_TOTAL_BYTES = 35 * 1024 * 1024;

export type ChatAttachmentContentKind =
  | 'financial_statement'
  | 'receipt_invoice'
  | 'contract_legal'
  | 'personal_photo'
  | 'general_image'
  | 'text_document'
  | 'spreadsheet_data'
  | 'mixed'
  | 'unknown';

export type ChatAttachmentFinanceRelevance = 'high' | 'medium' | 'low' | 'none';

export type ChatAttachmentAmount = {
  label: string;
  value: number;
  currency?: string;
  context?: string;
};

export type ChatAttachmentCalculation = {
  label: string;
  expression: string;
  result: number;
  note?: string;
};

export type ChatAttachmentAnalysisItem = {
  documentId?: string;
  name: string;
  format: string;
  contentKind: ChatAttachmentContentKind;
  relevanceToFinance: ChatAttachmentFinanceRelevance;
  description: string;
  extractedText: string;
  keyFindings: string[];
  amounts: ChatAttachmentAmount[];
  dates: string[];
  entities: string[];
  calculations: ChatAttachmentCalculation[];
  observations: string[];
  limitations: string[];
  confidence: number;
};

type DecodedAttachmentFile = {
  name: string;
  buffer: Buffer;
  mimeType?: string;
};

type VisionAnalysisPayload = {
  content_kind: ChatAttachmentContentKind;
  relevance_to_finance: ChatAttachmentFinanceRelevance;
  description: string;
  extracted_text: string;
  key_findings: string[];
  amounts: ChatAttachmentAmount[];
  dates: string[];
  entities: string[];
  calculations: ChatAttachmentCalculation[];
  observations: string[];
  limitations: string[];
  confidence: number;
};

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

const CHAT_ATTACH_VISION_MODEL =
  process.env.CHAT_ATTACH_VISION_MODEL?.trim() || process.env.TRANSACTIONS_VISION_MODEL?.trim() || 'gpt-4.1-mini';
const CHAT_ATTACH_TEXT_MODEL =
  process.env.CHAT_ATTACH_TEXT_MODEL?.trim() || CHAT_ATTACH_VISION_MODEL;

const VISION_ANALYSIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    content_kind: {
      type: 'string',
      enum: [
        'financial_statement',
        'receipt_invoice',
        'contract_legal',
        'personal_photo',
        'general_image',
        'text_document',
        'spreadsheet_data',
        'mixed',
        'unknown',
      ],
    },
    relevance_to_finance: {
      type: 'string',
      enum: ['high', 'medium', 'low', 'none'],
    },
    description: { type: 'string' },
    extracted_text: { type: 'string' },
    key_findings: { type: 'array', items: { type: 'string' } },
    amounts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          label: { type: 'string' },
          value: { type: 'number' },
          currency: { type: 'string' },
          context: { type: 'string' },
        },
        required: ['label', 'value'],
      },
    },
    dates: { type: 'array', items: { type: 'string' } },
    entities: { type: 'array', items: { type: 'string' } },
    calculations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          label: { type: 'string' },
          expression: { type: 'string' },
          result: { type: 'number' },
          note: { type: 'string' },
        },
        required: ['label', 'expression', 'result'],
      },
    },
    observations: { type: 'array', items: { type: 'string' } },
    limitations: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'number' },
  },
  required: [
    'content_kind',
    'relevance_to_finance',
    'description',
    'extracted_text',
    'key_findings',
    'amounts',
    'dates',
    'entities',
    'calculations',
    'observations',
    'limitations',
    'confidence',
  ],
} as const;

const TEXT_ANALYSIS_SCHEMA = VISION_ANALYSIS_SCHEMA;

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}\n...[truncado]` : text;
}

function normalizeConfidence(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0.5;
  return Math.max(0, Math.min(1, num));
}

function inferFormat(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return ext || 'unknown';
}

function isImageFilename(name: string): boolean {
  const ext = path.extname(name).toLowerCase();
  return ext in IMAGE_MIME_BY_EXT;
}

function serializeTables(tables: ParsedTable[]): string {
  return tables
    .slice(0, 6)
    .map((table) => {
      const headers = table.headers.join(' | ');
      const rows = table.rows
        .slice(0, 40)
        .map((row) => row.join(' | '))
        .join('\n');
      return `[Tabla: ${table.name}]\n${headers}\n${rows}`;
    })
    .join('\n\n');
}

async function analyzeWithVision(params: {
  filename: string;
  buffer: Buffer;
  mimeType?: string;
  hint?: string;
}): Promise<VisionAnalysisPayload> {
  const ext = path.extname(params.filename).toLowerCase();
  const mime = params.mimeType || IMAGE_MIME_BY_EXT[ext] || 'application/octet-stream';
  const isPdf = ext === '.pdf';

  const contents: Array<
    | { type: 'input_text'; text: string }
    | { type: 'input_image'; image_url: string; detail: 'auto' | 'high' | 'low' }
    | { type: 'input_file'; file_data: string; filename: string }
  > = [
    {
      type: 'input_text',
      text: [
        `Archivo: ${params.filename}`,
        params.hint ? `Contexto de extracción previa: ${params.hint}` : '',
        'Analiza el archivo con honestidad. Si es una foto personal, paisaje u objeto sin datos financieros, descríbelo y marca relevance_to_finance=none.',
        'Si hay montos, fechas, bancos o comercios visibles, extráelos y calcula totales/netos cuando sea razonable.',
        'No inventes movimientos ni montos que no estén visibles.',
      ]
        .filter(Boolean)
        .join('\n'),
    },
    isPdf
      ? {
          type: 'input_file',
          file_data: params.buffer.toString('base64'),
          filename: params.filename,
        }
      : {
          type: 'input_image',
          image_url: `data:${mime};base64,${params.buffer.toString('base64')}`,
          detail: 'auto',
        },
  ];

  return completeStructuredWithSchema<VisionAnalysisPayload>({
    name: 'chat_attachment_vision_analysis',
    description: 'Análisis general de adjuntos del chat principal con enfoque financiero adaptativo.',
    model: CHAT_ATTACH_VISION_MODEL,
    temperature: 0,
    maxOutputTokens: 2800,
    instructions:
      'Eres un analista financiero con visión multimodal. Primero describe fielmente qué contiene el archivo. ' +
      'Clasifica si es evidencia financiera, documento general o imagen no financiera. ' +
      'Extrae todo texto legible, montos, fechas y entidades visibles. ' +
      'Si no hay datos financieros, dilo explícitamente y no fuerces análisis patrimonial. ' +
      'Incluye calculations solo cuando los números visibles permitan sumar/restar con certeza razonable. ' +
      'Responde en español dentro del JSON.',
    input: [{ role: 'user', content: contents }],
    schema: VISION_ANALYSIS_SCHEMA,
  });
}

async function analyzeExtractedText(params: {
  filename: string;
  extractedText: string;
  tableText?: string;
}): Promise<VisionAnalysisPayload> {
  const payload = truncate(
    [params.extractedText, params.tableText].filter(Boolean).join('\n\n'),
    12000,
  );

  return completeStructuredWithSchema<VisionAnalysisPayload>({
    name: 'chat_attachment_text_analysis',
    description: 'Análisis estructurado de texto/tablas extraídas localmente para adjuntos del chat.',
    model: CHAT_ATTACH_TEXT_MODEL,
    temperature: 0,
    maxOutputTokens: 2400,
    instructions:
      'Analiza el contenido extraído de un archivo adjunto al chat financiero. ' +
      'Describe qué es, clasifica relevancia financiera, resume hallazgos y extrae montos/fechas/entidades visibles. ' +
      'Si el contenido no es financiero, marca relevance_to_finance=none y explícalo. ' +
      'Agrega calculations cuando los números lo permitan sin inventar. Responde en español dentro del JSON.',
    input: [
      {
        role: 'user',
        content: JSON.stringify({
          filename: params.filename,
          extracted_content: payload,
        }),
      },
    ],
    schema: TEXT_ANALYSIS_SCHEMA,
  });
}

function mapAnalysisPayload(
  filename: string,
  payload: VisionAnalysisPayload,
): Omit<ChatAttachmentAnalysisItem, 'documentId'> {
  return {
    name: filename,
    format: inferFormat(filename),
    contentKind: payload.content_kind ?? 'unknown',
    relevanceToFinance: payload.relevance_to_finance ?? 'none',
    description: String(payload.description ?? '').trim() || 'Sin descripción disponible.',
    extractedText: String(payload.extracted_text ?? '').trim(),
    keyFindings: Array.isArray(payload.key_findings) ? payload.key_findings.slice(0, 8) : [],
    amounts: Array.isArray(payload.amounts) ? payload.amounts.slice(0, 24) : [],
    dates: Array.isArray(payload.dates) ? payload.dates.slice(0, 16) : [],
    entities: Array.isArray(payload.entities) ? payload.entities.slice(0, 16) : [],
    calculations: Array.isArray(payload.calculations) ? payload.calculations.slice(0, 12) : [],
    observations: Array.isArray(payload.observations) ? payload.observations.slice(0, 8) : [],
    limitations: Array.isArray(payload.limitations) ? payload.limitations.slice(0, 6) : [],
    confidence: normalizeConfidence(payload.confidence),
  };
}

async function extractLocalPdfText(buffer: Buffer, filename: string): Promise<{
  text: string;
  tables: ParsedTable[];
  confidence: number;
}> {
  let parser: InstanceType<typeof PDFParse> | null = null;
  try {
    parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    const raw = String(result?.text ?? '').replace(/\s+/g, ' ').trim();
    await parser.destroy();
    if (!raw) return { text: '', tables: [], confidence: 0.1 };
    const text = `--- PDF: ${filename} ---\n${raw}\n--- Fin ---`;
    return { text, tables: [], confidence: raw.length > 180 ? 0.78 : 0.25 };
  } catch {
    if (parser) {
      try {
        await parser.destroy();
      } catch {
        // ignore cleanup errors
      }
    }
    return { text: '', tables: [], confidence: 0.05 };
  }
}

async function extractLocalText(file: DecodedAttachmentFile): Promise<{
  text: string;
  tables: ParsedTable[];
  confidence: number;
}> {
  const ext = path.extname(file.name).toLowerCase();

  if (isImageFilename(file.name)) {
    return { text: '', tables: [], confidence: 0 };
  }

  if (ext === '.pdf') {
    return extractLocalPdfText(file.buffer, file.name);
  }

  if (ext === '.xls' || ext === '.xlsx') {
    const parsed = await parseExcelBufferDetailed(file.buffer, file.name);
    return {
      text: parsed.text,
      tables: parsed.tables,
      confidence: Number(parsed.parserMeta?.confidence ?? 0.7),
    };
  }

  if (
    ext === '.csv' ||
    ext === '.tsv' ||
    ext === '.txt' ||
    ext === '.md' ||
    ext === '.json' ||
    ext === '.xml' ||
    ext === '.yaml' ||
    ext === '.yml' ||
    ext === '.log'
  ) {
    const parsed = await parseCsvBufferDetailed(file.buffer, file.name);
    return {
      text: parsed.text,
      tables: parsed.tables,
      confidence: Number(parsed.parserMeta?.confidence ?? 0.6),
    };
  }

  return { text: '', tables: [], confidence: 0 };
}

async function analyzeSingleAttachment(
  file: DecodedAttachmentFile,
): Promise<Omit<ChatAttachmentAnalysisItem, 'documentId'>> {
  const local = await extractLocalText(file);
  const tableText = serializeTables(local.tables);
  const compactText = local.text.replace(/\s+/g, ' ').trim();
  const needsVision =
    isImageFilename(file.name) ||
    (path.extname(file.name).toLowerCase() === '.pdf' &&
      (isPdfExtractionWeak(local.text, local.tables) || compactText.length < 40));

  let payload: VisionAnalysisPayload;

  if (needsVision) {
    payload = await analyzeWithVision({
      filename: file.name,
      buffer: file.buffer,
      mimeType: file.mimeType,
      hint: compactText ? truncate(compactText, 1200) : undefined,
    });
  } else {
    payload = await analyzeExtractedText({
      filename: file.name,
      extractedText: local.text,
      tableText,
    });
  }

  const mapped = mapAnalysisPayload(file.name, payload);

  if (!mapped.extractedText && compactText) {
    mapped.extractedText = truncate(local.text, 4000);
  } else if (!mapped.extractedText && tableText) {
    mapped.extractedText = truncate(tableText, 4000);
  }

  return mapped;
}

async function persistChatAttachment(
  userId: string,
  file: DecodedAttachmentFile,
  analysis: Omit<ChatAttachmentAnalysisItem, 'documentId'>,
): Promise<string | undefined> {
  const kind = detectDocumentKind(file.name);
  const extractedText = analysis.extractedText || analysis.description;
  const summary = {
    contentKind: analysis.contentKind,
    relevanceToFinance: analysis.relevanceToFinance,
    description: analysis.description,
    keyFindings: analysis.keyFindings,
    confidence: analysis.confidence,
  };

  const document = await createDocumentRecord({
    userId,
    name: file.name,
    kind,
    source: 'USER_UPLOAD',
    mimeType: file.mimeType,
    sizeBytes: file.buffer.byteLength,
    textPreview: truncate(extractedText, 2500),
    extractedText: truncate(extractedText, 24000),
    summary,
    structuredData: {
      chatAttachment: true,
      contentKind: analysis.contentKind,
      relevanceToFinance: analysis.relevanceToFinance,
      amounts: analysis.amounts,
      dates: analysis.dates,
      entities: analysis.entities,
      calculations: analysis.calculations,
      observations: analysis.observations,
      limitations: analysis.limitations,
    },
    status: 'PARSED',
  });

  return document.id;
}

export async function analyzeChatAttachments(params: {
  userId: string;
  files: DecodedAttachmentFile[];
}): Promise<{ attachments: ChatAttachmentAnalysisItem[] }> {
  const attachments: ChatAttachmentAnalysisItem[] = [];

  for (const file of params.files) {
    const analysis = await analyzeSingleAttachment(file);
    let documentId: string | undefined;
    try {
      documentId = await persistChatAttachment(params.userId, file, analysis);
    } catch {
      documentId = undefined;
    }
    attachments.push({ ...analysis, documentId });
  }

  return { attachments };
}
