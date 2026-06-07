/**
 * Extrae texto y tablas de cartolas PDF, Excel, CSV e imágenes.
 * Prioriza extracción local exacta y deja el fallback de visión sólo para imágenes.
 */

import fs from 'fs';
import os from 'os';
import { spawnSync } from 'child_process';
import path from 'path';
import PDFParse from 'pdf-parse';
import ffmpegStatic from 'ffmpeg-static';
import XLSX from 'xlsx';
import { completeStructuredWithSchema } from './llm.service';

const DATA_ROOT = path.join(process.cwd(), 'data', 'transactions');
const IMAGE_MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.webm', '.m4v', '.avi']);
const MAX_VIDEO_FRAMES = 16;
const VISION_PRIMARY_MODEL = process.env.TRANSACTIONS_VISION_MODEL?.trim() || 'gpt-5.4-nano';
const VISION_FALLBACK_MODEL = process.env.TRANSACTIONS_VISION_FALLBACK_MODEL?.trim() || 'gpt-5.4-mini';
const VISION_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    text: { type: 'string' },
    tables: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          headers: { type: 'array', items: { type: 'string' } },
          rows: {
            type: 'array',
            items: { type: 'array', items: { type: 'string' } },
          },
        },
        required: ['name', 'headers', 'rows'],
      },
    },
  },
  required: ['summary', 'text', 'tables'],
} as const;

type VisionExtractionOutput = {
  summary?: string;
  text?: string;
  tables?: Array<{
    name?: string;
    headers?: string[];
    rows?: string[][];
  }>;
};

function visionImageDetail(): 'auto' | 'high' {
  return process.env.TRANSACTIONS_VISION_DETAIL === 'high' ? 'high' : 'auto';
}

function resolveFfmpegBinary(): string | null {
  const binary = typeof ffmpegStatic === 'string' ? ffmpegStatic.trim() : '';
  if (!binary) return null;
  try {
    fs.accessSync(binary, fs.constants.X_OK);
    return binary;
  } catch {
    return null;
  }
}

function parseVideoDurationSeconds(stderr: string): number | null {
  const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/i);
  if (!match) return null;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  const total = hours * 3600 + minutes * 60 + seconds;
  return Number.isFinite(total) && total > 0 ? total : null;
}

function resolveVideoFrameRate(durationSeconds: number | null): number {
  if (!durationSeconds || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0.5;
  // 1 frame every 2.5 s covers typical bank-app scroll speed (new screen every ~2-3 s).
  const targetFrames = Math.min(MAX_VIDEO_FRAMES, Math.max(4, Math.ceil(durationSeconds / 2.5)));
  const rate = targetFrames / durationSeconds;
  return Math.max(0.12, Math.min(2, Number(rate.toFixed(4))));
}

function cleanupTempDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {}
}

function normalizeVisionTable(
  table: { name?: string; headers?: string[]; rows?: string[][] },
  index: number,
  source: ParsedTable['source'],
): ParsedTable | null {
  const headers = Array.isArray(table.headers)
    ? table.headers.map((cell) => normalizeText(cell)).filter((cell) => cell.length > 0)
    : [];
  const rows = Array.isArray(table.rows)
    ? table.rows
        .map((row) => (Array.isArray(row) ? row.map((cell) => normalizeText(cell)) : []))
        .filter((row) => row.some((cell) => cell.length > 0))
    : [];
  if (headers.length === 0 && rows.length === 0) return null;
  const width = Math.max(headers.length, rows.reduce((max, row) => Math.max(max, row.length), 0));
  const safeHeaders = headers.length > 0 ? Array.from({ length: width }, (_, idx) => headers[idx] ?? `col_${idx + 1}`) : makeGenericHeaders(width);
  return {
    name: normalizeText(table.name ?? '') || `Tabla ${index + 1}`,
    headers: safeHeaders,
    rows,
    source,
  };
}

function normalizeVisionTables(
  tables: VisionExtractionOutput['tables'],
  source: ParsedTable['source'],
): ParsedTable[] {
  return Array.isArray(tables)
    ? tables
        .map((table, index) => normalizeVisionTable(table ?? {}, index, source))
        .filter((table): table is ParsedTable => Boolean(table))
    : [];
}

function isSparseVisionResult(result: VisionExtractionOutput): boolean {
  const textBody = normalizeText(result.text || result.summary || '');
  const tables = Array.isArray(result.tables) ? result.tables : [];
  const hasUsefulTable = tables.some((table) => Array.isArray(table.rows) && table.rows.length >= 2);
  return !hasUsefulTable && textBody.length < 160;
}

function buildVisionArtifact(
  source: string,
  result: VisionExtractionOutput,
  sourceType: ParsedTable['source'],
  confidence: number,
  meta: Record<string, unknown> = {},
): ParsedTransactionArtifact {
  const tables = normalizeVisionTables(result.tables, sourceType);
  const textBody = normalizeText(result.text || result.summary || '');
  const text = textBody
    ? `--- Documento ${sourceType === 'image' ? 'Imagen' : sourceType === 'pdf' ? 'PDF' : 'Video'}: ${source} ---\n${textBody}\n--- Fin ---`
    : tables.length > 0
      ? serializeTablesToText(source, tables, `Documento ${sourceType === 'image' ? 'Imagen' : sourceType === 'pdf' ? 'PDF' : 'Video'}`)
      : `[${sourceType === 'image' ? 'Imagen' : sourceType === 'pdf' ? 'PDF' : 'Video'} ${source}: sin texto o tablas extraíbles]`;
  return {
    source,
    text,
    tables,
    parserMeta: {
      mode: 'vision_structured',
      confidence,
      ...(meta as Record<string, unknown>),
    } as ParsedTransactionArtifact['parserMeta'],
  };
}

async function runVisionExtraction(params: {
  source: string;
  sourceType: ParsedTable['source'];
  instructions: string;
  userPrompt: string;
  contents: Array<
    | { type: 'input_text'; text: string }
    | { type: 'input_file'; file_data: string; filename: string }
    | { type: 'input_image'; image_url: string; detail: 'auto' | 'high' | 'low' }
  >;
  model: string;
  maxOutputTokens: number;
}): Promise<VisionExtractionOutput> {
  return completeStructuredWithSchema<VisionExtractionOutput>({
    name: 'transaction_vision_extraction',
    description: `Extrae texto y tablas de un documento financiero (${params.sourceType}).`,
    model: params.model,
    temperature: 0,
    maxOutputTokens: params.maxOutputTokens,
    instructions: params.instructions,
    input: [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: params.userPrompt },
          ...params.contents,
        ],
      },
    ],
    schema: VISION_OUTPUT_SCHEMA,
  });
}

async function runVisionExtractionWithRetry(params: {
  source: string;
  sourceType: ParsedTable['source'];
  userPrompt: string;
  contents: Array<
    | { type: 'input_text'; text: string }
    | { type: 'input_file'; file_data: string; filename: string }
    | { type: 'input_image'; image_url: string; detail: 'auto' | 'high' | 'low' }
  >;
}): Promise<ParsedTransactionArtifact> {
  const primary = await runVisionExtraction({
    source: params.source,
    sourceType: params.sourceType,
    instructions:
      'Eres un OCR financiero experto. Extrae solo movimientos reales y tablas útiles. No inventes datos. Devuelve JSON estricto.',
    userPrompt: params.userPrompt,
    contents: params.contents,
    model: VISION_PRIMARY_MODEL,
    maxOutputTokens: 3200,
  });
  if (!isSparseVisionResult(primary)) {
    return buildVisionArtifact(params.source, primary, params.sourceType, primary.tables?.length ? 0.86 : 0.58, {
      model: VISION_PRIMARY_MODEL,
      usedRetry: false,
    });
  }

  const fallback = await runVisionExtraction({
    source: params.source,
    sourceType: params.sourceType,
    instructions:
      'Eres un OCR financiero senior. Relee con máximo cuidado y completa filas que faltaron. Prioriza fidelidad sobre cobertura. Devuelve JSON estricto.',
    userPrompt: `${params.userPrompt}\n\nPrimera pasada insuficiente. Relee con cuidado y recupera filas visibles omitidas.`,
    contents: params.contents.map((item) =>
      item.type === 'input_image' ? { ...item, detail: 'high' as const } : item,
    ),
    model: VISION_FALLBACK_MODEL,
    maxOutputTokens: 3600,
  });

  const primaryScore =
    (primary.tables?.length ?? 0) * 2 +
    (normalizeText(primary.text || primary.summary || '').length > 0 ? 1 : 0);
  const fallbackScore =
    (fallback.tables?.length ?? 0) * 2 +
    (normalizeText(fallback.text || fallback.summary || '').length > 0 ? 1 : 0);
  const chosen = fallbackScore > primaryScore ? fallback : primary;
  const usedRetry = chosen === fallback;
  const confidence = chosen.tables?.length
    ? usedRetry
      ? 0.9
      : 0.86
    : normalizeText(chosen.text || chosen.summary || '').length > 0
      ? usedRetry
        ? 0.68
        : 0.58
      : 0.18;
  return buildVisionArtifact(params.source, chosen, params.sourceType, confidence, {
    model: usedRetry ? VISION_FALLBACK_MODEL : VISION_PRIMARY_MODEL,
    usedRetry,
  });
}

async function parseVideoBufferDetailed(buffer: Buffer, filename: string): Promise<ParsedTransactionArtifact> {
  const ffmpegBinary = resolveFfmpegBinary();
  if (!ffmpegBinary) {
    return {
      source: filename,
      text: `[Video ${filename}: no se encontró un binario de FFmpeg disponible]`,
      tables: [],
      parserMeta: { mode: 'video_vision', confidence: 0.05 },
    };
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tx-video-'));
  const inputPath = path.join(tempDir, path.basename(filename));
  const framesDir = path.join(tempDir, 'frames');
  fs.mkdirSync(framesDir, { recursive: true });

  try {
    fs.writeFileSync(inputPath, buffer);
    const probe = spawnSync(ffmpegBinary, ['-hide_banner', '-i', inputPath], { encoding: 'utf8', timeout: 15_000 });
    const durationSeconds = parseVideoDurationSeconds(`${probe.stderr ?? ''}`);
    const frameRate = resolveVideoFrameRate(durationSeconds);
    const outputPattern = path.join(framesDir, 'frame-%03d.jpg');
    const MAX_VIDEO_SECONDS = 40;
    const extract = spawnSync(
      ffmpegBinary,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-t',
        String(MAX_VIDEO_SECONDS),
        '-i',
        inputPath,
        '-vf',
        `fps=${frameRate.toFixed(4)},scale=1280:-1:flags=lanczos`,
        '-q:v',
        '2',
        outputPattern,
      ],
      { encoding: 'utf8', timeout: 60_000 },
    );

    if (extract.status !== 0 || extract.error) {
      const reason = extract.error?.message ?? String(extract.stderr ?? 'error');
      return {
        source: filename,
        text: `[Video ${filename}: no se pudo extraer fotogramas (${reason})]`,
        tables: [],
        parserMeta: { mode: 'video_vision', confidence: 0.08 },
      };
    }

    const frameFiles = fs
      .readdirSync(framesDir)
      .filter((entry) => /\.(jpe?g)$/i.test(entry))
      .sort()
      .slice(0, MAX_VIDEO_FRAMES);

    if (frameFiles.length === 0) {
      return {
        source: filename,
        text: `[Video ${filename}: sin fotogramas útiles para analizar]`,
        tables: [],
        parserMeta: { mode: 'video_vision', confidence: 0.1 },
      };
    }

    const framePayloads = frameFiles.map((frameFile, index) => {
      const frameBuffer = fs.readFileSync(path.join(framesDir, frameFile));
      return {
        index: index + 1,
        url: `data:image/jpeg;base64,${frameBuffer.toString('base64')}`,
        label: `Fotograma ${index + 1}`,
      };
    });
    return await runVisionExtractionWithRetry({
      source: filename,
      sourceType: 'video',
      userPrompt:
        `Archivo: ${filename}. Fotogramas: ${framePayloads.length} (scroll continuo hacia abajo).\n` +
        'Extrae TODOS los movimientos financieros visibles en los fotogramas. ' +
        'Recuerda: el mismo movimiento puede aparecer en 2-4 fotogramas consecutivos mientras el usuario hace scroll — contarlo UNA sola vez. ' +
        'Un movimiento nuevo que aparece en la mitad inferior de un fotograma NO es duplicado del que apareció en la mitad superior del anterior si la descripción o monto difieren.',
      contents: framePayloads.flatMap((frame) => [
        { type: 'input_text' as const, text: frame.label },
        { type: 'input_image' as const, image_url: frame.url, detail: 'high' as const },
      ]),
    });
  } catch (error) {
    return {
      source: filename,
      text: `[Video ${filename}: error al extraer - ${String(error)}]`,
      tables: [],
      parserMeta: {
        mode: 'video_vision',
        confidence: 0.05,
      },
    };
  } finally {
    cleanupTempDir(tempDir);
  }
}

export type ParsedTable = {
  name: string;
  headers: string[];
  rows: string[][];
  source: 'excel' | 'csv' | 'pdf' | 'image' | 'video';
};

export type ParsedTransactionArtifact = {
  source: string;
  text: string;
  tables: ParsedTable[];
  parserMeta?: {
    mode: 'exact_sheet' | 'csv_exact' | 'pdf_coordinates' | 'pdf_text' | 'pdf_vision' | 'vision_structured' | 'video_vision';
    confidence: number;
  };
};

export type ParsedTransaction = {
  source: string;
  text: string;
  rows?: string[][];
};

function normalizeText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeHeaderToken(value: string): string {
  return normalizeText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function looksLikeHeaderRow(cells: string[]): boolean {
  const normalized = cells.map(normalizeHeaderToken);
  const hits = normalized.filter((cell) =>
    /^(fecha|fec|feccontable|fechamovimiento|fechaoperacion|detalle|descripcion|glosa|movimiento|concepto|cargo|abono|debito|credito|monto|importe|valor|saldo|referencia|oficina|sucursal|canal|operacion|documento|tipo)$/.test(
      cell,
    ),
  ).length;
  return hits >= 2;
}

function serializeTablesToText(filename: string, tables: ParsedTable[], fallbackLabel: string): string {
  const lines = [`--- ${fallbackLabel}: ${filename} ---`];
  for (const table of tables) {
    lines.push(`\n[Tabla: ${table.name}]`);
    if (table.headers.length > 0) lines.push(table.headers.join(' | '));
    for (const row of table.rows) lines.push(row.join(' | '));
  }
  lines.push('\n--- Fin ---');
  return lines.join('\n');
}

function makeGenericHeaders(width: number): string[] {
  return Array.from({ length: width }, (_, index) => `col_${index + 1}`);
}

function detectCsvDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).slice(0, 8).join('\n');
  const candidates = [',', ';', '\t', '|'];
  let best = ';';
  let bestScore = -1;
  for (const delimiter of candidates) {
    const score = sample
      .split(/\r?\n/)
      .map((line) => {
        let inQuotes = false;
        let count = 0;
        for (const char of line) {
          if (char === '"') inQuotes = !inQuotes;
          else if (char === delimiter && !inQuotes) count += 1;
        }
        return count;
      })
      .reduce((acc, count) => acc + count, 0);
    if (score > bestScore) {
      bestScore = score;
      best = delimiter;
    }
  }
  return best;
}

function parseDelimitedText(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let currentCell = '';
  let currentRow: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        currentCell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && char === delimiter) {
      currentRow.push(normalizeText(currentCell));
      currentCell = '';
      continue;
    }
    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') i += 1;
      currentRow.push(normalizeText(currentCell));
      if (currentRow.some((cell) => cell.length > 0)) rows.push(currentRow);
      currentCell = '';
      currentRow = [];
      continue;
    }
    currentCell += char;
  }
  currentRow.push(normalizeText(currentCell));
  if (currentRow.some((cell) => cell.length > 0)) rows.push(currentRow);
  return rows;
}

function rowsToTable(name: string, rows: string[][], source: ParsedTable['source']): ParsedTable | null {
  const cleanRows = rows
    .map((row) => row.map((cell) => normalizeText(cell)))
    .filter((row) => row.some((cell) => cell.length > 0));
  if (cleanRows.length === 0) return null;
  const width = cleanRows.reduce((max, row) => Math.max(max, row.length), 0);
  const padded = cleanRows.map((row) => Array.from({ length: width }, (_, index) => row[index] ?? ''));

  // Scan the first rows to find the actual header row. Chilean bank CSVs often
  // include metadata lines (institution name, account number, period) before the
  // real column headers, so checking only row[0] is insufficient.
  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(12, padded.length); i++) {
    if (looksLikeHeaderRow(padded[i])) {
      headerRowIndex = i;
      break;
    }
  }

  const headers = headerRowIndex >= 0 ? padded[headerRowIndex] : makeGenericHeaders(width);
  const body = headerRowIndex >= 0 ? padded.slice(headerRowIndex + 1) : padded;
  return { name, headers, rows: body, source };
}

function scoreHeaderRow(cells: string[]): number {
  const normalized = cells.map(normalizeHeaderToken);
  const canonicalHeaders = new Set([
    'fecha',
    'detalle',
    'cargo',
    'abono',
    'saldo',
    'descripcion',
    'glosa',
    'debito',
    'credito',
    'monto',
  ]);
  const exactHits = normalized.filter((cell) => canonicalHeaders.has(cell)).length;
  const hasFecha = normalized.includes('fecha');
  const hasDetalle =
    normalized.includes('detalle') || normalized.includes('descripcion') || normalized.includes('glosa');
  const hasMoneyColumn = normalized.some((cell) =>
    ['cargo', 'abono', 'debito', 'credito', 'monto', 'saldo'].includes(cell),
  );
  return exactHits + (hasFecha ? 3 : 0) + (hasDetalle ? 2 : 0) + (hasMoneyColumn ? 2 : 0);
}

function stripCsvLeadingMetadata(rows: string[][]): string[][] {
  if (rows.length === 0) return rows;
  let bestIndex = -1;
  let bestScore = -1;
  const scanLimit = Math.min(rows.length, 20);
  for (let index = 0; index < scanLimit; index += 1) {
    const row = rows[index] ?? [];
    if (!looksLikeHeaderRow(row)) continue;
    const score = scoreHeaderRow(row);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
    if (score >= 8) break;
  }
  return bestIndex > 0 ? rows.slice(bestIndex) : rows;
}

export function isPdfExtractionWeak(text: string, tables: ParsedTable[]): boolean {
  const compact = normalizeText(text);
  if (tables.length > 0 && compact.length >= 180) return false;
  if (!compact) return true;
  const alphaNumeric = (compact.match(/[a-z0-9]/gi) ?? []).length;
  const density = alphaNumeric / Math.max(1, compact.length);
  return compact.length < 180 || density < 0.35;
}

async function createPdfExtractParser() {
  const mod = await import('pdf.js-extract');
  const PdfExtract = (mod as { PDFExtract?: new () => { extractBuffer: (buffer: Buffer, options: Record<string, unknown>) => Promise<unknown> } }).PDFExtract;
  if (!PdfExtract) {
    throw new Error('pdf.js-extract PDFExtract no disponible');
  }
  return new PdfExtract();
}

async function parsePdfWithVisionDetailed(
  buffer: Buffer,
  filename: string,
  reason: string,
): Promise<ParsedTransactionArtifact> {
  try {
    return await runVisionExtractionWithRetry({
      source: filename,
      sourceType: 'pdf',
      userPrompt:
        `Archivo: ${filename}\n` +
        `Motivo del fallback: ${reason}\n` +
        'El PDF puede estar escaneado. Usa OCR visual si hace falta.\n' +
        'Devuelve JSON con summary, text y tables.\n' +
        'Cada table debe incluir name, headers y rows.\n' +
        'Las filas deben ser solo movimientos reales; excluye saldos, subtotales, resúmenes y encabezados repetidos.\n' +
        'Si una fila no permite lectura confiable, omítela.',
      contents: [
        {
          type: 'input_file',
          file_data: buffer.toString('base64'),
          filename,
        },
      ],
    });
  } catch {
    return {
      source: filename,
      text: '',
      tables: [],
      parserMeta: {
        mode: 'pdf_vision',
        confidence: 0.08,
      },
    };
  }
}

export async function parsePdfBufferDetailed(buffer: Buffer, filename: string): Promise<ParsedTransactionArtifact> {
  const fallbackText = async () => {
    let parser: any = null;
    try {
      parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      const text = normalizeText(result?.text || '');
      await parser.destroy();
      return text;
    } catch {
      if (parser) try { await parser.destroy(); } catch {}
      return '';
    }
  };

  try {
    const pdfExtract = await createPdfExtractParser();
    const extracted: any = await pdfExtract.extractBuffer(buffer, {
      normalizeWhitespace: true,
      disableCombineTextItems: false,
    });
    const tables: ParsedTable[] = [];
    const textLines: string[] = [];

    for (const [pageIndex, page] of (extracted.pages ?? []).entries()) {
      const items = Array.isArray(page?.content) ? page.content : [];
      const sorted = [...items].sort((left, right) => {
        const yDiff = Math.abs((left.y ?? 0) - (right.y ?? 0));
        if (yDiff > 1.5) return (left.y ?? 0) - (right.y ?? 0);
        return (left.x ?? 0) - (right.x ?? 0);
      });

      const rowBuckets: Array<{ y: number; items: any[] }> = [];
      for (const item of sorted) {
        const value = normalizeText(item?.str ?? '');
        if (!value) continue;
        const bucket = rowBuckets.find((candidate) => Math.abs(candidate.y - (item.y ?? 0)) <= 1.5);
        if (bucket) {
          bucket.items.push(item);
        } else {
          rowBuckets.push({ y: item.y ?? 0, items: [item] });
        }
      }

      const pageRows = rowBuckets
        .sort((left, right) => left.y - right.y)
        .map((bucket) => {
          const rowItems = [...bucket.items].sort((left, right) => (left.x ?? 0) - (right.x ?? 0));
          const gaps: number[] = [];
          for (let index = 1; index < rowItems.length; index += 1) {
            const prev = rowItems[index - 1];
            const gap = (rowItems[index].x ?? 0) - ((prev.x ?? 0) + (prev.width ?? 0));
            if (gap > 0) gaps.push(gap);
          }
          const sortedGaps = [...gaps].sort((a, b) => a - b);
          const medianGap =
            sortedGaps.length > 0
              ? sortedGaps[Math.floor(sortedGaps.length / 2)]
              : 0;
          const splitGap = Math.max(12, medianGap * 2.4);
          const cells: string[] = [];
          let current = '';
          for (let index = 0; index < rowItems.length; index += 1) {
            const item = rowItems[index];
            const value = normalizeText(item?.str ?? '');
            if (!value) continue;
            if (index === 0) {
              current = value;
              continue;
            }
            const prev = rowItems[index - 1];
            const gap = (item.x ?? 0) - ((prev.x ?? 0) + (prev.width ?? 0));
            if (gap >= splitGap) {
              cells.push(current);
              current = value;
            } else {
              current = `${current} ${value}`.trim();
            }
          }
          if (current) cells.push(current);
          return cells;
        })
        .filter((row) => row.some((cell) => cell.length > 0));

      textLines.push(...pageRows.map((row) => row.join(' ')));

      let block: string[][] = [];
      const flushBlock = () => {
        if (block.length < 2) {
          block = [];
          return;
        }
        const width = block.reduce((max, row) => Math.max(max, row.length), 0);
        if (width < 3) {
          block = [];
          return;
        }
        const table = rowsToTable(`Página ${pageIndex + 1}`, block, 'pdf');
        if (table) tables.push(table);
        block = [];
      };

      for (const row of pageRows) {
        if (row.length >= 3) block.push(row);
        else flushBlock();
      }
      flushBlock();
    }

    const exactText = textLines.join('\n').trim();
    if (exactText || tables.length > 0) {
      if (isPdfExtractionWeak(exactText, tables)) {
        const visionFallback = await parsePdfWithVisionDetailed(buffer, filename, 'extraccion local debil');
        if (visionFallback.tables.length > 0 || normalizeText(visionFallback.text).length > 0) return visionFallback;
      }
      return {
        source: filename,
        text: exactText
          ? `--- Documento PDF: ${filename} ---\n${exactText}\n--- Fin ---`
          : serializeTablesToText(filename, tables, 'Documento PDF'),
        tables,
        parserMeta: {
          mode: tables.length > 0 ? 'pdf_coordinates' : 'pdf_text',
          confidence: tables.length > 0 ? 0.88 : 0.62,
        },
      };
    }

    const visionFallback = await parsePdfWithVisionDetailed(buffer, filename, 'sin texto local');
    if (visionFallback.tables.length > 0 || normalizeText(visionFallback.text).length > 0) return visionFallback;

    const fallback = await fallbackText();
    return {
      source: filename,
      text: fallback ? `--- Documento PDF: ${filename} ---\n${fallback}\n--- Fin ---` : `[PDF ${filename}: sin texto extraíble]`,
      tables: [],
      parserMeta: {
        mode: 'pdf_text',
        confidence: fallback ? 0.42 : 0.18,
      },
    };
  } catch (error) {
    const visionFallback = await parsePdfWithVisionDetailed(buffer, filename, `error extractor local: ${String(error)}`);
    if (visionFallback.tables.length > 0 || normalizeText(visionFallback.text).length > 0) return visionFallback;

    const fallback = await fallbackText();
    return {
      source: filename,
      text: fallback ? `--- Documento PDF: ${filename} ---\n${fallback}\n--- Fin ---` : `[PDF ${filename}: error al extraer texto - ${String(error)}]`,
      tables: [],
      parserMeta: {
        mode: 'pdf_text',
        confidence: fallback ? 0.35 : 0.12,
      },
    };
  }
}

export async function parseExcelBufferDetailed(buffer: Buffer, filename: string): Promise<ParsedTransactionArtifact> {
  try {
    const workbook = XLSX.read(buffer, {
      type: 'buffer',
      cellDates: true,
      cellNF: false,
      cellText: false,
      dense: true,
    });
    const tables: ParsedTable[] = [];

    for (const sheetName of workbook.SheetNames ?? []) {
      const sheet = workbook.Sheets?.[sheetName];
      if (!sheet) continue;
      const matrix = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        raw: false,
        defval: '',
        blankrows: false,
      }) as unknown[][];
      const rows = matrix.map((row) => row.map((cell) => normalizeText(cell)));
      const table = rowsToTable(sheetName, rows, 'excel');
      if (table) tables.push(table);
    }

    if (tables.length === 0) {
      return {
        source: filename,
        text: `[Excel ${filename}: sin datos tabulares legibles]`,
        tables: [],
        parserMeta: { mode: 'exact_sheet', confidence: 0.1 },
      };
    }

    return {
      source: filename,
      text: serializeTablesToText(filename, tables, 'Cartola Excel'),
      tables,
      parserMeta: { mode: 'exact_sheet', confidence: 0.995 },
    };
  } catch (error) {
    return {
      source: filename,
      text: `[Excel ${filename}: error al extraer - ${String(error)}]`,
      tables: [],
      parserMeta: { mode: 'exact_sheet', confidence: 0.05 },
    };
  }
}

export async function parseCsvBufferDetailed(buffer: Buffer, filename: string): Promise<ParsedTransactionArtifact> {
  try {
    const text = buffer.toString('utf-8').replace(/^\uFEFF/, '').trim();
    if (!text) {
      return {
        source: filename,
        text: `[CSV ${filename}: vacío]`,
        tables: [],
        parserMeta: { mode: 'csv_exact', confidence: 0.05 },
      };
    }
    const delimiter = detectCsvDelimiter(text);
    const rows = stripCsvLeadingMetadata(parseDelimitedText(text, delimiter));
    const table = rowsToTable(path.basename(filename), rows, 'csv');
    const tables = table ? [table] : [];
    return {
      source: filename,
      text: table ? serializeTablesToText(filename, tables, 'Cartola CSV') : `--- Cartola CSV: ${filename} ---\n${text}\n--- Fin ---`,
      tables,
      parserMeta: { mode: 'csv_exact', confidence: table ? 0.99 : 0.55 },
    };
  } catch (error) {
    return {
      source: filename,
      text: `[CSV ${filename}: error - ${String(error)}]`,
      tables: [],
      parserMeta: { mode: 'csv_exact', confidence: 0.05 },
    };
  }
}

export async function parseImageBufferDetailed(buffer: Buffer, filename: string): Promise<ParsedTransactionArtifact> {
  const ext = path.extname(filename).toLowerCase();
  const mime = IMAGE_MIME_BY_EXT[ext];
  if (!mime) {
    return {
      source: filename,
      text: `[Imagen ${filename}: formato no soportado (${ext})]`,
      tables: [],
      parserMeta: { mode: 'vision_structured', confidence: 0.01 },
    };
  }

  try {
    return await runVisionExtractionWithRetry({
      source: filename,
      sourceType: 'image',
      userPrompt:
        `Archivo: ${filename}\n` +
        'Devuelve JSON con summary, text y tables.\n' +
        'Cada table debe incluir name, headers y rows.\n' +
        'Si una fila no es movimiento real y parece saldo/resumen, déjala fuera de rows.',
      contents: [
        {
          type: 'input_image',
          image_url: `data:${mime};base64,${buffer.toString('base64')}`,
          detail: visionImageDetail(),
        },
      ],
    });
  } catch {
    return {
      source: filename,
      text: `[Imagen ${filename}: error al extraer]`,
      tables: [],
      parserMeta: {
        mode: 'vision_structured',
        confidence: 0.05,
      },
    };
  }
}

export async function parseTransactionFileDetailed(
  buffer: Buffer,
  filename: string,
): Promise<ParsedTransactionArtifact> {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.pdf') return parsePdfBufferDetailed(buffer, filename);
  if (ext === '.xls' || ext === '.xlsx') return parseExcelBufferDetailed(buffer, filename);
  if (VIDEO_EXTENSIONS.has(ext)) return parseVideoBufferDetailed(buffer, filename);
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
    return parseCsvBufferDetailed(buffer, filename);
  }
  if (ext in IMAGE_MIME_BY_EXT) return parseImageBufferDetailed(buffer, filename);
  return {
    source: filename,
    text: `[${filename}: formato no soportado (${ext})]`,
    tables: [],
    parserMeta: { mode: 'csv_exact', confidence: 0.01 },
  };
}

export async function parsePdfBuffer(buffer: Buffer, filename: string): Promise<string> {
  return (await parsePdfBufferDetailed(buffer, filename)).text;
}

export async function parseExcelBuffer(buffer: Buffer, filename: string): Promise<string> {
  return (await parseExcelBufferDetailed(buffer, filename)).text;
}

export async function parseCsvBuffer(buffer: Buffer, filename: string): Promise<string> {
  return (await parseCsvBufferDetailed(buffer, filename)).text;
}

export async function parseImageBuffer(buffer: Buffer, filename: string): Promise<string> {
  return (await parseImageBufferDetailed(buffer, filename)).text;
}

export async function parseTransactionFile(
  buffer: Buffer,
  filename: string,
): Promise<string> {
  return (await parseTransactionFileDetailed(buffer, filename)).text;
}

/**
 * Guarda el contenido extraído en la carpeta RAG para la sesión.
 */
export function saveToRag(sessionId: string, filename: string, content: string): string {
  const dir = path.join(DATA_ROOT, sanitizeSessionId(sessionId));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const base = path.basename(filename, path.extname(filename));
  const safeName = base.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
  const outPath = path.join(dir, `${safeName}.txt`);
  fs.writeFileSync(outPath, content, 'utf-8');
  return outPath;
}

function sanitizeSessionId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'default';
}

/**
 * Ruta absoluta de la carpeta de transacciones para una sesión (para RAG).
 */
export function getTransactionsDir(sessionId: string): string {
  return path.join(DATA_ROOT, sanitizeSessionId(sessionId));
}
