import type { BudgetAssistantContext, BudgetRow } from '@financial-agent/shared';
import {
  BUDGET_CADENCE_OPTIONS,
  BUDGET_MOVEMENT_TYPE_OPTIONS,
  BUDGET_PAYMENT_OPTIONS,
  BUDGET_TABLE_COLUMN_HELP,
  buildBudgetTableSnapshot,
  buildBudgetWriterDigest,
  type BudgetTableAction,
  validateBudgetTableActions,
} from '@financial-agent/shared';
import { completeStructuredWithSchema } from './llm.service';

const PLANNER_TIMEOUT_MS = Number(process.env.BUDGET_CHAT_PLANNER_TIMEOUT_MS ?? 4500);

export type BudgetPlannerInput = {
  rows: BudgetRow[];
  context: BudgetAssistantContext;
  userAnswer: string;
  currentQuestion: string;
  focusRow: BudgetRow | null;
  chatAnswers: Array<{ q: string; a: string }>;
};

export type BudgetPlannerResult = {
  next_question: string;
  focus_row_id: string | null;
  actions: BudgetTableAction[];
  requires_confirmation: boolean;
  pending_summary: string | null;
  source: string;
};

type PlannerModelOutput = {
  next_question?: string;
  focus_row_id?: string | null;
  actions?: BudgetTableAction[];
  requires_confirmation?: boolean;
  pending_summary?: string | null;
};

function isPlannerEnabled(): boolean {
  if (process.env.BUDGET_CHAT_PLANNER_ENABLED === 'false') return false;
  if (process.env.NODE_ENV === 'test') return false;
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key || key === 'test-key' || key === 'test-openai-key') return false;
  return true;
}

function resolvePlannerModel(): string {
  return (
    process.env.BUDGET_CHAT_PLANNER_MODEL?.trim() ||
    process.env.BUDGET_CHAT_WRITER_MODEL?.trim() ||
    process.env.OPENAI_MODEL_FAST?.trim() ||
    'gpt-4o-mini'
  );
}

function buildPlannerInstructions(): string {
  return [
    'Eres el planner del asistente de presupuesto de Financieramente (Chile).',
    'Tu trabajo es interpretar la conversación y proponer cambios EXACTOS en la tabla.',
    BUDGET_TABLE_COLUMN_HELP,
    `Cadencias válidas: ${BUDGET_CADENCE_OPTIONS.map((item) => item.value).join(', ')}.`,
    `Medios de pago válidos: ${BUDGET_PAYMENT_OPTIONS.map((item) => item.value).join(', ')}.`,
    `Tipos de movimiento válidos: ${BUDGET_MOVEMENT_TYPE_OPTIONS.map((item) => item.value).join(', ')}.`,
    'Reglas:',
    '- Usa SOLO ids existentes o expense-custom-<slug> para filas nuevas.',
    '- kind delete solo si el usuario pide eliminar/borrar/quitar una fila.',
    '- Para add/update incluye solo campos mencionados o inferibles con evidencia.',
    '- Si propones cambios materiales (delete, add, o montos/categorías nuevas), requires_confirmation=true.',
    '- Si solo falta un dato para completar una fila, requires_confirmation=false y actions=[].',
    '- next_question: UNA pregunta clara en español chileno, tono humano y buena onda, terminada en "?".',
    '- NO inventes montos: solo usa números del mensaje, historial o evidencia del contexto.',
    '- Devuelve JSON estricto.',
  ].join('\n');
}

async function callPlannerModel(input: BudgetPlannerInput): Promise<PlannerModelOutput | null> {
  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      next_question: { type: 'string' },
      focus_row_id: { type: ['string', 'null'] },
      actions: {
        type: 'array',
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
    required: ['next_question', 'focus_row_id', 'actions', 'requires_confirmation', 'pending_summary'],
  } as const;

  const digest = buildBudgetWriterDigest(input.context, input.focusRow, input.userAnswer);
  const prompt = [
    `CURRENT_QUESTION=${JSON.stringify(input.currentQuestion)}`,
    `USER_ANSWER=${JSON.stringify(input.userAnswer)}`,
    `TABLE_ROWS=${JSON.stringify(buildBudgetTableSnapshot(input.rows))}`,
    `CONTEXT=${JSON.stringify(digest)}`,
    `RECENT_CHAT=${JSON.stringify(input.chatAnswers.slice(-8))}`,
  ].join('\n');

  return completeStructuredWithSchema<PlannerModelOutput>({
    name: 'budget_chat_planner',
    description: 'Planifica cambios de presupuesto y la siguiente pregunta.',
    model: resolvePlannerModel(),
    temperature: 0.35,
    maxOutputTokens: 420,
    instructions: buildPlannerInstructions(),
    input: [{ role: 'user', content: prompt }],
    schema,
  });
}

export async function planBudgetAssistantTurn(input: BudgetPlannerInput): Promise<BudgetPlannerResult | null> {
  if (!isPlannerEnabled()) return null;
  if (!input.userAnswer.trim()) return null;

  try {
    const raw = await Promise.race([
      callPlannerModel(input),
      new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), Number.isFinite(PLANNER_TIMEOUT_MS) ? PLANNER_TIMEOUT_MS : 4500);
      }),
    ]);
    if (!raw?.next_question?.trim()) return null;

    const actions = validateBudgetTableActions(raw.actions ?? [], input.rows);
    const requiresConfirmation = Boolean(raw.requires_confirmation) && actions.length > 0;
    const nextQuestion = raw.next_question.trim();
    if (!nextQuestion.includes('?')) return null;

    return {
      next_question: nextQuestion,
      focus_row_id: raw.focus_row_id ?? actions[0]?.id ?? input.focusRow?.id ?? null,
      actions,
      requires_confirmation: requiresConfirmation,
      pending_summary: raw.pending_summary?.trim() || null,
      source: 'planner_llm',
    };
  } catch {
    return null;
  }
}

export async function planBudgetAssistantInit(input: {
  rows: BudgetRow[];
  context: BudgetAssistantContext;
  deterministicQuestion: string;
  focusRow: BudgetRow | null;
}): Promise<BudgetPlannerResult | null> {
  if (!isPlannerEnabled()) return null;
  try {
    const raw = await Promise.race([
      callPlannerModel({
        rows: input.rows,
        context: input.context,
        userAnswer: '',
        currentQuestion: input.deterministicQuestion,
        focusRow: input.focusRow,
        chatAnswers: [],
      }),
      new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), Number.isFinite(PLANNER_TIMEOUT_MS) ? PLANNER_TIMEOUT_MS : 4500);
      }),
    ]);
    if (!raw?.next_question?.trim()) return null;
    return {
      next_question: raw.next_question.trim(),
      focus_row_id: raw.focus_row_id ?? input.focusRow?.id ?? null,
      actions: [],
      requires_confirmation: false,
      pending_summary: null,
      source: 'planner_llm_init',
    };
  } catch {
    return null;
  }
}
