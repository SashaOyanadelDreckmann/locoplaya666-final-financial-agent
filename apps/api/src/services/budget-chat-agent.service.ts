import type { BudgetAssistantContext, BudgetRow } from '@financial-agent/shared';
import {
  BUDGET_CADENCE_OPTIONS,
  BUDGET_MOVEMENT_TYPE_OPTIONS,
  BUDGET_PAYMENT_OPTIONS,
  BUDGET_TABLE_COLUMN_HELP,
  MAX_BUDGET_TABLE_ACTIONS,
  buildBudgetTableSnapshot,
  buildBudgetWriterDigest,
  compactBudgetChatAnswers,
  computeBudgetTotals,
  type BudgetTableAction,
  validateBudgetTableActions,
} from '@financial-agent/shared';
import { completeStructuredWithSchema } from './llm.service';

const AGENT_TIMEOUT_MS = Number(process.env.BUDGET_CHAT_AGENT_TIMEOUT_MS ?? 12_000);
const AGENT_DEFAULT_FOLLOW_UP = '¿Qué más quieres hacer con la tabla?';

export type BudgetAgentInput = {
  rows: BudgetRow[];
  context: BudgetAssistantContext;
  userAnswer: string;
  currentQuestion: string;
  focusRow: BudgetRow | null;
  chatAnswers: Array<{ q: string; a: string }>;
  mode: 'init' | 'reply';
};

export type BudgetAgentResult = {
  assistant_reply: string;
  next_question: string;
  focus_row_id: string | null;
  actions: BudgetTableAction[];
  requires_confirmation: boolean;
  pending_summary: string | null;
  source: string;
};

type AgentModelOutput = {
  assistant_reply?: string;
  next_question?: string;
  focus_row_id?: string | null;
  actions?: BudgetTableAction[];
  requires_confirmation?: boolean;
  pending_summary?: string | null;
};

function isAgentEnabled(): boolean {
  if (process.env.BUDGET_CHAT_AGENT_ENABLED === 'false') return false;
  if (process.env.NODE_ENV === 'test') return false;
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key || key === 'test-key' || key === 'test-openai-key') return false;
  return true;
}

function resolveAgentModel(): string {
  return (
    process.env.BUDGET_CHAT_AGENT_MODEL?.trim() ||
    process.env.BUDGET_CHAT_PLANNER_MODEL?.trim() ||
    process.env.OPENAI_MODEL_FAST?.trim() ||
    'gpt-4o-mini'
  );
}

function buildAgentToolInstructions(): string {
  return [
    'Eres el agente senior de presupuesto de Financieramente (Chile).',
    'Controlas la tabla mediante HERRAMIENTAS (array actions). Cada action es una operación atómica.',
    '',
    'HERRAMIENTAS DISPONIBLES:',
    '- table.add_row → kind:"add", id único (expense-custom-<slug> o income-custom-<slug>), category, type, campos opcionales',
    '- table.update_row → kind:"update", id existente, solo campos a cambiar',
    '- table.delete_row → kind:"delete", id existente',
    '- table.bulk_patch → múltiples actions en un solo turno (hasta 30)',
    '',
    BUDGET_TABLE_COLUMN_HELP,
    `Cadencias: ${BUDGET_CADENCE_OPTIONS.map((item) => item.value).join(', ')}.`,
    `Medios de pago: ${BUDGET_PAYMENT_OPTIONS.map((item) => item.value).join(', ')}.`,
    `Tipos de movimiento: ${BUDGET_MOVEMENT_TYPE_OPTIONS.map((item) => item.value).join(', ')}.`,
    '',
    'REGLAS SENIOR:',
    '- El usuario manda: si pide "agrega 10 filas con nombres A,B,C..." emites hasta 10 add con ids slug únicos.',
    '- Si pide renombrar, reordenar conceptualmente, vaciar, duplicar rubros o rearmar la tabla → tradúcelo a actions concretas.',
    '- NO sigas un guion fijo de campos: interpreta lenguaje natural y mapea a la tabla.',
    '- Usa ids existentes de TABLE_ROWS para update/delete; ids nuevos solo en add.',
    '- Montos solo si el usuario los dio, están en RECENT_CHAT o hay evidencia en CONTEXT.',
    '- requires_confirmation=true si hay delete, si son ≥4 actions, o si el cambio es masivo/ambiguo.',
    '- requires_confirmation=false si el pedido es explícito y acotado (ej. un monto, un rename, 1-3 adds claros).',
    '- pending_summary: qué harás (1-2 frases, cita detalle del usuario). Sin muletillas Perfecto/Claro/Listo.',
    '- assistant_reply: respuesta conversacional breve (puede ser vacía si pending_summary basta).',
    '- next_question: UNA pregunta útil o propuesta siguiente; puede ser abierta ("¿Qué más ajustamos?").',
    '- En init: saluda breve, resume estado de la tabla si hay datos, invita a pedir cambios libremente.',
    '- JSON estricto.',
  ].join('\n');
}

function inferRequiresConfirmation(actions: BudgetTableAction[], modelFlag: boolean): boolean {
  if (actions.length === 0) return false;
  if (modelFlag) return true;
  if (actions.some((action) => action.kind === 'delete')) return true;
  if (actions.length >= 4) return true;
  if (actions.filter((action) => action.kind === 'add').length >= 3) return true;
  return false;
}

function buildDefaultReply(input: BudgetAgentInput, actions: BudgetTableAction[]): string {
  if (actions.length === 0) {
    return input.mode === 'init'
      ? 'Tu presupuesto está listo para editar. Dime qué filas quieres agregar, cambiar o borrar.'
      : 'Entendido.';
  }
  const adds = actions.filter((action) => action.kind === 'add').length;
  const updates = actions.filter((action) => action.kind === 'update').length;
  const deletes = actions.filter((action) => action.kind === 'delete').length;
  const parts: string[] = [];
  if (adds > 0) parts.push(`agregar ${adds} fila${adds === 1 ? '' : 's'}`);
  if (updates > 0) parts.push(`actualizar ${updates}`);
  if (deletes > 0) parts.push(`eliminar ${deletes}`);
  return `Voy a ${parts.join(', ')} en la tabla.`;
}

async function callBudgetAgentModel(input: BudgetAgentInput): Promise<AgentModelOutput | null> {
  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      assistant_reply: { type: 'string' },
      next_question: { type: 'string' },
      focus_row_id: { type: ['string', 'null'] },
      actions: {
        type: 'array',
        maxItems: MAX_BUDGET_TABLE_ACTIONS,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            kind: { type: 'string', enum: ['add', 'update', 'delete'] },
            id: { type: 'string' },
            category: { type: 'string' },
            type: { type: 'string', enum: ['income', 'expense'] },
            amount: { type: 'number' },
            cadence: { type: 'string', enum: ['fixed', 'variable'] },
            payment_method: {
              type: 'string',
              enum: ['transfer', 'debit', 'credit', 'cash', 'prepaid', 'other'],
            },
            movement_type: {
              type: 'string',
              enum: [
                'income_main',
                'income_extra',
                'housing',
                'home_services',
                'food',
                'transport',
                'health',
                'education',
                'debt',
                'savings_investment',
                'taxes_fees',
                'leisure_other',
              ],
            },
          },
          required: ['kind', 'id'],
        },
      },
      requires_confirmation: { type: 'boolean' },
      pending_summary: { type: ['string', 'null'] },
    },
    required: ['assistant_reply', 'next_question', 'focus_row_id', 'actions', 'requires_confirmation', 'pending_summary'],
  } as const;

  const totals = computeBudgetTotals(input.rows);
  const digest = buildBudgetWriterDigest(input.context, input.focusRow, input.userAnswer);
  const prompt = [
    `MODE=${input.mode}`,
    `CURRENT_QUESTION=${JSON.stringify(input.currentQuestion)}`,
    `USER_ANSWER=${JSON.stringify(input.userAnswer)}`,
    `TABLE_ROWS=${JSON.stringify(buildBudgetTableSnapshot(input.rows))}`,
    `TABLE_TOTALS=${JSON.stringify(totals)}`,
    `CONTEXT=${JSON.stringify(digest)}`,
    `RECENT_CHAT=${JSON.stringify(compactBudgetChatAnswers(input.chatAnswers))}`,
  ].join('\n');

  return completeStructuredWithSchema<AgentModelOutput>({
    name: 'budget_chat_agent',
    description: 'Agente senior de presupuesto con herramientas de tabla.',
    model: resolveAgentModel(),
    temperature: 0.4,
    maxOutputTokens: 3200,
    instructions: buildAgentToolInstructions(),
    input: [{ role: 'user', content: prompt }],
    schema,
  });
}

function normalizeAgentFollowUp(raw: AgentModelOutput): string {
  const nextQuestion = String(raw.next_question ?? '').trim();
  if (nextQuestion.includes('?')) return nextQuestion;
  return AGENT_DEFAULT_FOLLOW_UP;
}

export function isBudgetAgentUnavailableResult(result: Pick<BudgetAgentResult, 'source'>): boolean {
  return result.source === 'budget_agent_unavailable';
}

function normalizeAgentResult(input: BudgetAgentInput, raw: AgentModelOutput): BudgetAgentResult | null {
  const actions = validateBudgetTableActions(raw.actions ?? [], input.rows);
  const requiresConfirmation = inferRequiresConfirmation(actions, Boolean(raw.requires_confirmation));
  const assistantReply = String(raw.assistant_reply ?? '').trim() || buildDefaultReply(input, actions);
  const pendingSummary = String(raw.pending_summary ?? '').trim() || null;

  return {
    assistant_reply: assistantReply,
    next_question: normalizeAgentFollowUp(raw),
    focus_row_id: raw.focus_row_id ?? actions[0]?.id ?? input.focusRow?.id ?? null,
    actions,
    requires_confirmation: requiresConfirmation,
    pending_summary: pendingSummary,
    source: input.mode === 'init' ? 'budget_agent_init' : 'budget_agent',
  };
}

export function buildBudgetAgentUnavailableResult(mode: 'init' | 'reply'): BudgetAgentResult {
  return {
    assistant_reply:
      mode === 'init'
        ? 'El asistente de presupuesto no está disponible en este momento.'
        : 'No pude procesar tu mensaje ahora. Intenta de nuevo en unos segundos.',
    next_question: '¿Quieres reintentar con tu pedido sobre la tabla?',
    focus_row_id: null,
    actions: [],
    requires_confirmation: false,
    pending_summary: null,
    source: 'budget_agent_unavailable',
  };
}

export async function runBudgetChatAgent(input: BudgetAgentInput): Promise<BudgetAgentResult> {
  if (!isAgentEnabled()) return buildBudgetAgentUnavailableResult(input.mode);

  try {
    const raw = await Promise.race([
      callBudgetAgentModel(input),
      new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), Number.isFinite(AGENT_TIMEOUT_MS) ? AGENT_TIMEOUT_MS : 12_000);
      }),
    ]);
    if (!raw) return buildBudgetAgentUnavailableResult(input.mode);
    const normalized = normalizeAgentResult(input, raw);
    return normalized ?? buildBudgetAgentUnavailableResult(input.mode);
  } catch {
    return buildBudgetAgentUnavailableResult(input.mode);
  }
}

/** @deprecated Use runBudgetChatAgent — kept for transitional imports */
export async function planBudgetAssistantTurn(input: {
  rows: BudgetRow[];
  context: BudgetAssistantContext;
  userAnswer: string;
  currentQuestion: string;
  focusRow: BudgetRow | null;
  chatAnswers: Array<{ q: string; a: string }>;
}) {
  const result = await runBudgetChatAgent({ ...input, mode: 'reply' });
  return {
    next_question: result.next_question,
    focus_row_id: result.focus_row_id,
    actions: result.actions,
    requires_confirmation: result.requires_confirmation,
    pending_summary: result.pending_summary ?? result.assistant_reply,
    source: result.source,
  };
}

/** @deprecated Use runBudgetChatAgent — kept for transitional imports */
export async function planBudgetAssistantInit(input: {
  rows: BudgetRow[];
  context: BudgetAssistantContext;
  deterministicQuestion: string;
  focusRow: BudgetRow | null;
}) {
  const result = await runBudgetChatAgent({
    rows: input.rows,
    context: input.context,
    userAnswer: '',
    currentQuestion: input.deterministicQuestion,
    focusRow: input.focusRow,
    chatAnswers: [],
    mode: 'init',
  });
  return {
    next_question: result.next_question,
    focus_row_id: result.focus_row_id,
    actions: result.actions,
    requires_confirmation: result.requires_confirmation,
    pending_summary: result.pending_summary,
    source: result.source,
  };
}
