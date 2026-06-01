import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { requireBackendSession } from '@/lib/serverAuth';
import { checkRateLimit } from '@/lib/rateLimit';

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

function compactText(value: unknown, max = 240): string {
  return String(value ?? '')
    .trim()
    .slice(0, max);
}

function normalizeIntent(value: unknown): 'init' | 'reply' | null {
  const intent = compactText(value, 12).toLowerCase();
  if (intent === 'init' || intent === 'reply') return intent;
  return null;
}

function sanitizeBudgetRow(raw: unknown): BudgetRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  const id = compactText(item.id, 80);
  const category = compactText(item.category, 80);
  const type = item.type === 'income' ? 'income' : item.type === 'expense' ? 'expense' : null;
  if (!id || !category || !type) return null;
  const amountNum = Number(item.amount ?? 0);
  const amount = Number.isFinite(amountNum) ? Math.max(0, Math.round(amountNum)) : 0;

  return {
    id,
    category,
    type,
    amount,
    note: compactText(item.note, 120) || undefined,
    detail: compactText(item.detail, 180) || undefined,
    cadence: normalizeCadence(item.cadence),
    paymentMethod: normalizePaymentMethod(item.paymentMethod),
    movementType: normalizeMovementType(item.movementType),
  };
}

function sanitizeBudgetRows(value: unknown, maxRows = 30): BudgetRow[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, maxRows)
    .map((row) => sanitizeBudgetRow(row))
    .filter((row): row is BudgetRow => Boolean(row));
}

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
  const id = compactText(raw.id, 80);
  const kind = raw.kind === 'delete' ? 'delete' : raw.kind === 'add' ? 'add' : 'update';
  if (!id) return null;

  if (kind === 'delete') {
    return { kind, id };
  }

  const type = raw.type === 'income' ? 'income' : raw.type === 'expense' ? 'expense' : undefined;
  const category = compactText(raw.category, 80);
  if (!type || !category) return null;
  const amountNum = Number(raw.amount ?? 0);

  return {
    kind,
    id,
    type,
    category,
    amount: Number.isFinite(amountNum) ? Math.max(0, Math.round(amountNum)) : 0,
    note: compactText(raw.note, 120) || undefined,
    detail: compactText(raw.detail, 180) || undefined,
    cadence: normalizeCadence(raw.cadence),
    payment_method: normalizePaymentMethod(raw.payment_method ?? raw.paymentMethod),
    movement_type: normalizeMovementType(raw.movement_type ?? raw.movementType),
  };
}

export async function POST(req: Request) {
  let session: { userId: string };
  try {
    session = await requireBackendSession(req);
  } catch {
    return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
  }

  const rl = checkRateLimit(`budget-chat:${session.userId}`, 30, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } },
    );
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: 'OPENAI_API_KEY no configurada' },
        { status: 500 },
      );
    }

    const body = await req.json();
    const intent = normalizeIntent(body?.intent);
    if (!intent) {
      return NextResponse.json({ ok: false, error: 'Invalid intent' }, { status: 400 });
    }
    const answer = compactText(body?.answer, 1200);
    const question = compactText(body?.question, 500);
    const rows = sanitizeBudgetRows(body?.budgetRows, 30);
    const activeRow = sanitizeBudgetRow(body?.activeRow);

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
      `Fila activa: ${JSON.stringify(activeRow ?? null)}`,
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

    const assistantText = compactText(
      parsed.assistant_text ?? 'Perfecto. Sigamos con el siguiente movimiento.',
      220,
    );
    const nextQuestion = compactText(
      parsed.next_question ?? '¿Qué movimiento quieres ajustar ahora?',
      220,
    );

    return NextResponse.json({
      ok: true,
      assistant_text: assistantText || 'Perfecto. Sigamos con el siguiente movimiento.',
      next_question: nextQuestion || '¿Qué movimiento quieres ajustar ahora?',
      focus_row_id: typeof parsed.focus_row_id === 'string' ? compactText(parsed.focus_row_id, 80) : null,
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
