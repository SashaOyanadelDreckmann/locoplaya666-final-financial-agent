/**
 * Extrae texto/datos de cartolas PDF, Excel y CSV para RAG.
 */

import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import PDFParse from 'pdf-parse';
import { getOpenAIClient, withCompatibleTemperature } from './llm.service';

const DATA_ROOT = path.join(process.cwd(), 'data', 'transactions');
const IMAGE_MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

export type ParsedTransaction = {
  source: string;
  text: string;
  rows?: string[][];
};

/**
 * Parsea un buffer de PDF y retorna texto plano.
 */
export async function parsePdfBuffer(buffer: Buffer, filename: string): Promise<string> {
  let parser: any = null;
  try {
    parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    const text = (result?.text || '').trim();
    await parser.destroy();
    if (!text) return `[PDF ${filename}: sin texto extraíble]`;
    return `--- Documento PDF: ${filename} ---\n${text}\n--- Fin ---`;
  } catch (e) {
    if (parser) try { await parser.destroy(); } catch {}
    return `[PDF ${filename}: error al extraer texto - ${String(e)}]`;
  }
}

/**
 * Parsea un buffer de Excel (.xls, .xlsx) y retorna texto tabular.
 */
export async function parseExcelBuffer(buffer: Buffer, filename: string): Promise<string> {
  try {
    const workbook = new ExcelJS.Workbook();
    const excelBuffer = buffer as unknown as Parameters<typeof workbook.xlsx.load>[0];
    await workbook.xlsx.load(excelBuffer);
    const lines: string[] = [`--- Cartola Excel: ${filename} ---`];

    workbook.eachSheet((sheet) => {
      const rows = sheet.getSheetValues().slice(1);
      const serialized = rows
        .map((row) => {
          if (!Array.isArray(row)) return '';
          return row
            .slice(1)
            .map((cell) => String(cell ?? '').trim())
            .join(' | ')
            .trim();
        })
        .filter(Boolean)
        .join('\n');

      if (serialized) {
        lines.push(`\n[Hoja: ${sheet.name}]\n${serialized}`);
      }
    });

    if (lines.length === 1) {
      return `[Excel ${filename}: sin datos tabulares legibles]`;
    }

    lines.push('\n--- Fin ---');
    return lines.join('\n');
  } catch (e) {
    return `[Excel ${filename}: error al extraer - ${String(e)}]`;
  }
}

/**
 * Parsea un buffer de CSV (texto UTF-8).
 */
export function parseCsvBuffer(buffer: Buffer, filename: string): string {
  try {
    const text = buffer.toString('utf-8').trim();
    if (!text) return `[CSV ${filename}: vacío]`;
    return `--- Cartola CSV: ${filename} ---\n${text}\n--- Fin ---`;
  } catch (e) {
    return `[CSV ${filename}: error - ${String(e)}]`;
  }
}

/**
 * Parsea una imagen usando visión para extraer texto + contexto financiero útil.
 */
export async function parseImageBuffer(buffer: Buffer, filename: string): Promise<string> {
  const ext = path.extname(filename).toLowerCase();
  const mime = IMAGE_MIME_BY_EXT[ext];
  if (!mime) return `[Imagen ${filename}: formato no soportado (${ext})]`;

  try {
    const client = getOpenAIClient();
    const base64 = buffer.toString('base64');
    const imageDataUrl = `data:${mime};base64,${base64}`;

    const model = process.env.OPENAI_VISION_MODEL || 'gpt-4.1-mini';
    const response = await client.chat.completions.create(
      withCompatibleTemperature(
        {
          model,
          max_completion_tokens: 900,
          messages: [
            {
              role: 'system',
              content:
                'Extrae texto y contexto de documentos financieros en imagen. Devuelve SOLO texto claro en español con: (1) resumen, (2) datos detectados (montos/fechas/tasas), (3) posibles alertas.',
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
        model,
        0,
      ) as any,
    );

    const extracted = response.choices?.[0]?.message?.content?.trim() ?? '';
    if (!extracted) return `[Imagen ${filename}: sin texto o datos extraíbles]`;
    return `--- Documento Imagen: ${filename} ---\n${extracted}\n--- Fin ---`;
  } catch (e) {
    return `[Imagen ${filename}: error al extraer - ${String(e)}]`;
  }
}

/**
 * Detecta tipo de archivo y parsea.
 */
export async function parseTransactionFile(
  buffer: Buffer,
  filename: string
): Promise<string> {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.pdf') return parsePdfBuffer(buffer, filename);
  if (ext === '.xls') return `[Excel ${filename}: formato .xls no soportado; exporta a .xlsx o .csv]`;
  if (ext === '.xlsx' || ext === '.xls') return parseExcelBuffer(buffer, filename);
  if (ext === '.csv') return parseCsvBuffer(buffer, filename);
  if (ext === '.txt' || ext === '.md') return parseCsvBuffer(buffer, filename);
  if (ext in IMAGE_MIME_BY_EXT) return parseImageBuffer(buffer, filename);
  return `[${filename}: formato no soportado (${ext})]`;
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
