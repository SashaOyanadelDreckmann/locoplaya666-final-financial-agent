import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { requireBackendSession } from '@/lib/serverAuth';
import { checkRateLimit } from '@/lib/rateLimit';
import { getServerEnv } from '@/lib/serverEnv';
import { getApiBaseUrl } from '@/lib/apiBase';

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

function compactText(value: unknown, max = 16000) {
  return String(value ?? '')
    .trim()
    .slice(0, max);
}

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
    return parsedDocuments.slice(0, 8).map((doc) => ({
      documentId: typeof doc?.documentId === 'string' ? doc.documentId : undefined,
      name: String(doc?.name ?? ''),
      text: compactText(doc?.text ?? '', 2600),
      insight: doc?.insight ?? null,
      summary: doc?.summary ?? null,
      structuredData: doc?.structuredData ?? null,
    }));
  }

  const cookie = req.headers.get('cookie');
  const res = await fetch(`${getApiBaseUrl()}/api/documents/resolve`, {
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
    documents.map((doc: any) => [
      String(doc?.documentId ?? ''),
      {
        documentId: String(doc?.documentId ?? ''),
        name: String(doc?.name ?? ''),
        text: compactText(doc?.text ?? '', 2600),
        summary: doc?.summary ?? null,
        structuredData: doc?.structuredData ?? null,
      } satisfies CanonicalParsedDocument,
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

export async function POST(req: Request) {
  let session: { userId: string };
  try {
    session = await requireBackendSession(req);
  } catch {
    return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
  }

  const rl = checkRateLimit(`transactions-chat:${session.userId}`, 30, 60_000);
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
    const currentSummary = compactText(body?.currentSummary ?? '', 8000);
    const feedback = compactText(body?.feedback ?? '', 4000);
    const messages = (Array.isArray(body?.messages) ? body.messages : []) as AssistantMessage[];
    const canonicalDocuments = await resolveCanonicalDocuments(req, parsedDocuments);

    const client = new OpenAI({ apiKey });
    const summaryModel =
      getServerEnv('TRANSACTIONS_SUMMARY_MODEL') || getServerEnv('OPENAI_MODEL') || 'gpt-4.1';
    const chatModel =
      getServerEnv('TRANSACTIONS_CHAT_MODEL') || getServerEnv('OPENAI_MODEL_FAST') || 'gpt-4.1-mini';

    const docsDigest = canonicalDocuments.slice(0, 8).map((doc) => ({
      documentId: doc.documentId,
      name: String(doc?.name ?? ''),
      insight: doc?.insight ?? null,
      text: compactText(doc?.text ?? '', 2600),
    }));

    if (mode === 'summary') {
      const prompt = [
        'Eres un analista senior de movimientos bancarios del mercado chileno.',
        'Debes generar un resumen ejecutivo premium, breve, preciso y accionable.',
        'Objetivo: explicar patrones, anomalías, flujo y puntos a revisar sin inventar datos.',
        'Toma como fuente principal el Dashboard y la tabla de movimientos ya estructurada.',
        'Si hay conflicto entre texto libre y dashboard, prioriza dashboard y explicita cualquier duda en vez de asumir.',
        'Distingue claramente ingresos/abonos vs egresos.',
        'No llames movimiento a filas que parezcan saldo, subtotal, cupo, resumen, pago mínimo o encabezados.',
        'Categoriza comercios y giros con criterio financiero realista para Chile: supermercado, delivery, retail, telecom, servicios básicos, transporte, combustible, farmacia/salud, etc.',
        'Si el feedback del usuario apunta a una sección, cálculo o categorización, debes reanalizar esa parte y corregir el resumen completo si corresponde.',
        'Enfatiza fidelidad de la evidencia: cobertura, calidad y si la mayor parte proviene de tabla estructurada.',
        'Si el usuario reportó un posible error, reevalúa con ese foco.',
        'Devuelve JSON estricto: {"summary":"string"}',
        `Producto=${JSON.stringify(product)}`,
        `Dashboard=${JSON.stringify(dashboard)}`,
        `Resumen actual=${JSON.stringify(currentSummary)}`,
        `Feedback usuario=${JSON.stringify(feedback)}`,
        `Documentos=${JSON.stringify(docsDigest)}`,
      ].join('\n');

      const response = await client.chat.completions.create({
        model: summaryModel,
        response_format: { type: 'json_object' },
        max_completion_tokens: 900,
        messages: [
          { role: 'system', content: 'Responde solo JSON válido.' },
          { role: 'user', content: prompt },
        ],
      });

      const raw = response.choices[0]?.message?.content?.trim() ?? '{}';
      const parsed = safeParseJson<{ summary?: string }>(raw, {});
      return NextResponse.json({
        ok: true,
        summary: compactText(parsed.summary ?? '', 8000),
        model: summaryModel,
      });
    }

    const compactHistory = messages.slice(-10).map((message) => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      text: compactText(message.text ?? '', 800),
    }));

    const prompt = [
      'Eres un asistente de transacciones financiero claro y eficiente.',
      'Tu trabajo aquí es responder dudas sobre movimientos y el resumen ya generado.',
      'Usa tono profesional, breve y útil.',
      'Si faltan antecedentes, dilo y pide el dato exacto.',
      'No rehagas el resumen completo salvo que el usuario lo pida explícitamente.',
      'Devuelve JSON estricto: {"assistant_text":"string"}',
      `Producto=${JSON.stringify(product)}`,
      `Resumen=${JSON.stringify(currentSummary)}`,
      `Dashboard=${JSON.stringify(dashboard)}`,
      `Documentos=${JSON.stringify(docsDigest.slice(0, 4))}`,
      `Historial=${JSON.stringify(compactHistory)}`,
    ].join('\n');

    const response = await client.chat.completions.create({
      model: chatModel,
      response_format: { type: 'json_object' },
      max_completion_tokens: 220,
      messages: [
        { role: 'system', content: 'Responde solo JSON válido.' },
        { role: 'user', content: prompt },
      ],
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? '{}';
    const parsed = safeParseJson<{ assistant_text?: string }>(raw, {});
    return NextResponse.json({
      ok: true,
      assistant_text: compactText(parsed.assistant_text ?? 'Listo.', 1200),
      model: chatModel,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'transactions chat error' },
      { status: error instanceof Error && /CSRF token invalid or missing/i.test(error.message) ? 403 : 500 }
    );
  }
}
