import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { requireBackendSession } from '@/lib/serverAuth';
import { checkRateLimit } from '@/lib/rateLimit';
import { getServerEnv } from '@/lib/serverEnv';
import { getServerApiBaseUrl } from '@/lib/apiBase';
import {
  buildChatDashboardForQuestion,
  compactChatHistory,
  compactDashboardForPrompt,
  compactDocumentsForPrompt,
  compactTxText,
} from '@/lib/transactions-chat.helpers';

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
};

type CanonicalParsedDocument = {
  documentId?: string;
  name: string;
  text: string;
  insight?: unknown;
  summary?: unknown;
  structuredData?: unknown;
};

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
  const headerToken = req.headers.get('x-csrf-token')?.trim();
  const cookieToken = parseCookieValue(req.headers.get('cookie'), cookieName)?.trim();
  if (!headerToken || !cookieToken || headerToken !== cookieToken) {
    throw new Error('CSRF token invalid or missing');
  }
}

function documentsFromClient(parsedDocuments: ClientParsedDocument[], maxText = 2600) {
  return parsedDocuments.slice(0, 8).map((doc) => ({
    documentId: typeof doc?.documentId === 'string' ? doc.documentId : undefined,
    name: String(doc?.name ?? ''),
    text: compactTxText(doc?.text ?? '', maxText),
    insight: doc?.insight ?? null,
    summary: doc?.summary ?? null,
    structuredData: doc?.structuredData ?? null,
  }));
}

async function resolveCanonicalDocuments(
  req: Request,
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

  const cookie = req.headers.get('cookie');
  const res = await fetch(`${getServerApiBaseUrl()}/api/documents/resolve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { cookie } : {}),
      ...(req.headers.get('x-csrf-token') ? { 'X-CSRF-Token': req.headers.get('x-csrf-token') as string } : {}),
    },
    body: JSON.stringify({ documentIds: docIds }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('No se pudo validar la evidencia documental');
  const payload = await res.json().catch(() => null);
  const documents = Array.isArray(payload?.data?.documents) ? payload.data.documents : [];
  if (documents.length === 0) {
    throw new Error('No se encontró evidencia documental válida para este producto');
  }
  const canonicalById = new Map<string, CanonicalParsedDocument>(
    documents.map((doc: { documentId?: string; name?: string; text?: string; summary?: unknown; structuredData?: unknown }) => [
      String(doc?.documentId ?? ''),
      {
        documentId: String(doc?.documentId ?? ''),
        name: String(doc?.name ?? ''),
        text: compactTxText(doc?.text ?? '', 2600),
        summary: doc?.summary ?? null,
        structuredData: doc?.structuredData ?? null,
      },
    ]),
  );
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

export async function POST(req: Request) {
  let session: { userId: string };
  try {
    session = await requireBackendSession(req);
  } catch {
    return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
  }

  const rl = checkRateLimit(`transactions-chat:${session.userId}`, 40, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } }
    );
  }

  try {
    assertCsrf(req);
    const apiKey = getServerEnv('OPENAI_API_KEY');
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: 'OPENAI_API_KEY no configurada' },
        { status: 500 }
      );
    }

    const body = await req.json();
    const mode = String(body?.mode ?? 'chat').trim();
    if (mode !== 'summary' && mode !== 'chat') {
      return NextResponse.json({ ok: false, error: 'Invalid mode' }, { status: 400 });
    }
    const product = body?.product ?? {};
    const parsedDocuments = (Array.isArray(body?.parsedDocuments) ? body.parsedDocuments : []) as ClientParsedDocument[];
    const dashboard = body?.dashboard ?? null;
    const question = compactTxText(body?.question ?? '', 600);
    const currentSummary = compactTxText(body?.currentSummary ?? '', 4000);
    const feedback = compactTxText(body?.feedback ?? '', 2000);
    const messages = (Array.isArray(body?.messages) ? body.messages : []) as AssistantMessage[];

    const hasDocumentIds = parsedDocuments.some(
      (doc) => typeof doc?.documentId === 'string' && doc.documentId.trim().length > 0,
    );
    const canonicalDocuments =
      mode === 'chat'
        ? documentsFromClient(parsedDocuments, 0)
        : hasDocumentIds
          ? await resolveCanonicalDocuments(req, parsedDocuments)
          : documentsFromClient(parsedDocuments);

    const client = new OpenAI({ apiKey });
    const summaryModel =
      getServerEnv('TRANSACTIONS_SUMMARY_MODEL') || getServerEnv('OPENAI_MODEL') || 'gpt-4o-mini';
    const chatModel =
      getServerEnv('TRANSACTIONS_CHAT_MODEL') || getServerEnv('OPENAI_MODEL_FAST') || 'gpt-4o-mini';

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
      return NextResponse.json({
        ok: true,
        summary: compactTxText(parsed.summary ?? '', 8000),
        model: summaryModel,
      });
    }

    const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user');
    const retrievalQuestion = question || compactTxText(lastUserMessage?.text ?? '', 600);
    const dashboardDigest =
      dashboard && typeof dashboard === 'object' && dashboard !== null && 'retrieval' in (dashboard as object)
        ? dashboard
        : buildChatDashboardForQuestion(dashboard, retrievalQuestion) ??
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

    const contextBlock = [
      `Producto=${JSON.stringify(product)}`,
      `Pregunta=${JSON.stringify(retrievalQuestion)}`,
      `Resumen=${JSON.stringify(currentSummary)}`,
      `Dashboard=${JSON.stringify(dashboardDigest)}`,
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
    return NextResponse.json({
      ok: true,
      assistant_text: extractAssistantText(raw),
      model: chatModel,
      retrieval_mode: retrievalMeta?.mode ?? 'overview',
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'transactions chat error' },
      { status: error instanceof Error && /CSRF token invalid or missing/i.test(error.message) ? 403 : 500 }
    );
  }
}
