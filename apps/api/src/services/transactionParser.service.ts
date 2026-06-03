/**
 * Extrae texto y tablas de cartolas PDF, Excel, CSV e imágenes.
 * Prioriza extracción local exacta y deja el fallback de visión sólo para imágenes.
 */

import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import PDFParse from 'pdf-parse';
import { PDFExtract } from 'pdf.js-extract';
import { getOpenAIClient, withCompatibleTemperature } from './llm.service';

const DATA_ROOT = path.join(process.cwd(), 'data', 'transactions');
const IMAGE_MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

export type ParsedTable = {
  name: string;
  headers: string[];
  rows: string[][];
  source: 'excel' | 'csv' | 'pdf' | 'image';
};

export type ParsedTransactionArtifact = {
  source: string;
  text: string;
  tables: ParsedTable[];
  parserMeta?: {
    mode: 'exact_sheet' | 'csv_exact' | 'pdf_coordinates' | 'pdf_text' | 'vision_structured';
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
    /^(fecha|detalle|descripcion|glosa|movimiento|concepto|cargo|abono|debito|credito|monto|saldo|referencia|oficina|sucursal|canal)$/.test(
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

function coerceWorksheetCell(cell: ExcelJS.CellValue | undefined | null): string {
  if (cell == null) return '';
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  if (typeof cell === 'object') {
    if ('text' in cell && typeof cell.text === 'string') return normalizeText(cell.text);
    if ('result' in cell && cell.result != null) return normalizeText(cell.result);
    if ('richText' in cell && Array.isArray(cell.richText)) {
      return normalizeText(cell.richText.map((part) => part.text ?? '').join(' '));
    }
    if ('formula' in cell && typeof cell.formula === 'string' && cell.formula.trim()) {
      return normalizeText(String(cell.result ?? cell.formula));
    }
    if ('hyperlink' in cell && typeof cell.hyperlink === 'string') return normalizeText(cell.hyperlink);
  }
  return normalizeText(cell);
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
  const headers = looksLikeHeaderRow(padded[0]) ? padded[0] : makeGenericHeaders(width);
  const body = looksLikeHeaderRow(padded[0]) ? padded.slice(1) : padded;
  return { name, headers, rows: body, source };
}

export async function parsePdfBufferDetailed(buffer: Buffer, filename: string): Promise<ParsedTransactionArtifact> {
  const pdfExtract = new PDFExtract();
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
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const tables: ParsedTable[] = [];

    workbook.eachSheet((sheet) => {
      const rows: string[][] = [];
      sheet.eachRow({ includeEmpty: false }, (row) => {
        const width = Math.max(row.cellCount, row.actualCellCount, 1);
        const cells = Array.from({ length: width }, (_, index) => coerceWorksheetCell(row.getCell(index + 1).value));
        if (cells.some((cell) => cell.length > 0)) rows.push(cells);
      });
      const table = rowsToTable(sheet.name, rows, 'excel');
      if (table) tables.push(table);
    });

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
      parserMeta: { mode: 'exact_sheet', confidence: 0.99 },
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
    const rows = parseDelimitedText(text, delimiter);
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

  const base64 = buffer.toString('base64');
  const imageDataUrl = `data:${mime};base64,${base64}`;

  try {
    const client = getOpenAIClient();
    const model = process.env.OPENAI_VISION_MODEL || 'gpt-4.1-mini';
    const response = await client.chat.completions.create(
      withCompatibleTemperature(
        {
          model,
          max_completion_tokens: 1800,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content:
                'Extrae cartolas financieras desde imagen con máxima fidelidad. Responde solo JSON válido con keys: summary, text, tables. Si identificas una tabla de movimientos, copia headers y filas exactas. No inventes celdas.',
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text:
                    `Archivo: ${filename}\n` +
                    'Devuelve JSON con summary, text y tables.\n' +
                    'Cada table debe incluir name, headers y rows.\n' +
                    'Si una fila no es movimiento real y parece saldo/resumen, déjala fuera de rows.',
                },
                { type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } },
              ] as any,
            },
          ],
        },
        model,
        0,
      ) as any,
    );
    const raw = response.choices?.[0]?.message?.content?.trim() ?? '{}';
    const result = JSON.parse(raw) as {
      summary?: string;
      text?: string;
      tables?: Array<{ name?: string; headers?: string[]; rows?: string[][] }>;
    };

    const tables = Array.isArray(result.tables)
      ? result.tables
          .map((table, index) =>
            rowsToTable(
              table.name?.trim() || `Tabla imagen ${index + 1}`,
              Array.isArray(table.rows) ? table.rows : [],
              'image',
            ),
          )
          .filter((table): table is ParsedTable => Boolean(table))
      : [];

    const textBody = normalizeText(result.text || result.summary || '');
    return {
      source: filename,
      text: textBody
        ? `--- Documento Imagen: ${filename} ---\n${textBody}\n--- Fin ---`
        : tables.length > 0
          ? serializeTablesToText(filename, tables, 'Documento Imagen')
          : `[Imagen ${filename}: sin texto o datos extraíbles]`,
      tables,
      parserMeta: {
        mode: 'vision_structured',
        confidence: tables.length > 0 ? 0.78 : textBody ? 0.56 : 0.2,
      },
    };
  } catch {
    try {
      const fallbackClient = getOpenAIClient();
      const fallbackModel = process.env.OPENAI_VISION_MODEL || 'gpt-4.1-mini';
      const response = await fallbackClient.chat.completions.create(
        withCompatibleTemperature(
          {
            model: fallbackModel,
            max_completion_tokens: 900,
            messages: [
              {
                role: 'system',
                content:
                  'Extrae texto y contexto de documentos financieros en imagen. Devuelve SOLO texto claro en español con: (1) resumen, (2) datos detectados, (3) posibles alertas.',
              },
              {
                role: 'user',
                content: [
                  { type: 'text', text: `Analiza esta imagen financiera llamada "${filename}" y extrae su contenido.` },
                  { type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } },
                ] as any,
              },
            ],
          },
          fallbackModel,
          0,
        ) as any,
      );
      const extracted = response.choices?.[0]?.message?.content?.trim() ?? '';
      return {
        source: filename,
        text: extracted ? `--- Documento Imagen: ${filename} ---\n${extracted}\n--- Fin ---` : `[Imagen ${filename}: sin texto o datos extraíbles]`,
        tables: [],
        parserMeta: {
          mode: 'vision_structured',
          confidence: extracted ? 0.42 : 0.18,
        },
      };
    } catch (error) {
      return {
        source: filename,
        text: `[Imagen ${filename}: error al extraer - ${String(error)}]`,
        tables: [],
        parserMeta: {
          mode: 'vision_structured',
          confidence: 0.05,
        },
      };
    }
  }
}

export async function parseTransactionFileDetailed(
  buffer: Buffer,
  filename: string,
): Promise<ParsedTransactionArtifact> {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.pdf') return parsePdfBufferDetailed(buffer, filename);
  if (ext === '.xls') {
    return {
      source: filename,
      text: `[Excel ${filename}: formato .xls no soportado; exporta a .xlsx o .csv]`,
      tables: [],
      parserMeta: { mode: 'csv_exact', confidence: 0.01 },
    };
  }
  if (ext === '.xlsx') return parseExcelBufferDetailed(buffer, filename);
  if (ext === '.csv' || ext === '.txt' || ext === '.md') return parseCsvBufferDetailed(buffer, filename);
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
