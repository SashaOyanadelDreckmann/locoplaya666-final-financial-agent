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

    if (req.headers.get('content-length') && Number(req.headers.get('content-length')) > 32_000) {
      return NextResponse.json({ ok: false, error: 'Payload too large' }, { status: 413 });
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
    const intakeContext = compactText(body?.intakeContext, 400);
    const chatHistory = Array.isArray(body?.chatAnswers)
      ? (body.chatAnswers as Array<{ q: unknown; a: unknown }>)
          .slice(-4)
          .map((pair) => `P: ${compactText(pair.q, 120)}\nR: ${compactText(pair.a, 240)}`)
          .join('\n')
      : '';
    const productsSummary = Array.isArray(body?.products)
      ? (body.products as Array<{ label?: unknown; dashboardSummary?: unknown }>)
          .slice(0, 3)
          .map((p) => `${compactText(p.label, 40)}: ${compactText(p.dashboardSummary, 120)}`)
          .join('\n')
      : '';

    const model = process.env.BUDGET_CHAT_MODEL || process.env.OPENAI_MODEL_FAST || 'gpt-4.1-mini';
    const client = new OpenAI({ apiKey });

    const systemMsg =
      'Eres un asesor financiero personal para usuarios chilenos. ' +
      'Responde SOLO JSON válido, sin markdown ni texto adicional. ' +
      'Usa pesos chilenos (CLP). No inventes montos; si el usuario no los da, usa amount=0 y pide aclaración. ' +
      'Sé cálido y directo. Máximo 20 palabras en assistant_reply.';

    const buildPrompt = (isInit: boolean) => {
      const parts = [
        isInit
          ? 'Inicia la conversación de presupuesto. Saluda brevemente y haz la primera pregunta más importante según las filas vacías.'
          : 'Actualiza la tabla de presupuesto según la respuesta del usuario.',
        'Formato JSON estricto:',
        '{"assistant_reply":"string <= 20 palabras","next_question":"string breve","focus_row_id":"string|null","done":false,"coach_message":"string opcional","action":{"kind":"add|update|delete","id":"string","category":"string","type":"income|expense","amount":number,"detail":"string opcional","cadence":"fixed|variable","payment_method":"transfer|debit|credit|cash|prepaid|other","movement_type":"income_main|income_extra|housing|home_services|food|transport|health|education|debt|savings_investment|taxes_fees|leisure_other"}}',
        rows.length > 0 ? `Filas actuales (${rows.length}): ${JSON.stringify(rows.slice(0, 16))}` : 'No hay filas aún.',
        activeRow ? `Fila activa: ${JSON.stringify(activeRow)}` : '',
        intakeContext ? `Contexto del usuario: ${intakeContext}` : '',
        productsSummary ? `Productos bancarios:\n${productsSummary}` : '',
        chatHistory ? `Historial reciente:\n${chatHistory}` : '',
        !isInit && question ? `Pregunta anterior: ${question}` : '',
        !isInit && answer ? `Respuesta usuario: ${answer}` : '',
      ].filter(Boolean);
      return parts.join('\n');
    };

    const response = await client.chat.completions.create({
      model,
      response_format: { type: 'json_object' },
      max_completion_tokens: 450,
      messages: [
        { role: 'system', content: systemMsg },
        { role: 'user', content: buildPrompt(intent === 'init') },
      ],
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? '{}';
    const parsed = JSON.parse(raw) as {
      assistant_reply?: string;
      next_question?: string;
      focus_row_id?: string | null;
      done?: boolean;
      coach_message?: string;
      action?: BudgetAction;
      update?: BudgetAction;
      actions?: BudgetAction[];
    };

    const actions = Array.isArray(parsed.actions)
      ? parsed.actions.map((item) => sanitizeAction(item)).filter(Boolean)
      : [sanitizeAction(parsed.action ?? parsed.update)].filter(Boolean);

    const assistantReply = compactText(
      parsed.assistant_reply ?? 'Perfecto. Sigamos con el siguiente movimiento.',
      240,
    );
    const nextQuestion = compactText(
      parsed.next_question ?? '¿Qué movimiento quieres ajustar ahora?',
      240,
    );

    return NextResponse.json({
      ok: true,
      assistant_reply: assistantReply || 'Perfecto. Sigamos con el siguiente movimiento.',
      next_question: nextQuestion || '¿Qué movimiento quieres ajustar ahora?',
      focus_row_id: typeof parsed.focus_row_id === 'string' ? compactText(parsed.focus_row_id, 80) : null,
      done: Boolean(parsed.done),
      coach_message: typeof parsed.coach_message === 'string' ? compactText(parsed.coach_message, 200) : null,
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
