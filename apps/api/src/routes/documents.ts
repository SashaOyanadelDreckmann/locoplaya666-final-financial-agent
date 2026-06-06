/**
 * Ingiere documentos PDF/Excel/CSV/imagen subidos desde el chat.
 * Retorna texto extraído y deja memoria documental buscable por usuario.
 */

import { Router } from 'express';
import { z } from 'zod';
import { ingestUserDocument, searchUserDocumentContext } from '../services/document-intelligence.service';
import { getUserDocumentsByIds } from '../persistence/repos';
import { completeStructured } from '../services/llm.service';
import { inferTransactionTaxonomy } from '../services/transactionTaxonomy.service';
import { requireAuth, requirePermission } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { badRequest, unauthorized } from '../http/api.errors';
import { sendSuccess } from '../http/api.responses';
import { parseBody } from '../http/parse';
import { PERMISSIONS } from '../auth/rbac';
import {
  buildExecutiveSummaryText,
  shouldReconcileMovements,
} from './documents.parse.helpers';

const router = Router();

const MAX_PARSE_FILES = Math.max(1, Number.parseInt(process.env.DOCUMENT_PARSE_MAX_FILES || '25', 10) || 25);
const MAX_FILE_BYTES = Math.max(
  1024,
  Number.parseInt(process.env.DOCUMENT_PARSE_MAX_FILE_BYTES || `${50 * 1024 * 1024}`, 10) || 50 * 1024 * 1024,
);
const MAX_TOTAL_BYTES = Math.max(
  MAX_FILE_BYTES,
  Number.parseInt(process.env.DOCUMENT_PARSE_MAX_TOTAL_BYTES || `${50 * 1024 * 1024}`, 10) || 50 * 1024 * 1024,
);

const ParseRequestSchema = z.object({
  files: z
    .array(
      z.object({
        name: z.string().min(1),
        base64: z.string().min(1),
        mimeType: z.string().optional(),
      }),
    )
    .min(1)
    .max(MAX_PARSE_FILES),
  institutionHint: z.string().trim().max(160).optional(),
  serviceHint: z.string().trim().max(160).optional(),
  productTypeHint: z.string().trim().max(80).optional(),
  productLabelHint: z.string().trim().max(160).optional(),
  fastParse: z.boolean().optional(),
});

const SearchQuerySchema = z.object({
  q: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(10).optional(),
});

const ResolveDocumentsSchema = z.object({
  documentIds: z.array(z.string().min(1)).min(1).max(20),
});

type ParsedDocumentResponse = {
  documentId: string;
  name: string;
  text: string;
  summary: unknown;
  structuredData: unknown;
  indexed: boolean;
};

type ParsedMovement = {
  date?: string;
  description: string;
  amount: number;
  direction: 'expense' | 'income';
  movement_kind?: 'expense' | 'income' | 'abono';
  source_line?: string;
  category?: string;
  merchant?: string;
  category_confidence?: number;
  confidence?: number;
  source_kind?: 'table' | 'line';
};

type StructuredTableForReconciliation = {
  name?: string;
  headers?: string[];
  rows?: string[][];
  source?: string;
};

const PRODUCT_TYPES = new Set([
  'credit_card',
  'debit_account',
  'checking_account',
  'savings_account',
  'consumer_loan',
  'mortgage',
  'investment_account',
]);

const SUPPORTED_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.mp4',
  '.mov',
  '.webm',
  '.m4v',
  '.avi',
  '.pdf',
  '.xls',
  '.xlsx',
  '.csv',
  '.tsv',
  '.txt',
  '.md',
  '.json',
  '.xml',
  '.yaml',
  '.yml',
  '.log',
]);

export function isSupportedDocumentFilename(name: string): boolean {
  const normalized = String(name ?? '').trim().toLowerCase();
  if (!normalized) return false;
  const dot = normalized.lastIndexOf('.');
  if (dot < 0) return false;
  return SUPPORTED_EXTENSIONS.has(normalized.slice(dot));
}

export function decodeBase64File(base64: string, name: string): Buffer {
  // Strip all whitespace before decoding — browsers may insert line breaks in data URLs.
  const normalized = String(base64 ?? '').replace(/\s+/g, '');
  if (!normalized) throw badRequest(`Archivo "${name}" sin contenido.`);
  // Buffer.from with 'base64' is lenient: it silently ignores non-base64 chars
  // and handles any padding variant. Re-encoding to verify would cost double
  // the memory (50 MB file → 100 MB peak) and can produce false positives.
  const buffer = Buffer.from(normalized, 'base64');
  if (buffer.byteLength === 0) throw badRequest(`Archivo "${name}" no pudo decodificarse.`);
  return buffer;
}

export function validateAndPrepareDocumentFiles(
  files: Array<{ name: string; base64: string; mimeType?: string }>,
): Array<{ name: string; base64: string; mimeType?: string; buffer: Buffer }> {
  const decodedFiles = files.map((file) => {
    if (!isSupportedDocumentFilename(file.name)) {
        throw badRequest(
        `Archivo "${file.name}" no soportado. Usa PDF, imagen, video, XLS/XLSX, CSV/TSV, TXT/MD, JSON, XML, YAML o LOG.`,
      );
    }
    return {
      ...file,
      buffer: decodeBase64File(file.base64, file.name),
    };
  });

  const totalBytes = decodedFiles.reduce((sum, file) => sum + file.buffer.byteLength, 0);
  if (totalBytes > MAX_TOTAL_BYTES) {
    throw badRequest(
      `El total cargado supera ${Math.round(MAX_TOTAL_BYTES / (1024 * 1024))} MB. Divide los archivos en bloques.`,
    );
  }

  for (const file of decodedFiles) {
    if (file.buffer.byteLength > MAX_FILE_BYTES) {
      throw badRequest(
        `Archivo "${file.name}" excede el límite de ${Math.round(MAX_FILE_BYTES / (1024 * 1024))} MB por archivo.`,
      );
    }
  }

  return decodedFiles;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatAmount(value: number): string {
  return new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 }).format(Math.round(value));
}

function toIsoDate(value: string | null | undefined): string | undefined {
  const raw = String(value ?? '').trim();
  if (!raw) return undefined;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dm = raw.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
  if (!dm) return undefined;
  const dd = dm[1].padStart(2, '0');
  const mm = dm[2].padStart(2, '0');
  const yy = dm[3] ? (dm[3].length === 2 ? `20${dm[3]}` : dm[3]) : new Date().getFullYear().toString();
  return `${yy}-${mm}-${dd}`;
}

function parseDateFromLine(line: string): string | undefined {
  const match = line.match(/\b(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\b/);
  return toIsoDate(match?.[1]);
}

function normalizeTextToken(value: string): string {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseAmountToken(token: string): number | null {
  if (!token) return null;
  if (/\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/.test(token)) return null;
  if (/[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(token) && !/\b(?:clp|usd|uf|eur|\$)\b/i.test(token)) return null;
  const raw = token.trim();
  const negativeByParens = /^\(.*\)$/.test(raw);
  const negativeByLeadingMinus = /^\s*-/.test(raw);
  const negativeByTrailingMinus = /-\s*$/.test(raw);
  const cleaned = raw.replace(/[^\d.,+-]/g, '').trim();
  if (!cleaned) return null;
  const sign = negativeByParens || negativeByLeadingMinus || negativeByTrailingMinus || cleaned.startsWith('-') ? -1 : 1;
  const unsigned = cleaned.replace(/^[+-]/, '');
  const hasDot = unsigned.includes('.');
  const hasComma = unsigned.includes(',');
  let normalized = cleaned;
  if (hasDot && hasComma) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    const [, decimals = ''] = unsigned.split(',');
    normalized = decimals.length === 3 ? cleaned.replace(/,/g, '') : cleaned.replace(',', '.');
  } else {
    normalized = cleaned.replace(/[.\s]/g, '');
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed === 0) return null;
  return sign * Math.abs(parsed);
}

function hasExplicitNegativeAmount(token: string): boolean {
  const raw = String(token ?? '').trim();
  return /^\(.*\)$/.test(raw) || /^\s*-/.test(raw) || /-\s*$/.test(raw);
}

function hasExplicitPositiveAmount(token: string): boolean {
  const raw = String(token ?? '').trim();
  return /^\s*\+/.test(raw);
}

function normalizeMovementProductType(value?: string): string | undefined {
  return normalizeProductType(value);
}

export function inferMovementDirection(
  line: string,
  signedAmount: number,
  amountToken = '',
  productType?: string,
): 'income' | 'expense' {
  return inferMovementSemantics(line, signedAmount, amountToken, productType).direction;
}

export function inferMovementKind(
  line: string,
  signedAmount: number,
  amountToken = '',
  productType?: string,
): 'expense' | 'income' | 'abono' {
  return inferMovementSemantics(line, signedAmount, amountToken, productType).kind;
}

function inferMovementSemantics(
  line: string,
  signedAmount: number,
  amountToken = '',
  productType?: string,
): { direction: 'income' | 'expense'; kind: 'expense' | 'income' | 'abono' } {
  const normalized = line.toLowerCase();
  const normalizedProductType = normalizeMovementProductType(productType);
  const isCreditCard = normalizedProductType === 'credit_card';

  const incomeHits = (
    normalized.match(
      /\b(ingreso|sueldo|remuner|n[oó]mina|payroll|pensi[oó]n|honorari)\b/g,
    ) ?? []
  ).length;
  const abonoHits = (
    normalized.match(/\b(abono|pago\s+recibido|pago\s+(?:minimo|mínimo|tarjeta|a\s+la\s+tarjeta|de\s+tarjeta)|transferencia\s+recibida|dep[oó]sito|reintegro|reembolso|devoluci[oó]n)\b/g) ??
    []
  ).length;

  // Generic expense keywords excluding "pago" standalone so that
  // "pago recibido" (already counted above) does not inflate expenseHits.
  const expenseHits = (
    normalized.match(/\b(compra|cargo|retiro|comisi[oó]n|suscrip|giro|transferencia\s+enviada|transferencia\s+emitida|pac|pat|webpay|pos|debito|d[eé]bito)\b/g) ?? []
  ).length + (
    !isCreditCard
      ? (normalized.match(/\bpago(?!\s+recibido)\b/g) ?? []).length
      : 0
  );

  // Credit card installment notation (1/3, 1/6, etc.) always signals an expense.
  const isCreditCardInstallment = /\b\d+\/\d+\b/.test(normalized);
  if (isCreditCardInstallment && incomeHits === 0 && abonoHits === 0) {
    return { direction: 'expense', kind: 'expense' };
  }
  if (hasExplicitNegativeAmount(amountToken) && incomeHits === 0 && abonoHits === 0) {
    return { direction: 'expense', kind: 'expense' };
  }
  if (hasExplicitPositiveAmount(amountToken) && incomeHits > expenseHits) {
    return { direction: 'income', kind: 'income' };
  }
  if (incomeHits > expenseHits && incomeHits > 0) {
    return { direction: 'income', kind: 'income' };
  }
  if (abonoHits > 0) {
    return { direction: 'income', kind: 'abono' };
  }
  if (expenseHits > incomeHits && expenseHits > 0) {
    return { direction: 'expense', kind: 'expense' };
  }
  return signedAmount < 0
    ? { direction: 'expense', kind: 'expense' }
    : { direction: 'income', kind: 'income' };
}

function isNonMovementDescription(value: string): boolean {
  const normalized = normalizeTextToken(value);
  if (!normalized) return true;
  return /\b(saldo anterior|saldo inicial|saldo final|nuevo saldo|saldo disponible|saldo contable|total|subtotal|resumen|cartola|estado de cuenta|periodo|periodo facturado|fecha de facturacion|fecha de vencimiento|pago minimo|cupo disponible|cupo total|linea de credito|linea de credito disponible|interes del periodo|interes rotativo|comision total)\b/.test(
    normalized,
  );
}

function cleanMovementDescription(value: string): string {
  return String(value ?? '')
    .replace(/\b(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitCandidateCells(line: string): string[] {
  const source = String(line ?? '').trim();
  if (!source) return [];
  if (source.includes('|')) return source.split('|').map((cell) => cell.trim()).filter(Boolean);
  if (source.includes('\t')) return source.split('\t').map((cell) => cell.trim()).filter(Boolean);
  if (source.includes(';')) return source.split(';').map((cell) => cell.trim()).filter(Boolean);
  return source.split(/\s{2,}/).map((cell) => cell.trim()).filter(Boolean);
}

function resolveColumnIndex(headers: string[], patterns: RegExp[]): number {
  for (let i = 0; i < headers.length; i += 1) {
    const header = normalizeTextToken(headers[i]);
    if (patterns.some((pattern) => pattern.test(header))) return i;
  }
  return -1;
}

function isBlankLikeCell(value: string | null | undefined): boolean {
  const normalized = String(value ?? '').trim().toLowerCase();
  return (
    normalized.length === 0 ||
    normalized === '-' ||
    normalized === '--' ||
    normalized === '0' ||
    normalized === '0,00' ||
    normalized === '0.00' ||
    normalized === '$0' ||
    normalized === '$ 0'
  );
}

function pickAmountFromCells(cells: string[], preferredIndexes: number[]): { amount: number | null; token: string; index: number } {
  for (const index of preferredIndexes) {
    if (index < 0 || index >= cells.length) continue;
    const token = cells[index];
    const amount = parseAmountToken(token);
    if (amount !== null) return { amount, token, index };
  }
  for (let index = cells.length - 1; index >= 0; index -= 1) {
    const token = cells[index];
    const amount = parseAmountToken(token);
    if (amount !== null) return { amount, token, index };
  }
  return { amount: null, token: '', index: -1 };
}

function buildMovementKey(movement: ParsedMovement): string {
  return [
    movement.date || 'nd',
    movement.direction,
    movement.movement_kind || 'income',
    Math.round(movement.amount),
    normalizeTextToken(movement.description),
  ].join('|');
}

function parseMovementFromTableRow(params: {
  headers: string[];
  row: string[];
  productType?: string;
}): ParsedMovement | null {
  const { headers, row, productType } = params;
  if (!Array.isArray(row) || row.length === 0) return null;

  const dateIndex = resolveColumnIndex(headers, [/^fecha\b/, /^fec\b/, /contable/]);
  const descriptionIndex = resolveColumnIndex(headers, [/detalle/, /descripcion/, /glosa/, /movimiento/, /concepto/]);
  const expenseIndex = resolveColumnIndex(headers, [/cargo/, /egreso/, /debito/, /debe/]);
  const incomeIndex = resolveColumnIndex(headers, [/abono/, /ingreso/, /credito/, /haber/]);
  const amountIndex = resolveColumnIndex(headers, [/^monto$/, /^importe$/, /^valor$/]);
  const balanceIndex = resolveColumnIndex(headers, [/saldo/, /balance/, /disponible/]);

  const date = toIsoDate(dateIndex >= 0 ? row[dateIndex] : parseDateFromLine(row.join(' ')));
  const expense = expenseIndex >= 0 && !isBlankLikeCell(row[expenseIndex]) ? parseAmountToken(row[expenseIndex]) : null;
  const income = incomeIndex >= 0 && !isBlankLikeCell(row[incomeIndex]) ? parseAmountToken(row[incomeIndex]) : null;

  let direction: 'income' | 'expense' | null = null;
  let movementKind: 'expense' | 'income' | 'abono' | null = null;
  let amount: number | null = null;
  let amountToken = '';

  if (income !== null && Math.abs(income) > 0) {
    const semantics = inferMovementSemantics(row.join(' '), income, row[incomeIndex], productType);
    direction = semantics.direction;
    movementKind = semantics.kind;
    amount = Math.abs(income);
    amountToken = row[incomeIndex];
  } else if (expense !== null && Math.abs(expense) > 0) {
    const semantics = inferMovementSemantics(row.join(' '), expense, row[expenseIndex], productType);
    direction = semantics.direction;
    movementKind = semantics.kind;
    amount = Math.abs(expense);
    amountToken = row[expenseIndex];
  } else {
    const fallbackIndexes = [amountIndex, row.length - 1, row.length - 2].filter(
      (index, position, list) => index >= 0 && list.indexOf(index) === position && index !== balanceIndex,
    );
    const picked = pickAmountFromCells(row, fallbackIndexes);
    if (picked.amount === null) return null;
    if (picked.index === balanceIndex) return null;
    const semantics = inferMovementSemantics(row.join(' '), picked.amount, picked.token, productType);
    direction = semantics.direction;
    movementKind = semantics.kind;
    amount = Math.abs(picked.amount);
    amountToken = picked.token;
  }

  const description =
    descriptionIndex >= 0
      ? cleanMovementDescription(row[descriptionIndex])
      : cleanMovementDescription(
          row
            .filter((cell, index) => index !== dateIndex && cell !== amountToken)
            .join(' '),
        );

  if (!description || isNonMovementDescription(description) || !date || !amount || amount <= 0) return null;
  const taxonomy = inferTransactionTaxonomy(description);

  return {
    date,
    description,
    amount,
    direction,
    movement_kind: movementKind ?? direction,
    source_line: row.join(' | ').slice(0, 260),
    category: taxonomy.category,
    merchant: taxonomy.merchant,
    category_confidence: taxonomy.categoryConfidence,
    confidence: descriptionIndex >= 0 && (expenseIndex >= 0 || incomeIndex >= 0 || amountIndex >= 0) ? 0.98 : 0.86,
    source_kind: 'table',
  };
}

function parseMovementFromLooseLine(line: string, productType?: string): ParsedMovement | null {
  if (!line || isNonMovementDescription(line)) return null;
  const cells = splitCandidateCells(line);
  const amountTokens =
    line.match(/[-+]?\s*(?:\$|clp|usd|uf|eur)?\s*\d{1,3}(?:[.\s]\d{3})+(?:[.,]\d+)?|[-+]?\s*(?:\$|clp|usd|uf|eur)\s*\d+(?:[.,]\d+)?/gi) ?? [];
  let pickedToken = '';
  let signedAmount: number | null = null;
  for (const token of amountTokens) {
    const parsed = parseAmountToken(token);
    if (parsed === null) continue;
    signedAmount = parsed;
    pickedToken = token;
  }
  if (signedAmount === null) return null;
  const date = parseDateFromLine(line);
  if (!date) return null;
  const direction = inferMovementDirection(line, signedAmount, pickedToken, productType);
  const movementKind = inferMovementKind(line, signedAmount, pickedToken, productType);
  const descriptionBase =
    cells.length >= 3
      ? cells.filter((cell) => cell !== pickedToken && !toIsoDate(cell)).join(' ')
      : line.replace(new RegExp(escapeRegex(pickedToken), 'i'), ' ');
  const description = cleanMovementDescription(descriptionBase);
  if (!description || isNonMovementDescription(description)) return null;
  const taxonomy = inferTransactionTaxonomy(description);
  return {
    date,
    description,
    amount: Math.abs(signedAmount),
    direction,
    movement_kind: movementKind,
    source_line: line.slice(0, 260),
    category: taxonomy.category,
    merchant: taxonomy.merchant,
    category_confidence: taxonomy.categoryConfidence,
    confidence: cells.length >= 3 ? 0.8 : 0.68,
    source_kind: 'line',
  };
}

function normalizeProductType(value?: string): string | undefined {
  const source = String(value ?? '').trim().toLowerCase();
  if (!source) return undefined;
  if (PRODUCT_TYPES.has(source)) return source;
  if (/\btarjeta\b|\bcredit/.test(source)) return 'credit_card';
  if (/\bcuenta\s*corriente\b/.test(source)) return 'checking_account';
  if (/\bcuenta\s*vista\b|\bd[eé]bito\b|\brut\b/.test(source)) return 'debit_account';
  if (/\bahorro\b|\bsavings\b|\bdep[oó]sito\b/.test(source)) return 'savings_account';
  if (/\bhipotec/.test(source)) return 'mortgage';
  if (/\bconsumo\b|\bloan\b|\bl[ií]nea\b/.test(source)) return 'consumer_loan';
  if (/\binversi[oó]n\b|\bfondo\b|\betf\b|\bbroker/.test(source)) return 'investment_account';
  return undefined;
}

function inferCurrency(documents: ParsedDocumentResponse[]): string {
  const text = documents.map((doc) => doc.text ?? '').join('\n');
  const upper = text.toUpperCase();

  // Count affirmative signals per currency. CLP is the default for Chilean
  // financial documents; USD/UF/EUR must clearly dominate to override it.
  // We distinguish "MONTO CLP" / explicit $ amounts from incidental USD mentions
  // such as exchange-rate notes ("tipo de cambio USD: $ 980").
  const clpHits =
    (upper.match(/\bCLP\b/g) ?? []).length +
    (text.match(/\bpesos?\b/gi) ?? []).length +
    (text.match(/MONTO\s+CLP|EN\s+CLP|MONEDA\s+CLP/gi) ?? []).length;

  const usdHits = (upper.match(/\bUSD\b|US\$|U\.S\.\$/g) ?? []).length;
  const ufHits = (upper.match(/\bUF\b/g) ?? []).length + (text.match(/unidad\s+de\s+fomento/gi) ?? []).length;
  const eurHits = (upper.match(/\bEUR\b|€/g) ?? []).length;

  // Foreign currency wins only when it clearly outnumbers CLP signals.
  if (clpHits > 0 && clpHits >= usdHits && clpHits >= ufHits && clpHits >= eurHits) return 'CLP';
  if (usdHits > ufHits && usdHits > eurHits && usdHits > clpHits) return 'USD';
  if (ufHits > usdHits && ufHits > eurHits) return 'UF';
  if (eurHits > usdHits) return 'EUR';
  return 'CLP';
}

function extractMovements(documents: ParsedDocumentResponse[], productType?: string): ParsedMovement[] {
  const dedup = new Set<string>();
  const movements: ParsedMovement[] = [];

  for (const doc of documents) {
    const structured = (doc.structuredData as {
      possibleTransactions?: unknown;
      tables?: unknown;
    } | null | undefined) ?? {};
    const tables = Array.isArray(structured.tables)
      ? structured.tables as Array<{ headers?: unknown; rows?: unknown }>
      : [];

    const countBefore = movements.length;
    for (const table of tables) {
      const headers = Array.isArray(table.headers) ? table.headers.map((cell) => String(cell ?? '')) : [];
      const rows = Array.isArray(table.rows) ? table.rows : [];
      for (const row of rows) {
        const parsed = parseMovementFromTableRow({
          headers,
          row: Array.isArray(row) ? row.map((cell) => String(cell ?? '')) : [],
          productType,
        });
        if (!parsed) continue;
        const key = buildMovementKey(parsed);
        if (dedup.has(key)) continue;
        dedup.add(key);
        movements.push(parsed);
      }
    }
    const tableMovementsFromDoc = movements.length - countBefore;

    // If structured table extraction yielded a meaningful number of movements,
    // skip loose-line parsing for this document. Running both would produce
    // near-duplicate entries with slightly different descriptions or amounts
    // (e.g. the saldo column leaking into the parsed amount), inflating totals.
    const skipLooseLines = tableMovementsFromDoc >= 3;

    if (!skipLooseLines) {
      const candidateLines = Array.isArray(structured.possibleTransactions)
        ? structured.possibleTransactions.map((line) => String(line ?? '').trim()).filter(Boolean)
        : doc.text
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0 && !line.startsWith('---') && !line.startsWith('['))
            .slice(0, 220);

      for (const line of candidateLines) {
        const parsed = parseMovementFromLooseLine(line, productType);
        if (!parsed) continue;
        const key = buildMovementKey(parsed);
        if (dedup.has(key)) continue;
        dedup.add(key);
        movements.push(parsed);
      }
    }
  }
  return movements
    .sort((left, right) => {
      const dateCompare = String(left.date ?? '').localeCompare(String(right.date ?? ''));
      if (dateCompare !== 0) return dateCompare;
      if (left.amount !== right.amount) return right.amount - left.amount;
      return left.description.localeCompare(right.description, 'es');
    })
    .slice(0, 1200);
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sorted[base + 1] ?? sorted[base];
  return sorted[base] + rest * (next - sorted[base]);
}

export function categorizeTransactionDescription(description: string): string {
  return inferTransactionTaxonomy(description).category;
}

function buildTransactionAnalysis(
  documents: ParsedDocumentResponse[],
  hints: {
    institutionHint?: string;
    serviceHint?: string;
    productTypeHint?: string;
    productLabelHint?: string;
  },
  ) {
  const normalizedProductType =
    normalizeMovementProductType(hints.productTypeHint) ||
    normalizeMovementProductType(hints.serviceHint) ||
    normalizeMovementProductType(hints.productLabelHint) ||
    'credit_card';
  const documentInsights = documents.map((doc) => {
    const structured = (doc.structuredData as {
      rowCount?: unknown;
      possibleTransactionCount?: unknown;
      parserMeta?: { confidence?: unknown; mode?: unknown };
    } | null | undefined) ?? {};
    const summary = (doc.summary as { detectedSignals?: unknown } | null | undefined) ?? {};
    const extractedRows = Math.max(0, Number(structured.possibleTransactionCount ?? 0) || 0);
    const rowCount = Math.max(extractedRows, Number(structured.rowCount ?? 0) || 0);
    const parserConfidence = Number(structured.parserMeta?.confidence ?? 0) || 0;
    const baseReliability = rowCount > 0 ? Math.min(0.99, Math.max(0.28, extractedRows / rowCount + 0.25)) : 0.35;
    const reliability = parserConfidence > 0
      ? Math.min(0.99, Math.max(baseReliability, parserConfidence))
      : baseReliability;
    const keyFindings = Array.isArray(summary.detectedSignals)
      ? summary.detectedSignals.slice(0, 3).map((signal) => String(signal))
      : [];
    return {
      name: doc.name,
      format: doc.name.split('.').pop()?.toLowerCase() || undefined,
      reliability: Number(reliability.toFixed(4)),
      extracted_rows: extractedRows,
      key_findings: keyFindings,
      row_count: rowCount,
    };
  });

  const movements = extractMovements(documents, normalizedProductType);
  return buildTransactionAnalysisFromMovements(documents, hints, documentInsights, movements, normalizedProductType);
}

function buildTransactionAnalysisFromMovements(
  documents: ParsedDocumentResponse[],
  hints: {
    institutionHint?: string;
    serviceHint?: string;
    productTypeHint?: string;
    productLabelHint?: string;
  },
  documentInsights: Array<{
    name: string;
    format?: string;
    reliability: number;
    extracted_rows: number;
    key_findings: string[];
    row_count: number;
  }>,
  movements: ParsedMovement[],
  productType?: string,
) {
  const incomeMovements = movements.filter((movement) => movement.direction === 'income');
  const abonoMovements = movements.filter((movement) => movement.movement_kind === 'abono');
  const expenseMovements = movements.filter((movement) => movement.direction === 'expense');
  const inflowsTotal = incomeMovements.reduce((acc, movement) => acc + movement.amount, 0);
  const abonosTotal = abonoMovements.reduce((acc, movement) => acc + movement.amount, 0);
  const outflowsTotal = expenseMovements.reduce((acc, movement) => acc + movement.amount, 0);
  const movementCount = movements.length;
  const netFlow = inflowsTotal - outflowsTotal;
  const avgMovement = movementCount > 0 ? (inflowsTotal + outflowsTotal) / movementCount : 0;
  const sortedAbs = movements.map((movement) => movement.amount).sort((a, b) => a - b);
  const medianMovement = quantile(sortedAbs, 0.5);
  const p90Movement = quantile(sortedAbs, 0.9);
  const maxIncome = incomeMovements.reduce((max, movement) => Math.max(max, movement.amount), 0);
  const maxExpense = expenseMovements.reduce((max, movement) => Math.max(max, movement.amount), 0);
  const expenseToIncomeRatio = inflowsTotal > 0 ? outflowsTotal / inflowsTotal : undefined;

  const categoryMap = new Map<string, { amount: number; txCount: number; examples: Set<string> }>();
  const merchantMap = new Map<string, { amount: number; txCount: number; category: string }>();
  for (const movement of expenseMovements) {
    const name = categorizeTransactionDescription(movement.description);
    const bucket = categoryMap.get(name) ?? { amount: 0, txCount: 0, examples: new Set<string>() };
    bucket.amount += movement.amount;
    bucket.txCount += 1;
    if (movement.description) bucket.examples.add(movement.description);
    categoryMap.set(name, bucket);
    if (movement.merchant) {
      const merchantBucket = merchantMap.get(movement.merchant) ?? {
        amount: 0,
        txCount: 0,
        category: movement.category || name,
      };
      merchantBucket.amount += movement.amount;
      merchantBucket.txCount += 1;
      merchantMap.set(movement.merchant, merchantBucket);
    }
  }
  const topCategoryEntries = Array.from(categoryMap.entries())
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 8);
  const expenseBase = topCategoryEntries.reduce((acc, category) => acc + category.amount, 0);

  const topCategories = topCategoryEntries.map((category) => ({
    name: category.name,
    amount: Math.round(category.amount),
  }));
  const categoryExamples = topCategoryEntries.map((category) => ({
    name: category.name,
    amount: Math.round(category.amount),
    examples: Array.from(category.examples).slice(0, 3),
  }));
  const spendClusters = topCategoryEntries.map((category) => ({
    name: category.name,
    amount: Math.round(category.amount),
    tx_count: category.txCount,
    avg_ticket: category.txCount > 0 ? Math.round(category.amount / category.txCount) : 0,
    share_pct: expenseBase > 0 ? Number(((category.amount / expenseBase) * 100).toFixed(2)) : 0,
    examples: Array.from(category.examples).slice(0, 3),
  }));
  const topMerchants = Array.from(merchantMap.entries())
    .map(([merchant, data]) => ({
      merchant,
      category: data.category,
      amount: Math.round(data.amount),
      tx_count: data.txCount,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 8);
  const avgCategoryConfidence =
    movements.length > 0
      ? movements.reduce((acc, movement) => acc + (Number(movement.category_confidence ?? 0) || 0), 0) / movements.length
      : 0;

  const topExpenses = [...expenseMovements]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10)
    .map((movement) => ({
      label: movement.description,
      amount: Math.round(movement.amount),
      date: movement.date,
    }));
  const topIncome = [...incomeMovements]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10)
    .map((movement) => ({
      label: movement.description,
      amount: Math.round(movement.amount),
      date: movement.date,
    }));
  const hasAbonoMovements = abonoMovements.length > 0;
  const hasIncomeMovements = incomeMovements.some((movement) => movement.movement_kind === 'income');
  const inflowLabel = hasAbonoMovements
    ? hasIncomeMovements
      ? 'Abonos e ingresos'
      : 'Abonos'
    : 'Ingresos';

  const dated = movements
    .map((movement) => movement.date)
    .filter((date): date is string => Boolean(date))
    .sort((a, b) => a.localeCompare(b));
  const period = {
    from: dated[0],
    to: dated[dated.length - 1],
  };

  const rowsProcessed = documentInsights.reduce((acc, insight) => acc + (Number(insight.row_count) || 0), 0);
  const qualityAverage = documentInsights.length > 0
    ? documentInsights.reduce((acc, insight) => acc + (Number(insight.reliability) || 0), 0) / documentInsights.length
    : 0;
  const movementCoveragePct = rowsProcessed > 0 ? Math.min(100, (movementCount / rowsProcessed) * 100) : 0;
  const tableBasedMovements = movements.filter((movement) => movement.source_kind === 'table').length;
  const highConfidenceMovements = movements.filter((movement) => (movement.confidence ?? 0) >= 0.85).length;

  const alerts: string[] = [];
  const alertDetails: Array<{ title: string; severity: 'high' | 'medium' | 'low'; reason: string }> = [];
  if (movementCount === 0) {
    alerts.push('No se detectaron movimientos suficientes en los respaldos cargados.');
    alertDetails.push({
      title: 'Datos insuficientes',
      severity: 'medium',
      reason: 'No hubo filas transaccionales claras para estimar flujo financiero.',
    });
  }
  if (expenseToIncomeRatio !== undefined && expenseToIncomeRatio > 1.1) {
    alerts.push('Egresos por encima de ingresos en el periodo detectado.');
    alertDetails.push({
      title: 'Desbalance de flujo',
      severity: 'high',
      reason: `El ratio gasto/ingreso es ${(expenseToIncomeRatio * 100).toFixed(1)}%, sobre el umbral de equilibrio.`,
    });
  }
  if (spendClusters.length > 0 && spendClusters[0].share_pct >= 45) {
    alerts.push(`Alta concentración en ${spendClusters[0].name}.`);
    alertDetails.push({
      title: 'Concentración de gasto',
      severity: 'medium',
      reason: `${spendClusters[0].name} concentra ${spendClusters[0].share_pct.toFixed(1)}% del gasto detectado.`,
    });
  }
  if (qualityAverage > 0 && qualityAverage < 0.55) {
    alerts.push('Calidad de extracción baja; revisar nitidez/formato de respaldos.');
    alertDetails.push({
      title: 'Calidad OCR baja',
      severity: 'medium',
      reason: `Confiabilidad promedio ${Math.round(qualityAverage * 100)}%, recomendable reforzar evidencia.`,
    });
  }

  const opportunities = [
    expenseToIncomeRatio !== undefined && expenseToIncomeRatio > 1
      ? 'Priorizar recorte táctico en categorías de mayor peso para recuperar balance mensual.'
      : null,
    spendClusters.length > 0
      ? `Negociar o limitar gastos en ${spendClusters[0].name} para mejorar margen.`
      : null,
    qualityAverage > 0 && qualityAverage < 0.7
      ? 'Subir respaldos más nítidos o en Excel/CSV para mejorar precisión del diagnóstico.'
      : null,
  ].filter((item): item is string => Boolean(item));

  const metricExplanations = [
    {
      metric: 'Flujo neto',
      value: formatAmount(netFlow),
      explanation: 'Diferencia entre ingresos detectados y egresos detectados del periodo.',
    },
    {
      metric: 'Ratio gasto/ingreso',
      value: expenseToIncomeRatio !== undefined ? `${(expenseToIncomeRatio * 100).toFixed(1)}%` : 'N/D',
      explanation: 'Mide presión de gasto: sobre 100% implica déficit operativo.',
    },
    {
      metric: 'Cobertura tabular',
      value: movementCoveragePct > 0 ? `${movementCoveragePct.toFixed(1)}%` : 'N/D',
      explanation: 'Proporción de movimientos estructurados sobre filas procesadas.',
    },
    {
      metric: 'Filas fieles de tabla',
      value: movementCount > 0 ? `${Math.round((tableBasedMovements / movementCount) * 100)}%` : 'N/D',
      explanation: 'Porcentaje de movimientos reconstruidos desde tablas detectadas, no solo desde texto libre.',
    },
  ];

  const cleanedInstitutionHint = hints.institutionHint?.replace(/\s*\(simulaci[oó]n\)\s*/gi, '').trim() || '';
  const cleanedServiceHint = hints.serviceHint?.trim() || '';
  const cleanedProductLabelHint = hints.productLabelHint?.trim() || '';
  const institution = cleanedInstitutionHint || 'Institución por confirmar';
  const service = cleanedServiceHint || cleanedProductLabelHint || 'Producto financiero';
  const normalizedProductType =
    normalizeMovementProductType(productType) ||
    normalizeMovementProductType(hints.productTypeHint) ||
    normalizeMovementProductType(cleanedServiceHint) ||
    normalizeMovementProductType(cleanedProductLabelHint) ||
    'credit_card';
  const productLabel = cleanedProductLabelHint || service;

  return {
    product_profile: {
      institution,
      service,
      product_type: normalizedProductType,
      product_label: productLabel,
      period,
      currency: inferCurrency(documents),
      key_metrics: {
        inflows_total: Math.round(inflowsTotal),
        abonos_total: Math.round(abonosTotal),
        outflows_total: Math.round(outflowsTotal),
        net_flow: Math.round(netFlow),
        avg_movement: Math.round(avgMovement),
        movement_count: movementCount,
        median_movement: Math.round(medianMovement),
        p90_movement: Math.round(p90Movement),
        max_income: Math.round(maxIncome),
        max_expense: Math.round(maxExpense),
        expense_to_income_ratio: expenseToIncomeRatio,
        table_rows_processed: rowsProcessed,
        movement_coverage_pct: Number(movementCoveragePct.toFixed(2)),
        table_rows_verified: tableBasedMovements,
        high_confidence_movement_count: highConfidenceMovements,
        avg_category_confidence: Number(avgCategoryConfidence.toFixed(4)),
      },
      top_categories: topCategories,
      top_merchants: topMerchants,
      category_examples: categoryExamples,
      spend_clusters: spendClusters,
      top_expenses: topExpenses,
      top_income: topIncome,
      alerts,
      alert_details: alertDetails,
      opportunities,
      metric_explanations: metricExplanations,
      executive_summary: buildExecutiveSummaryText({
        movementCount,
        tableBasedMovements,
        inflowsTotal,
        outflowsTotal,
        netFlow,
        inflowLabel,
        topCategories,
        topMerchants,
        alerts,
        period,
        formatAmount,
      }),
    },
    document_insights: documentInsights.map(({ row_count, ...rest }) => rest),
    movements: movements.map((movement) => ({
      date: movement.date,
      description: movement.description,
      amount: Math.round(movement.amount),
      direction: movement.direction,
      movement_kind: movement.movement_kind,
      source_line: movement.source_line,
      category: movement.category,
      merchant: movement.merchant,
      category_confidence: movement.category_confidence,
      confidence: movement.confidence,
      source_kind: movement.source_kind,
    })),
  };
}

async function reconcileMovementsWithLLM(
  documents: ParsedDocumentResponse[],
  heuristicMovements: ParsedMovement[],
  productType?: string,
): Promise<ParsedMovement[] | null> {
  const tablePayload = documents
    .flatMap((doc) => {
      const structured = (doc.structuredData as { tables?: StructuredTableForReconciliation[] } | null | undefined) ?? {};
      return Array.isArray(structured.tables)
        ? structured.tables.map((table) => ({
            document: doc.name,
            name: String(table.name ?? ''),
            headers: Array.isArray(table.headers) ? table.headers.slice(0, 12) : [],
            rows: Array.isArray(table.rows) ? table.rows.slice(0, 120).map((row) => Array.isArray(row) ? row.slice(0, 12) : []) : [],
            source: table.source ?? null,
          }))
        : [];
    })
    .filter((table) => Array.isArray(table.rows) && table.rows.length > 0)
    .slice(0, 6);

  if (tablePayload.length === 0) return null;

  try {
    const reconciled = await completeStructured<{
      movements?: Array<{
        date?: string;
        description: string;
        amount: number;
        direction: 'income' | 'expense';
        category?: string;
      }>;
    }>({
      model: process.env.TRANSACTIONS_RECONCILE_MODEL || 'gpt-5.2',
      temperature: 0,
      maxCompletionTokens: 1200,
      system:
        'Reconcilia tablas de cartolas bancarias chilenas. Devuelve solo movimientos reales. Excluye saldos, subtotales, resúmenes, cupos, pagos mínimos y encabezados repetidos. Respeta signo, columnas cargo/abono y contexto contable.',
      user: JSON.stringify({
        instructions: [
          'Devuelve solo JSON con movements.',
          'Cada movement debe incluir date, description, amount absoluto y direction.',
          'Si una fila tiene signo negativo o está en columna cargo/debito, normalmente es expense.',
          'Si una fila está en columna abono/credito/haber, normalmente es income.',
          'No inventes filas faltantes.',
        ],
        tables: tablePayload,
        heuristicSample: heuristicMovements.slice(0, 40),
      }),
    });

    const candidateMovements = Array.isArray(reconciled.movements) ? reconciled.movements : [];
    const normalized = candidateMovements
      .map((movement) => {
        const description = cleanMovementDescription(movement.description ?? '');
        const taxonomy = inferTransactionTaxonomy(description);
        return {
          date: movement.date ? toIsoDate(movement.date) : undefined,
          description,
          amount: Math.abs(Number(movement.amount) || 0),
          direction: inferMovementDirection(description, Number(movement.amount) || 0, '', productType),
          movement_kind: inferMovementKind(description, Number(movement.amount) || 0, '', productType),
          source_line: '',
          category: movement.category ? String(movement.category) : taxonomy.category,
          merchant: taxonomy.merchant,
          category_confidence: taxonomy.categoryConfidence,
          confidence: 0.93,
          source_kind: 'table' as const,
        };
      })
      .filter((movement) => movement.description && movement.amount > 0);

    if (normalized.length === 0) return null;
    return normalized;
  } catch {
    return null;
  }
}

router.post(
  '/parse',
  requireAuth,
  requirePermission(PERMISSIONS.DOCUMENT_PARSE_SELF),
  asyncHandler(async (req, res) => {
    const user = req.authenticatedUser;
    if (!user) throw unauthorized('Authentication required');

    const body = parseBody(ParseRequestSchema, req.body);

    if (body.files.length === 0) {
      throw badRequest('Se requieren archivos (files: [{ name, base64 }])');
    }

    const decodedFiles = validateAndPrepareDocumentFiles(body.files);

    const documents: ParsedDocumentResponse[] = await Promise.all(
      decodedFiles.map(async (file) => {
        try {
          return await ingestUserDocument({
            userId: user.id,
            name: file.name,
            buffer: file.buffer,
            mimeType: file.mimeType,
            skipVectorIndexing: body.fastParse === true,
          });
        } catch (firstErr) {
          await new Promise((resolve) => setTimeout(resolve, 600));
          try {
            return await ingestUserDocument({
              userId: user.id,
              name: file.name,
              buffer: file.buffer,
              mimeType: file.mimeType,
              skipVectorIndexing: body.fastParse === true,
            });
          } catch (retryErr) {
            console.error(`[parse] ingestUserDocument failed for "${file.name}" after retry:`, retryErr);
            throw retryErr;
          }
        }
      }),
    );

    const heuristicAnalysis = buildTransactionAnalysis(documents, {
      institutionHint: body.institutionHint,
      serviceHint: body.serviceHint,
      productTypeHint: body.productTypeHint,
      productLabelHint: body.productLabelHint,
    });
    const productTypeForAnalysis =
      normalizeMovementProductType(body.productTypeHint) ||
      normalizeMovementProductType(body.serviceHint) ||
      normalizeMovementProductType(body.productLabelHint) ||
      'credit_card';
    const shouldReconcile = shouldReconcileMovements(documents, heuristicAnalysis.movements ?? []);
    const reconciledMovements = shouldReconcile
      ? await reconcileMovementsWithLLM(documents, heuristicAnalysis.movements ?? [], productTypeForAnalysis)
      : null;
    const transactionAnalysis = reconciledMovements
      ? buildTransactionAnalysisFromMovements(
          documents,
          {
            institutionHint: body.institutionHint,
            serviceHint: body.serviceHint,
            productTypeHint: body.productTypeHint,
            productLabelHint: body.productLabelHint,
          },
          documents.map((doc) => {
            const structured = (doc.structuredData as {
              rowCount?: unknown;
              possibleTransactionCount?: unknown;
              parserMeta?: { confidence?: unknown; mode?: unknown };
            } | null | undefined) ?? {};
            const summary = (doc.summary as { detectedSignals?: unknown } | null | undefined) ?? {};
            const extractedRows = Math.max(0, Number(structured.possibleTransactionCount ?? 0) || 0);
            const rowCount = Math.max(extractedRows, Number(structured.rowCount ?? 0) || 0);
            const parserConfidence = Number(structured.parserMeta?.confidence ?? 0) || 0;
            const baseReliability = rowCount > 0 ? Math.min(0.99, Math.max(0.28, extractedRows / rowCount + 0.25)) : 0.35;
            const reliability = parserConfidence > 0
              ? Math.min(0.99, Math.max(baseReliability, parserConfidence))
              : baseReliability;
            return {
              name: doc.name,
              format: doc.name.split('.').pop()?.toLowerCase() || undefined,
              reliability: Number(reliability.toFixed(4)),
              extracted_rows: extractedRows,
              key_findings: Array.isArray(summary.detectedSignals)
                ? summary.detectedSignals.slice(0, 3).map((signal) => String(signal))
                : [],
              row_count: rowCount,
            };
          }),
          reconciledMovements,
          productTypeForAnalysis,
        )
      : heuristicAnalysis;

    return sendSuccess(res, {
      documents,
      indexed: documents.filter((doc) => doc.indexed).length,
      transactionAnalysis,
    });
  }),
);

router.post(
  '/resolve',
  requireAuth,
  requirePermission(PERMISSIONS.DOCUMENT_PARSE_SELF),
  asyncHandler(async (req, res) => {
    const user = req.authenticatedUser;
    if (!user) throw unauthorized('Authentication required');

    const { documentIds } = parseBody(ResolveDocumentsSchema, req.body);
    const documents = await getUserDocumentsByIds(user.id, documentIds);
    return sendSuccess(res, {
      documents: documents.map((doc) => ({
        documentId: doc.id,
        name: doc.name,
        text: doc.extractedText ?? doc.textPreview ?? '',
        summary: doc.summary ?? null,
        structuredData: doc.structuredData ?? null,
        indexed: doc.status === 'INDEXED',
      })),
    });
  }),
);

router.get(
  '/search',
  requireAuth,
  requirePermission(PERMISSIONS.DOCUMENT_PARSE_SELF),
  asyncHandler(async (req, res) => {
    const user = req.authenticatedUser;
    if (!user) throw unauthorized('Authentication required');

    const query = SearchQuerySchema.parse(req.query);
    const results = await searchUserDocumentContext(user.id, query.q, query.limit ?? 6);
    return sendSuccess(res, { results });
  }),
);

export default router;
