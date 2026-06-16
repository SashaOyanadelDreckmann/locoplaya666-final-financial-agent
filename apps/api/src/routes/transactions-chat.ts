import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { requireSpendableFincoins } from '../middleware/fincoin-guard';
import { asyncHandler } from '../middleware/errorHandler';
import { chargeFincoinOperation } from '../services/fincoin.service';
import { getConfig } from '../config';
import { parseBody } from '../http/parse';
import { getUserDocumentsByIds } from '../persistencia/repos';
import { CHAT_PIPELINES } from '@financial-agent/shared';
import { buildTransactionsFabricPromptBlock } from '../context-fabric/context-fabric.integration.helpers';

// Pipeline: see CHAT_PIPELINES.transactions — product-scoped movement analyst (not CoreAgent).
void CHAT_PIPELINES.transactions.id;

import {
  buildChatDashboardForQuestion,
  buildTransactionSuggestedFollowups,
  collectRetrievalSignalsUsed,
  compactChatHistory,
  compactDashboardForPrompt,
  compactDocumentsForPrompt,
  compactTxText,
  extractQuestionSignals,
  type MovementRow,
} from '@financial-agent/shared';
import { forbidden, notFound } from '../http/api.errors';
import { completeStructuredWithSchema } from '../services/llm.service';
import {
  movementKeysFromRetrieval,
  planTransactionsAssistantTurn,
} from '../services/transactions-chat-planner.service';
import { polishTransactionsAssistantCopy } from '../services/transactions-chat-writer.service';

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

function isIndicativeOrUnstructuredEvidence(
  dashboard: unknown,
  documents: Array<{ structuredData?: unknown; documentProfile?: unknown; summary?: unknown; text?: string }>,
) {
  const evidenceFidelity = (dashboard as { evidenceFidelity?: unknown } | null | undefined)?.evidenceFidelity;
  if (evidenceFidelity === 'indicative') return true;
  return documents.some((doc) => {
    const structured = (doc.structuredData as {
      tables?: unknown[];
      documentProfile?: { needs_rag?: boolean; confidence?: number };
    } | null | undefined) ?? null;
    const profile = doc.documentProfile as { needs_rag?: boolean; confidence?: number } | null | undefined;
    const hasTables = Array.isArray(structured?.tables) && structured.tables.length > 0;
    const needsRag = Boolean(profile?.needs_rag ?? structured?.documentProfile?.needs_rag);
    const lowConfidence = Number(profile?.confidence ?? structured?.documentProfile?.confidence ?? 0) < 0.9;
    const hasLongText = String(doc.text ?? '').trim().length > 0;
    return hasLongText && (!hasTables || needsRag || lowConfidence);
  });
}

const EVIDENCE_UPLOAD_CHAT_REDIRECT =
  'Este paso es solo para subir archivos. Cuando veas el resumen, continúa al paso 3 para preguntar sobre movimientos y el análisis.';

function isUploadAssistanceQuestion(question: string): boolean {
  const normalized = question.trim().toLowerCase();
  if (!normalized) return false;
  if (/\b(pdf|excel|csv|xlsx|foto|captura|imagen|texto|planilla)\b/.test(normalized)) return true;
  return /(subir|adjunt|archiv|cartola|evidencia|formato|peg|pegar|manual|captura|pantallazo|limite|l[ií]mite)/i.test(
    normalized,
  );
}

const TransactionChatRequestSchema = z.object({
  mode: z.enum(['summary', 'chat']).default('chat'),
  chatContext: z.enum(['evidence_upload', 'summary_analysis']).default('summary_analysis'),
  product: z.record(z.unknown()).default({}),
  parsedDocuments: z.array(ParsedDocumentSchema).max(20).default([]),
  dashboard: z.unknown().optional().nullable(),
  question: z.string().trim().max(600).default(''),
  currentSummary: z.string().trim().max(4000).default(''),
  feedback: z.string().trim().max(2000).default(''),
  messages: z.array(AssistantMessageSchema).max(50).default([]),
});

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

router.post(
  '/',
  requireAuth,
  requireSpendableFincoins('transactions.chat'),
  asyncHandler(async (req: Request, res: Response) => {
    const user = req.authenticatedUser;
    if (!user) {
      return res.status(401).json({ ok: false, error: 'Not authenticated' });
    }
    await chargeFincoinOperation(user.id, 'transactions.chat');
    const config = getConfig();
    assertCsrf(req);

    if (!config.OPENAI_API_KEY) {
      return res.status(500).json({ ok: false, error: 'OPENAI_API_KEY no configurada' });
    }

    const body = parseBody(TransactionChatRequestSchema, req.body);
    const mode = body.mode;
    const chatContext = body.chatContext;
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
    const expandDocumentContext = isIndicativeOrUnstructuredEvidence(dashboard, canonicalDocuments);

    const summaryModel = process.env.TRANSACTIONS_SUMMARY_MODEL || 'gpt-5.4-mini';
    const chatModel = process.env.TRANSACTIONS_CHAT_MODEL || 'gpt-5.4-mini';

    if (mode === 'summary') {
      const docsDigest = compactDocumentsForPrompt(canonicalDocuments, { maxDocs: 6, maxText: 1200 });
      const dashboardDigest = compactDashboardForPrompt(dashboard, { maxMovements: 80, maxMerchants: 10 });
      const prompt = [
        'Eres un analista senior de movimientos bancarios del mercado chileno.',
        'Genera un resumen ejecutivo editorial, breve y accionable (máx. 5 bloques, máx. 12 líneas).',
        'Formato obligatorio: separa bloques con una línea en blanco; cada bloque inicia con un título corto en su propia línea y debajo el contenido.',
        'Usa viñetas • cuando listes categorías, comercios o alertas.',
        'Prioriza dashboard estructurado sobre texto libre. No inventes datos.',
        `Producto=${JSON.stringify(product)}`,
        `Dashboard=${JSON.stringify(dashboardDigest)}`,
        `Resumen actual=${JSON.stringify(currentSummary)}`,
        `Feedback usuario=${JSON.stringify(feedback)}`,
        `Documentos=${JSON.stringify(docsDigest)}`,
      ].join('\n');
      const summarySchema = {
        type: 'object',
        additionalProperties: false,
        properties: {
          summary: { type: 'string' },
        },
        required: ['summary'],
      } as const;
      const response = await completeStructuredWithSchema<{ summary?: string }>({
        name: 'transactions_summary',
        description: 'Resume el estado analítico de transacciones.',
        model: summaryModel,
        temperature: 0.2,
        maxOutputTokens: 650,
        instructions: 'Responde en español y devuelve solo JSON estricto.',
        input: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        schema: summarySchema,
      });

      return res.json({
        ok: true,
        summary: compactTxText(response.summary ?? '', 8000),
        model: summaryModel,
      });
    }

    const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user');
    const retrievalQuestion = question || compactTxText(lastUserMessage?.text ?? '', 600);

    if (chatContext === 'evidence_upload' && mode === 'chat' && retrievalQuestion && !isUploadAssistanceQuestion(retrievalQuestion)) {
      return res.json({
        ok: true,
        assistant_text: EVIDENCE_UPLOAD_CHAT_REDIRECT,
        suggested_followups: [
          '¿Qué formatos puedo subir?',
          '¿Cuántos archivos admite este producto?',
        ],
        referenced_movement_keys: [],
        signals_used: [],
        retrieval_mode: 'overview',
        matched_count: 0,
        source: 'context-guard',
        model: 'deterministic',
      });
    }
    const dashboardDigest =
      buildChatDashboardForQuestion(dashboard, retrievalQuestion) ??
      compactDashboardForPrompt(dashboard, { maxMovements: 24, maxMerchants: 8 });

    const compactHistory = compactChatHistory(messages, 8, 500);
    const retrievalMeta =
      dashboardDigest &&
      typeof dashboardDigest === 'object' &&
      dashboardDigest !== null &&
      'retrieval' in dashboardDigest
        ? (dashboardDigest as {
            retrieval?: {
              mode?: 'targeted' | 'overview';
              matchedCount?: number;
              signals?: ReturnType<typeof extractQuestionSignals>;
            };
          }).retrieval
        : null;
    const retrievalMode = retrievalMeta?.mode ?? 'overview';
    const matchedCount = retrievalMeta?.matchedCount ?? 0;
    const retrievalSignals = retrievalMeta?.signals ?? extractQuestionSignals(retrievalQuestion);
    const signalsUsed = collectRetrievalSignalsUsed(retrievalSignals);
    const allMovements = Array.isArray((dashboard as { movements?: MovementRow[] } | null)?.movements)
      ? ((dashboard as { movements: MovementRow[] }).movements ?? [])
      : [];

    const deterministicPlan = planTransactionsAssistantTurn({
      question: retrievalQuestion,
      dashboard,
    });

    if (deterministicPlan) {
      const polished = await polishTransactionsAssistantCopy({
        deterministicReply: deterministicPlan.assistant_text,
        question: retrievalQuestion,
        retrievalMode: deterministicPlan.retrieval_mode,
        signals: retrievalSignals,
        matchedCount: deterministicPlan.matched_count,
      });
      return res.json({
        ok: true,
        assistant_text: compactTxText(polished?.reply ?? deterministicPlan.assistant_text, 1200),
        suggested_followups: deterministicPlan.suggested_followups.slice(0, 3),
        referenced_movement_keys: deterministicPlan.referenced_movement_keys.slice(0, 12),
        signals_used: deterministicPlan.signals_used,
        retrieval_mode: deterministicPlan.retrieval_mode,
        matched_count: deterministicPlan.matched_count,
        source: polished ? 'deterministic+writer' : 'deterministic',
        model: polished?.model ?? 'deterministic',
      });
    }

    const systemPrompt = [
      'Eres un asistente de transacciones financiero para Chile.',
      'Responde en español, tono profesional, máximo 5 oraciones.',
      'Usa el resumen, métricas agregadas y los movimientos recuperados.',
      retrievalMode === 'targeted'
        ? `Los movimientos incluidos fueron recuperados por relevancia a la pregunta (${matchedCount} coincidencias). Priorízalos.`
        : 'Los movimientos incluidos son una muestra representativa para preguntas generales.',
      'Si falta un dato puntual, dilo y pide el detalle exacto.',
      'Incluye hasta 3 preguntas de seguimiento útiles en suggested_followups.',
    ].join(' ');

    const docsDigest = compactDocumentsForPrompt(
      canonicalDocuments,
      expandDocumentContext ? { maxDocs: 8, maxText: 2400 } : { maxDocs: 4, maxText: 600 },
    );
    const fabricBlock = await buildTransactionsFabricPromptBlock(user.id);
    const contextBlock = [
      fabricBlock ? `${fabricBlock}\n` : '',
      `Producto=${JSON.stringify(product)}`,
      `Pregunta=${JSON.stringify(retrievalQuestion)}`,
      `Resumen=${JSON.stringify(currentSummary)}`,
      `Dashboard=${JSON.stringify(dashboardDigest)}`,
      `Documentos=${JSON.stringify(docsDigest)}`,
    ].join('\n');

    const chatSchema = {
      type: 'object',
      additionalProperties: false,
      properties: {
        assistant_text: { type: 'string' },
        suggested_followups: {
          type: 'array',
          items: { type: 'string' },
        },
        referenced_movement_keys: {
          type: 'array',
          items: { type: 'string' },
        },
      },
      required: ['assistant_text', 'suggested_followups', 'referenced_movement_keys'],
    } as const;
    const response = await completeStructuredWithSchema<{
      assistant_text?: string;
      suggested_followups?: string[];
      referenced_movement_keys?: string[];
    }>({
      name: 'transactions_chat_reply',
      description: 'Respuesta conversacional para el modal de transacciones.',
      model: chatModel,
      maxOutputTokens: 360,
      temperature: 0.3,
      instructions: systemPrompt,
      input: [
        {
          role: 'user',
          content: contextBlock,
        },
        ...compactHistory.map((message) => ({
          role: message.role as 'assistant' | 'user',
          content: message.text,
        })),
      ],
      schema: chatSchema,
    });

    const llmFollowups = Array.isArray(response.suggested_followups)
      ? response.suggested_followups.map((item) => compactTxText(item, 120)).filter(Boolean)
      : [];
    const fallbackFollowups = buildTransactionSuggestedFollowups(retrievalQuestion, dashboard, {
      retrievalMode,
    });
    const referencedKeys = Array.isArray(response.referenced_movement_keys)
      ? response.referenced_movement_keys.map((item) => compactTxText(item, 180)).filter(Boolean)
      : movementKeysFromRetrieval(retrievalQuestion, allMovements);

    return res.json({
      ok: true,
      assistant_text: compactTxText(response.assistant_text ?? '', 1200) || 'Listo.',
      suggested_followups: (llmFollowups.length > 0 ? llmFollowups : fallbackFollowups).slice(0, 3),
      referenced_movement_keys: referencedKeys.slice(0, 12),
      signals_used: signalsUsed,
      retrieval_mode: retrievalMode,
      matched_count: matchedCount,
      source: 'llm',
      model: chatModel,
    });
  }),
);

export default router;
