/**
 * Ingiere documentos PDF/Excel/CSV/imagen subidos desde el chat.
 * Retorna texto extraído y deja memoria documental buscable por usuario.
 */

import { Router } from 'express';
import { z } from 'zod';
import { ingestUserDocument, searchUserDocumentContext } from '../services/document-intelligence.service';
import { requireAuth, requirePermission } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { badRequest, unauthorized } from '../http/api.errors';
import { sendSuccess } from '../http/api.responses';
import { parseBody } from '../http/parse';
import { PERMISSIONS } from '../auth/rbac';

const router = Router();

const MAX_PARSE_FILES = Math.max(1, Number.parseInt(process.env.DOCUMENT_PARSE_MAX_FILES || '25', 10) || 25);
const MAX_FILE_BYTES = Math.max(
  1024,
  Number.parseInt(process.env.DOCUMENT_PARSE_MAX_FILE_BYTES || `${10 * 1024 * 1024}`, 10) || 10 * 1024 * 1024,
);
const MAX_TOTAL_BYTES = Math.max(
  MAX_FILE_BYTES,
  Number.parseInt(process.env.DOCUMENT_PARSE_MAX_TOTAL_BYTES || `${35 * 1024 * 1024}`, 10) || 35 * 1024 * 1024,
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
});

const SearchQuerySchema = z.object({
  q: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(10).optional(),
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
  source_line?: string;
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

const CATEGORY_RULES: Array<{ name: string; regex: RegExp }> = [
  { name: 'Supermercado', regex: /jumbo|lider|unimarc|tottus|supermercad/i },
  { name: 'Transporte', regex: /uber|cabify|metro|copec|shell|bencina|combustible|peaje/i },
  { name: 'Servicios', regex: /agua|luz|electricidad|internet|movistar|entel|vtr|wom|gas|telefono/i },
  { name: 'Suscripciones', regex: /spotify|netflix|youtube|apple|google|amazon|subscription/i },
  { name: 'Salud', regex: /farmacia|clinica|isapre|fonasa|medic/i },
  { name: 'Educacion', regex: /colegio|universidad|matricula|educa/i },
  { name: 'Transferencias', regex: /transfer|tef|abono|deposito|dep[oó]sito/i },
  { name: 'Tarjetas', regex: /tarjeta|credito|d[eé]bito|compra nacional|compra internacional/i },
];

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

function parseAmountToken(token: string): number | null {
  if (!token) return null;
  if (/\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/.test(token)) return null;
  if (/[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(token) && !/\b(?:clp|usd|uf|eur|\$)\b/i.test(token)) return null;
  const cleaned = token.replace(/[^\d.,+-]/g, '').trim();
  if (!cleaned) return null;
  const sign = cleaned.startsWith('-') ? -1 : 1;
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

function inferDirection(line: string, signedAmount: number): 'income' | 'expense' {
  const normalized = line.toLowerCase();
  if (/\b(abono|ingreso|dep[oó]sito|sueldo|remuner|n[oó]mina|payroll|pensi[oó]n|honorari|pago recibido|transferencia recibida)\b/.test(normalized)) {
    return 'income';
  }
  if (/\b(compra|cargo|pago|retiro|comisi[oó]n|suscrip|cuota|giro|transferencia enviada|transferencia emitida)\b/.test(normalized)) {
    return 'expense';
  }
  return signedAmount < 0 ? 'expense' : 'income';
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
  const text = documents.map((doc) => doc.text ?? '').join('\n').toUpperCase();
  if (/\bUSD\b|US\$/i.test(text)) return 'USD';
  if (/\bUF\b/.test(text)) return 'UF';
  if (/\bEUR\b|€/.test(text)) return 'EUR';
  return 'CLP';
}

function extractMovements(documents: ParsedDocumentResponse[]): ParsedMovement[] {
  const dedup = new Set<string>();
  const movements: ParsedMovement[] = [];

  for (const doc of documents) {
    const structured = (doc.structuredData as {
      possibleTransactions?: unknown;
    } | null | undefined) ?? {};
    const candidateLines = Array.isArray(structured.possibleTransactions)
      ? structured.possibleTransactions.map((line) => String(line ?? '').trim()).filter(Boolean)
      : doc.text
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0 && !line.startsWith('---') && !line.startsWith('['))
          .slice(0, 180);

    for (const line of candidateLines) {
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
      if (signedAmount === null) continue;

      const date = parseDateFromLine(line);
      const direction = inferDirection(line, signedAmount);
      const amount = Math.abs(signedAmount);
      const withoutAmount = pickedToken ? line.replace(new RegExp(escapeRegex(pickedToken), 'i'), ' ') : line;
      const withoutDate = withoutAmount.replace(/\b(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\b/g, ' ');
      const description = withoutDate.replace(/\s+/g, ' ').trim() || line;
      const key = `${date || 'ND'}|${direction}|${Math.round(amount)}|${description.toUpperCase()}`;
      if (dedup.has(key)) continue;
      dedup.add(key);

      movements.push({
        date,
        description,
        amount,
        direction,
        source_line: line.slice(0, 260),
      });
    }
  }
  return movements.slice(0, 1200);
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sorted[base + 1] ?? sorted[base];
  return sorted[base] + rest * (next - sorted[base]);
}

function categorize(description: string): string {
  for (const rule of CATEGORY_RULES) {
    if (rule.regex.test(description)) return rule.name;
  }
  return 'Otros';
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
  const documentInsights = documents.map((doc) => {
    const structured = (doc.structuredData as {
      rowCount?: unknown;
      possibleTransactionCount?: unknown;
    } | null | undefined) ?? {};
    const summary = (doc.summary as { detectedSignals?: unknown } | null | undefined) ?? {};
    const extractedRows = Math.max(0, Number(structured.possibleTransactionCount ?? 0) || 0);
    const rowCount = Math.max(extractedRows, Number(structured.rowCount ?? 0) || 0);
    const reliability = rowCount > 0 ? Math.min(0.99, Math.max(0.28, extractedRows / rowCount + 0.25)) : 0.35;
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

  const movements = extractMovements(documents);
  const incomeMovements = movements.filter((movement) => movement.direction === 'income');
  const expenseMovements = movements.filter((movement) => movement.direction === 'expense');
  const inflowsTotal = incomeMovements.reduce((acc, movement) => acc + movement.amount, 0);
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
  for (const movement of expenseMovements) {
    const name = categorize(movement.description);
    const bucket = categoryMap.get(name) ?? { amount: 0, txCount: 0, examples: new Set<string>() };
    bucket.amount += movement.amount;
    bucket.txCount += 1;
    if (movement.description) bucket.examples.add(movement.description);
    categoryMap.set(name, bucket);
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
  ];

  const institution = hints.institutionHint?.trim() || 'Institución por confirmar';
  const service = hints.serviceHint?.trim() || hints.productLabelHint?.trim() || 'Producto financiero';
  const normalizedProductType =
    normalizeProductType(hints.productTypeHint) ||
    normalizeProductType(hints.serviceHint) ||
    normalizeProductType(hints.productLabelHint) ||
    'credit_card';
  const productLabel = hints.productLabelHint?.trim() || service;

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
      },
      top_categories: topCategories,
      category_examples: categoryExamples,
      spend_clusters: spendClusters,
      top_expenses: topExpenses,
      top_income: topIncome,
      alerts,
      alert_details: alertDetails,
      opportunities,
      metric_explanations: metricExplanations,
      executive_summary:
        movementCount === 0
          ? 'No hay movimientos suficientes para un resumen confiable. Se recomienda reforzar evidencia.'
          : `Se detectaron ${movementCount} movimientos: ingresos ${formatAmount(inflowsTotal)} y egresos ${formatAmount(outflowsTotal)}; flujo neto ${formatAmount(netFlow)}.`,
    },
    document_insights: documentInsights.map(({ row_count, ...rest }) => rest),
    movements: movements.map((movement) => ({
      date: movement.date,
      description: movement.description,
      amount: Math.round(movement.amount),
      direction: movement.direction,
      source_line: movement.source_line,
    })),
  };
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

    const documents: ParsedDocumentResponse[] = [];
    let totalBytes = 0;

    for (const file of body.files) {
      const buffer = Buffer.from(file.base64, 'base64');
      if (buffer.byteLength > MAX_FILE_BYTES) {
        throw badRequest(
          `Archivo "${file.name}" excede el límite de ${Math.round(MAX_FILE_BYTES / (1024 * 1024))} MB por archivo.`,
        );
      }
      totalBytes += buffer.byteLength;
      if (totalBytes > MAX_TOTAL_BYTES) {
        throw badRequest(
          `El total cargado supera ${Math.round(MAX_TOTAL_BYTES / (1024 * 1024))} MB. Divide los archivos en bloques.`,
        );
      }
      const document = await ingestUserDocument({
        userId: user.id,
        name: file.name,
        buffer,
        mimeType: file.mimeType,
      });
      documents.push(document);
    }

    const transactionAnalysis = buildTransactionAnalysis(documents, {
      institutionHint: body.institutionHint,
      serviceHint: body.serviceHint,
      productTypeHint: body.productTypeHint,
      productLabelHint: body.productLabelHint,
    });

    return sendSuccess(res, {
      documents,
      indexed: documents.filter((doc) => doc.indexed).length,
      transactionAnalysis,
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
