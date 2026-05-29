import { NextResponse } from 'next/server';
import OpenAI from 'openai';

type AssistantMessage = {
  role?: 'assistant' | 'user';
  text?: string;
};

function compactText(value: unknown, max = 16000) {
  return String(value ?? '').trim().slice(0, max);
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: 'OPENAI_API_KEY no configurada' }, { status: 500 });
    }

    const body = await req.json();
    const mode = String(body?.mode ?? 'chat').trim();
    const product = body?.product ?? {};
    const parsedDocuments = Array.isArray(body?.parsedDocuments) ? body.parsedDocuments : [];
    const dashboard = body?.dashboard ?? null;
    const currentSummary = compactText(body?.currentSummary ?? '', 8000);
    const feedback = compactText(body?.feedback ?? '', 4000);
    const messages = (Array.isArray(body?.messages) ? body.messages : []) as AssistantMessage[];

    const client = new OpenAI({ apiKey });
    const summaryModel = process.env.TRANSACTIONS_SUMMARY_MODEL || process.env.OPENAI_MODEL || 'gpt-5.1-codex';
    const chatModel = process.env.TRANSACTIONS_CHAT_MODEL || process.env.OPENAI_MODEL_FAST || 'gpt-4.1-mini';

    const docsDigest = parsedDocuments.slice(0, 8).map((doc: any) => ({
      name: String(doc?.name ?? ''),
      insight: doc?.insight ?? null,
      text: compactText(doc?.text ?? '', 2600),
    }));

    if (mode === 'summary') {
      const prompt = [
        'Eres un analista senior de movimientos bancarios.',
        'Debes generar un resumen ejecutivo premium, breve, preciso y accionable.',
        'Objetivo: explicar patrones, anomalías, flujo y puntos a revisar sin inventar datos.',
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
      const parsed = JSON.parse(raw) as { summary?: string };
      return NextResponse.json({ ok: true, summary: compactText(parsed.summary ?? '', 8000), model: summaryModel });
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
    const parsed = JSON.parse(raw) as { assistant_text?: string };
    return NextResponse.json({
      ok: true,
      assistant_text: compactText(parsed.assistant_text ?? 'Listo.', 1200),
      model: chatModel,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'transactions chat error' },
      { status: 500 },
    );
  }
}
