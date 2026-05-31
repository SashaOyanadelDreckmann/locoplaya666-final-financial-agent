import { NextResponse } from 'next/server';
import OpenAI from 'openai';

type BudgetCadence = 'fixed' | 'variable' | 'oneoff';
type BudgetPaymentMethod = 'transfer' | 'debit' | 'credit' | 'cash' | 'prepaid' | 'other';
type BudgetMovementType =
  | 'income_main'
  | 'income_extra'
  | 'housing'
  | 'home_services'
  | 'food'
  | 'transport'
  | 'health'
  | 'education'
  | 'debt'
  | 'savings_investment'
  | 'taxes_fees'
  | 'leisure_other';

type BudgetRow = {
  id: string;
  category: string;
  type: 'income' | 'expense';
  amount: number;
  note?: string;
  detail?: string;
  cadence?: BudgetCadence;
  paymentMethod?: BudgetPaymentMethod;
  movementType?: BudgetMovementType;
};

type BudgetAction = {
  kind?: 'add' | 'update' | 'delete';
  id?: string;
  category?: string;
  type?: 'income' | 'expense';
  amount?: number;
  note?: string;
  detail?: string;
  cadence?: BudgetCadence;
  payment_method?: BudgetPaymentMethod;
  paymentMethod?: BudgetPaymentMethod;
  movement_type?: BudgetMovementType;
  movementType?: BudgetMovementType;
};

function normalizeCadence(value: unknown): 'fixed' | 'variable' {
  if (value === 'fixed') return 'fixed';
  if (value === 'variable' || value === 'oneoff') return 'variable';
  return 'variable';
}

function normalizePaymentMethod(value: unknown): BudgetPaymentMethod | undefined {
  return value === 'transfer' ||
    value === 'debit' ||
    value === 'credit' ||
    value === 'cash' ||
    value === 'prepaid' ||
    value === 'other'
    ? value
    : undefined;
}

function normalizeMovementType(value: unknown): BudgetMovementType | undefined {
  return value === 'income_main' ||
    value === 'income_extra' ||
    value === 'housing' ||
    value === 'home_services' ||
    value === 'food' ||
    value === 'transport' ||
    value === 'health' ||
    value === 'education' ||
    value === 'debt' ||
    value === 'savings_investment' ||
    value === 'taxes_fees' ||
    value === 'leisure_other'
    ? value
    : undefined;
}

function fallbackInit(rows: BudgetRow[]) {
  const focus = rows.find((row) => Number(row.amount ?? 0) <= 0) ?? rows[0] ?? null;
  const question = focus
    ? `Para el movimiento "${focus.category}", ¿cuál es el monto mensual y su medio de pago?`
    : 'Partamos por tu ingreso principal mensual y su medio de pago.';
  return {
    ok: true,
    assistant_text: question,
    next_question: question,
    focus_row_id: focus?.id ?? 'income_salary',
  };
}

function sanitizeAction(raw: BudgetAction | null | undefined): BudgetAction | null {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.id ?? '').trim();
  const kind = raw.kind === 'delete' ? 'delete' : raw.kind === 'add' ? 'add' : 'update';
  if (!id) return null;

  if (kind === 'delete') {
    return { kind, id };
  }

  const type = raw.type === 'income' ? 'income' : raw.type === 'expense' ? 'expense' : undefined;
  const category = String(raw.category ?? '').trim();
  if (!type || !category) return null;

  return {
    kind,
    id,
    type,
    category,
    amount: Math.max(0, Math.round(Number(raw.amount ?? 0))),
    note: String(raw.note ?? '').trim() || undefined,
    detail: String(raw.detail ?? '').trim() || undefined,
    cadence: normalizeCadence(raw.cadence),
    payment_method: normalizePaymentMethod(raw.payment_method ?? raw.paymentMethod),
    movement_type: normalizeMovementType(raw.movement_type ?? raw.movementType),
  };
}

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
    const intent = String(body?.intent ?? 'reply').trim();
    const answer = String(body?.answer ?? '').trim();
    const question = String(body?.question ?? '').trim();
    const rows = (Array.isArray(body?.budgetRows) ? body.budgetRows : []) as BudgetRow[];

    if (intent === 'init' || !answer) {
      return NextResponse.json(fallbackInit(rows));
    }

    const model = process.env.BUDGET_CHAT_MODEL || process.env.OPENAI_MODEL_FAST || 'gpt-4.1-mini';
    const client = new OpenAI({ apiKey });

    const prompt = [
      'Eres un agente financiero que actualiza una tabla de presupuesto sin fricción.',
      'Objetivo: capturar UN movimiento por turno, con monto mensual y metadatos clave.',
      'Responde JSON estricto con este formato:',
      '{"assistant_text":"string <= 20 palabras","next_question":"string breve","focus_row_id":"string|null","action":{"kind":"add|update|delete","id":"string","category":"string","type":"income|expense","amount":number,"detail":"string opcional","note":"string opcional","cadence":"fixed|variable","payment_method":"transfer|debit|credit|cash|prepaid|other","movement_type":"income_main|income_extra|housing|home_services|food|transport|health|education|debt|savings_investment|taxes_fees|leisure_other"}}',
      'No inventes montos. Si no hay monto claro, usa amount=0 y pide aclaración.',
      'Prioriza actualizar la fila activa si aplica.',
      `Pregunta actual: ${question || 'No especificada'}`,
      `Respuesta usuario: ${answer}`,
      `Fila activa: ${JSON.stringify(body?.activeRow ?? null)}`,
      `Filas actuales: ${JSON.stringify(rows.slice(0, 16))}`,
    ].join('\n');

    const response = await client.chat.completions.create({
      model,
      response_format: { type: 'json_object' },
      max_completion_tokens: 220,
      messages: [
        { role: 'system', content: 'Responde solo JSON válido, sin markdown.' },
        { role: 'user', content: prompt },
      ],
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? '{}';
    const parsed = JSON.parse(raw) as {
      assistant_text?: string;
      next_question?: string;
      focus_row_id?: string | null;
      action?: BudgetAction;
      update?: BudgetAction;
      actions?: BudgetAction[];
    };

    const actions = Array.isArray(parsed.actions)
      ? parsed.actions.map((item) => sanitizeAction(item)).filter(Boolean)
      : [sanitizeAction(parsed.action ?? parsed.update)].filter(Boolean);

    return NextResponse.json({
      ok: true,
      assistant_text: parsed.assistant_text ?? 'Perfecto. Sigamos con el siguiente movimiento.',
      next_question: parsed.next_question ?? '¿Qué movimiento quieres ajustar ahora?',
      focus_row_id: typeof parsed.focus_row_id === 'string' ? parsed.focus_row_id : null,
      actions,
      action: actions[0] ?? null,
      model,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'budget chat error' },
      { status: 500 },
    );
  }
}
