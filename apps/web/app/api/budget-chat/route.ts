import { NextResponse } from 'next/server';
import OpenAI from 'openai';

type BudgetRow = {
  id: string;
  category: string;
  type: 'income' | 'expense';
  amount: number;
  note: string;
};

export async function POST(req: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: 'OPENAI_API_KEY no configurada' },
        { status: 500 },
      );
    }

    const body = await req.json();
    const answer = String(body?.answer ?? '').trim();
    const question = String(body?.question ?? '').trim();
    const rows = (Array.isArray(body?.budgetRows) ? body.budgetRows : []) as BudgetRow[];

    if (!answer) {
      return NextResponse.json({ ok: false, error: 'answer requerido' }, { status: 400 });
    }

    const model = process.env.BUDGET_CHAT_MODEL || process.env.OPENAI_MODEL_FAST || 'gpt-4.1-mini';
    const client = new OpenAI({ apiKey });

    const prompt = [
      'Eres un agente de presupuesto preciso y profesional.',
      'Objetivo: extraer SOLO un dato numérico mensual y mapearlo a una fila de presupuesto, con categorías separadas.',
      'Devuelve JSON estricto con campos:',
      '{"assistant_text":"string muy breve (<=16 palabras)","next_question":"string breve","update":{"id":"income-salary|income-extra|expense-rent|expense-food|expense-transport|expense-services|expense-debt|expense-custom","category":"string","type":"income|expense","amount":number,"note":"string breve"}}',
      'Nunca mezcles categorías en una sola fila.',
      'Si no se entiende, amount=0 y assistant_text pide aclaración.',
      `Pregunta actual: ${question || 'No especificada'}`,
      `Respuesta usuario: ${answer}`,
      `Filas actuales: ${JSON.stringify(rows.slice(0, 12))}`,
    ].join('\n');

    const response = await client.chat.completions.create({
      model,
      response_format: { type: 'json_object' },
      max_completion_tokens: 160,
      messages: [
        { role: 'system', content: 'Responde solo JSON válido, sin markdown.' },
        { role: 'user', content: prompt },
      ],
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? '{}';
    const parsed = JSON.parse(raw) as {
      assistant_text?: string;
      next_question?: string;
      update?: {
        id?: string;
        category?: string;
        type?: 'income' | 'expense';
        amount?: number;
        note?: string;
      };
    };

    return NextResponse.json({
      ok: true,
      assistant_text: parsed.assistant_text ?? 'Perfecto, sigo.',
      next_question: parsed.next_question ?? '¿Qué otro monto quieres ajustar?',
      update: parsed.update ?? null,
      model,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'budget chat error' },
      { status: 500 },
    );
  }
}
