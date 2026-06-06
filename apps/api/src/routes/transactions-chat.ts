import { Router } from 'express';
import type { Request, Response } from 'express';
import OpenAI from 'openai';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { getConfig } from '../config';
import { parseBody } from '../http/parse';
import { getUserDocumentsByIds } from '../persistence/repos';
import {
  buildChatDashboardForQuestion,
  compactChatHistory,
  compactDashboardForPrompt,
  compactDocumentsForPrompt,
  compactTxText,
} from '@financial-agent/shared';
import { forbidden, notFound } from '../http/api.errors';

type AssistantMessage = {
  role?: 'assistant' | 'user';
  text?: string;
};

type ClientParsedDocument = {
  documentId?: string;
  name?: string;
  text?: string;
  insight?: unknown;
  summary?: unknown;
  structuredData?: unknown;
  documentProfile?: unknown;
};

type CanonicalParsedDocument = {
  documentId?: string;
  name: string;
  text: string;
  insight?: unknown;
  summary?: unknown;
  structuredData?: unknown;
  documentProfile?: unknown;
};

const router = Router();

const AssistantMessageSchema = z.object({
  role: z.enum(['assistant', 'user']).optional(),
  text: z.string().trim().max(1200).optional(),
});

const ParsedDocumentSchema = z.object({
  documentId: z.string().trim().max(120).optional(),
  name: z.string().trim().max(180).optional(),
  text: z.string().trim().max(4000).optional(),
  insight: z.unknown().optional(),
  summary: z.unknown().optional(),
  structuredData: z.unknown().optional(),
  documentProfile: z.unknown().optional(),
});

const TransactionChatRequestSchema = z.object({
  mode: z.enum(['summary', 'chat']).default('chat'),
  product: z.record(z.unknown()).default({}),
  parsedDocuments: z.array(ParsedDocumentSchema).max(20).default([]),
  dashboard: z.unknown().optional().nullable(),
  question: z.string().trim().max(600).default(''),
  currentSummary: z.string().trim().max(4000).default(''),
  feedback: z.string().trim().max(2000).default(''),
  messages: z.array(AssistantMessageSchema).max(50).default([]),
});

function safeParseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function parseCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const [rawKey, ...rawValue] = part.trim().split('=');
    if (rawKey === name) return rawValue.join('=');
  }
  return null;
}

function assertCsrf(req: Request) {
  const cookieName = process.env.CSRF_COOKIE_NAME?.trim() || 'csrf-token';
  const headerToken = req.get('x-csrf-token')?.trim();
  const cookieToken = parseCookieValue(req.get('cookie') ?? null, cookieName)?.trim();
  if (!headerToken || !cookieToken || headerToken !== cookieToken) {
    throw forbidden('CSRF token invalid or missing');
  }
}

function documentsFromClient(parsedDocuments: ClientParsedDocument[], maxText = 2600) {
  return parsedDocuments
    .slice(0, 8)
    .map((doc, index) => ({
      documentId: typeof doc?.documentId === 'string' ? doc.documentId.trim() : undefined,
      name: String(doc?.name ?? '').trim() || `documento-${index + 1}`,
      text: compactTxText(doc?.text ?? '', maxText),
      insight: doc?.insight ?? null,
      summary: doc?.summary ?? null,
      structuredData: doc?.structuredData ?? null,
      documentProfile: doc?.documentProfile ?? null,
    }))
    .filter(
      (doc) =>
        doc.name.length > 0 ||
        doc.text.length > 0 ||
        doc.summary !== null ||
        doc.structuredData !== null ||
        doc.documentProfile !== null ||
        doc.insight !== null,
    );
}

async function resolveCanonicalDocuments(
  userId: string,
  parsedDocuments: ClientParsedDocument[],
): Promise<CanonicalParsedDocument[]> {
  const docIds = Array.from(
    new Set(
      parsedDocuments
        .map((doc) => (typeof doc?.documentId === 'string' ? doc.documentId.trim() : ''))
        .filter(Boolean),
    ),
  ).slice(0, 20);

  if (docIds.length === 0) {
    return documentsFromClient(parsedDocuments);
  }

  const documents = await getUserDocumentsByIds(userId, docIds);
  if (documents.length === 0) {
    throw notFound('No se encontró evidencia documental válida para este producto');
  }
  const canonicalById = new Map<string, CanonicalParsedDocument>();
  for (const doc of documents) {
    canonicalById.set(doc.id, {
      documentId: doc.id,
      name: doc.name,
      text: compactTxText(doc.extractedText ?? doc.textPreview ?? '', 2600),
      summary: doc.summary ?? null,
      structuredData: doc.structuredData ?? null,
    });
  }
  const resolved: CanonicalParsedDocument[] = [];
  for (const doc of parsedDocuments) {
    const canonical = canonicalById.get(String(doc?.documentId ?? '').trim());
    if (!canonical) continue;
    resolved.push({
      documentId: canonical.documentId,
      name: canonical.name,
      text: canonical.text,
      summary: canonical.summary,
      structuredData: canonical.structuredData,
      documentProfile: doc?.documentProfile ?? canonical.documentProfile ?? null,
      insight: doc?.insight ?? null,
    });
  }
  return resolved.slice(0, 8);
}

function extractAssistantText(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return 'Listo.';
  if (trimmed.startsWith('{')) {
    const parsed = safeParseJson<{ assistant_text?: string }>(trimmed, {});
    const fromJson = compactTxText(parsed.assistant_text ?? '', 1200);
    if (fromJson) return fromJson;
  }
  return compactTxText(trimmed, 1200);
}

router.post(
  '/',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const user = req.authenticatedUser;
    if (!user) {
      return res.status(401).json({ ok: false, error: 'Not authenticated' });
    }
    const config = getConfig();
    assertCsrf(req);

    if (!config.OPENAI_API_KEY) {
      return res.status(500).json({ ok: false, error: 'OPENAI_API_KEY no configurada' });
    }

    const body = parseBody(TransactionChatRequestSchema, req.body);
    const mode = body.mode;
    const product = body.product;
    const parsedDocuments = body.parsedDocuments as ClientParsedDocument[];
    const dashboard = body.dashboard ?? null;
    const question = compactTxText(body.question, 600);
    const currentSummary = compactTxText(body.currentSummary, 4000);
    const feedback = compactTxText(body.feedback, 2000);
    const messages = body.messages as AssistantMessage[];

    const hasDocumentIds = parsedDocuments.some(
      (doc) => typeof doc?.documentId === 'string' && doc.documentId.trim().length > 0,
    );
    const canonicalDocuments =
      hasDocumentIds
        ? await resolveCanonicalDocuments(user.id, parsedDocuments)
        : documentsFromClient(parsedDocuments);

    const client = new OpenAI({ apiKey: config.OPENAI_API_KEY });
    const summaryModel = process.env.TRANSACTIONS_SUMMARY_MODEL || 'gpt-4.1-mini';
    const chatModel = process.env.TRANSACTIONS_CHAT_MODEL || process.env.OPENAI_MODEL_FAST || 'gpt-4o-mini';

    if (mode === 'summary') {
      const docsDigest = compactDocumentsForPrompt(canonicalDocuments, { maxDocs: 6, maxText: 1200 });
      const dashboardDigest = compactDashboardForPrompt(dashboard, { maxMovements: 80, maxMerchants: 10 });
      const prompt = [
        'Eres un analista senior de movimientos bancarios del mercado chileno.',
        'Genera un resumen ejecutivo breve, preciso y accionable (máx. 12 líneas).',
        'Prioriza dashboard estructurado sobre texto libre. No inventes datos.',
        'Devuelve JSON estricto: {"summary":"string"}',
        `Producto=${JSON.stringify(product)}`,
        `Dashboard=${JSON.stringify(dashboardDigest)}`,
        `Resumen actual=${JSON.stringify(currentSummary)}`,
        `Feedback usuario=${JSON.stringify(feedback)}`,
        `Documentos=${JSON.stringify(docsDigest)}`,
      ].join('\n');

      const response = await client.chat.completions.create({
        model: summaryModel,
        response_format: { type: 'json_object' },
        max_completion_tokens: 650,
        temperature: 0.2,
        messages: [
          { role: 'system', content: 'Responde solo JSON válido.' },
          { role: 'user', content: prompt },
        ],
      });

      const raw = response.choices[0]?.message?.content?.trim() ?? '{}';
      const parsed = safeParseJson<{ summary?: string }>(raw, {});
      return res.json({
        ok: true,
        summary: compactTxText(parsed.summary ?? '', 8000),
        model: summaryModel,
      });
    }

    const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user');
    const retrievalQuestion = question || compactTxText(lastUserMessage?.text ?? '', 600);
    const dashboardDigest =
      buildChatDashboardForQuestion(dashboard, retrievalQuestion) ??
      compactDashboardForPrompt(dashboard, { maxMovements: 24, maxMerchants: 8 });

    const compactHistory = compactChatHistory(messages, 8, 500);
    const retrievalMeta =
      dashboardDigest &&
      typeof dashboardDigest === 'object' &&
      dashboardDigest !== null &&
      'retrieval' in dashboardDigest
        ? (dashboardDigest as { retrieval?: { mode?: string; matchedCount?: number } }).retrieval
        : null;

    const systemPrompt = [
      'Eres un asistente de transacciones financiero para Chile.',
      'Responde en español, tono profesional, máximo 4 oraciones.',
      'Usa el resumen, métricas agregadas y los movimientos recuperados.',
      retrievalMeta?.mode === 'targeted'
        ? `Los movimientos incluidos fueron recuperados por relevancia a la pregunta (${retrievalMeta.matchedCount ?? 0} coincidencias). Priorízalos.`
        : 'Los movimientos incluidos son una muestra representativa para preguntas generales.',
      'Si falta un dato puntual, dilo y pide el detalle exacto.',
    ].join(' ');

    const docsDigest = compactDocumentsForPrompt(canonicalDocuments, { maxDocs: mode === 'chat' ? 4 : 6, maxText: mode === 'chat' ? 600 : 1200 });
    const contextBlock = [
      `Producto=${JSON.stringify(product)}`,
      `Pregunta=${JSON.stringify(retrievalQuestion)}`,
      `Resumen=${JSON.stringify(currentSummary)}`,
      `Dashboard=${JSON.stringify(dashboardDigest)}`,
      `Documentos=${JSON.stringify(docsDigest)}`,
    ].join('\n');

    const response = await client.chat.completions.create({
      model: chatModel,
      max_completion_tokens: 180,
      temperature: 0.3,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: contextBlock },
        ...compactHistory.map((message) => ({
          role: message.role as 'assistant' | 'user',
          content: message.text,
        })),
      ],
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? '';
    return res.json({
      ok: true,
      assistant_text: extractAssistantText(raw),
      model: chatModel,
      retrieval_mode: retrievalMeta?.mode ?? 'overview',
    });
  }),
);

export default router;
