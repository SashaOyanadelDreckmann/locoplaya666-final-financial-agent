import type { BudgetAssistantContext, BudgetRow, BudgetWriterTurn } from '@financial-agent/shared';
import {
  buildBudgetWriterDigest,
  inferBudgetFieldFromQuestion,
  startsWithBudgetGenericOpener,
} from '@financial-agent/shared';
import { completeStructuredWithSchema } from './llm.service';

const WRITER_TIMEOUT_MS = Number(process.env.BUDGET_CHAT_WRITER_TIMEOUT_MS ?? 4500);
const WRITER_MAX_REPLY_CHARS = 240;
const WRITER_MAX_QUESTION_CHARS = 240;

export type BudgetWriterPolishInput = {
  turn: BudgetWriterTurn;
  deterministicReply: string;
  deterministicQuestion: string | null;
  focusRow: BudgetRow | null;
  context: BudgetAssistantContext;
  userAnswer?: string;
};

type WriterModelOutput = {
  reply?: string;
  question?: string;
};

function isWriterEnabled(): boolean {
  if (process.env.BUDGET_CHAT_WRITER_ENABLED === 'false') return false;
  if (process.env.NODE_ENV === 'test') return false;
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key || key === 'test-key' || key === 'test-openai-key') return false;
  return true;
}

function resolveWriterModel(): string {
  return (
    process.env.BUDGET_CHAT_WRITER_MODEL?.trim() ||
    process.env.OPENAI_MODEL_FAST?.trim() ||
    process.env.OPENAI_MODEL_MINI?.trim() ||
    'gpt-4o-mini'
  );
}

function compactCopy(text: string, max: number): string {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function extractNumericTokens(text: string): number[] {
  const normalized = String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const values = new Set<number>();

  for (const match of normalized.matchAll(/([+-]?\d[\d.,\s]{0,15})(?:\s*(k|mil|m|mm|millones?))?/gi)) {
    let numeric = match[1].replace(/\s+/g, '');
    const multiplierTag = String(match[2] ?? '').toLowerCase();
    if (numeric.includes('.') && numeric.includes(',')) numeric = numeric.replace(/\./g, '').replace(',', '.');
    else if ((numeric.match(/\./g) ?? []).length > 1) numeric = numeric.replace(/\./g, '');
    else if ((numeric.match(/,/g) ?? []).length > 1) numeric = numeric.replace(/,/g, '');
    else if (/^\d{1,3}(?:\.\d{3})+$/.test(numeric) || /^\d{1,3}(?:,\d{3})+$/.test(numeric)) numeric = numeric.replace(/[.,]/g, '');
    else numeric = numeric.replace(',', '.');
    const parsed = Number(numeric);
    if (!Number.isFinite(parsed)) continue;
    let multiplier = 1;
    if (multiplierTag === 'k' || multiplierTag === 'mil') multiplier = 1000;
    if (multiplierTag === 'm' || multiplierTag === 'mm' || multiplierTag.startsWith('millon')) multiplier = 1_000_000;
    const amount = Math.max(0, Math.round(parsed * multiplier));
    if (amount >= 1000) values.add(amount);
  }

  return [...values];
}

export function validateWriterOutput(
  input: BudgetWriterPolishInput,
  output: WriterModelOutput,
): { reply: string; question: string } | null {
  const reply = compactCopy(output.reply ?? '', WRITER_MAX_REPLY_CHARS);
  const question = compactCopy(output.question ?? '', WRITER_MAX_QUESTION_CHARS);
  if (!reply || !question || !question.includes('?')) return null;
  if (startsWithBudgetGenericOpener(reply)) return null;
  if (startsWithBudgetGenericOpener(question)) return null;

  const deterministicField = inferBudgetFieldFromQuestion(input.deterministicQuestion ?? '');
  const polishedField = inferBudgetFieldFromQuestion(question);
  if (deterministicField && polishedField !== deterministicField) return null;

  const allowedAmounts = new Set<number>([
    ...extractNumericTokens(input.deterministicReply),
    ...extractNumericTokens(input.deterministicQuestion ?? ''),
    ...extractNumericTokens(input.userAnswer ?? ''),
    ...extractNumericTokens(JSON.stringify(buildBudgetWriterDigest(input.context, input.focusRow, input.userAnswer))),
  ]);

  if (input.focusRow) {
    allowedAmounts.add(Math.max(0, Math.round(Number(input.focusRow.amount ?? 0))));
    const hint = input.context.rowHints.get(input.focusRow.id);
    if (hint?.estimatedMonthly) allowedAmounts.add(hint.estimatedMonthly);
  }
  allowedAmounts.add(input.context.totalInflows);
  allowedAmounts.add(input.context.totalOutflows);
  for (const ledger of input.context.movementLedgers) {
    for (const movement of ledger.movements) {
      allowedAmounts.add(movement.amount);
    }
  }

  const polishedAmounts = [...extractNumericTokens(reply), ...extractNumericTokens(question)];
  for (const amount of polishedAmounts) {
    const allowed = [...allowedAmounts].some((candidate) => {
      if (candidate <= 0) return false;
      const delta = Math.abs(candidate - amount);
      return delta <= Math.max(1000, Math.round(candidate * 0.02));
    });
    if (!allowed) return null;
  }

  return { reply, question };
}

function buildWriterInstructions(turn: BudgetWriterTurn): string {
  return [
    'Eres la voz conversacional del asistente de presupuesto de Financieramente (Chile).',
    'Tu único trabajo es REESCRIBIR con tono humano y natural — sin sonar a bot ni a vendedor.',
    'PROHIBIDO empezar reply o question con muletillas afirmativas: Perfecto, Claro, Listo, Entendido, Genial, Excelente, Dale, Ok.',
    'Si hay USER_ANSWER, el reply DEBE mencionar un detalle concreto de lo que dijo (palabras clave, rubro, contexto) antes de hablar del monto.',
    'NO cambies la intención, NO inventes montos ni categorías, NO agregues recomendaciones nuevas.',
    'Conserva exactamente los mismos números en pesos chilenos del brief (puedes cambiar formato $950.000 vs 950 mil).',
    'Responde SOLO JSON estricto con keys reply y question.',
    'reply: máximo 2 frases cortas, directas y específicas — sin relleno ni entusiasmo vacío.',
    'question: UNA sola pregunta clara terminada en "?", conectada con el hilo de la conversación.',
    turn === 'init'
      ? 'En init, reply puede contextualizar con perfil/movimientos; question debe pedir el dato faltante.'
      : turn === 'confirmation'
        ? 'En confirmation, describe qué registraste y por qué, citando el contexto del usuario.'
        : turn === 'suggestion'
          ? 'En suggestion, presenta la idea como invitación suave, no orden.'
          : turn === 'off_topic'
            ? 'En off_topic, reply = 1 frase que responde lo preguntado + 1 frase corta que vuelve al presupuesto; question pide el dato de la tabla activa.'
            : 'Mantén continuidad con la conversación reciente.',
  ].join(' ');
}

async function callBudgetWriterModel(input: BudgetWriterPolishInput): Promise<WriterModelOutput | null> {
  const digest = buildBudgetWriterDigest(input.context, input.focusRow, input.userAnswer);
  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      reply: { type: 'string' },
      question: { type: 'string' },
    },
    required: ['reply', 'question'],
  } as const;

  const recentChat = input.context.chatAnswers.slice(-4).map((turn) => ({
    q: turn.q.slice(0, 120),
    a: turn.a.slice(0, 120),
  }));
  const prompt = [
    `TURNO=${input.turn}`,
    `USER_ANSWER=${JSON.stringify(input.userAnswer ?? '')}`,
    `DRAFT_REPLY=${JSON.stringify(input.deterministicReply)}`,
    `DRAFT_QUESTION=${JSON.stringify(input.deterministicQuestion ?? '')}`,
    `RECENT_CHAT=${JSON.stringify(recentChat)}`,
    `CONTEXT=${JSON.stringify(digest)}`,
  ].join('\n');

  const model = resolveWriterModel();
  const response = await completeStructuredWithSchema<WriterModelOutput>({
    name: 'budget_chat_writer',
    description: 'Humaniza copy del asistente de presupuesto sin alterar datos.',
    model,
    temperature: input.turn === 'confirmation' ? 0.45 : 0.58,
    maxOutputTokens: 220,
    instructions: buildWriterInstructions(input.turn),
    input: [{ role: 'user', content: prompt }],
    schema,
  });

  if (!response?.reply || !response?.question) return null;
  return response;
}

export async function polishBudgetAssistantCopy(
  input: BudgetWriterPolishInput,
): Promise<{ reply: string; question: string; model: string } | null> {
  if (!isWriterEnabled()) return null;
  if (!input.deterministicReply.trim()) return null;

  const model = resolveWriterModel();
  try {
    const raw = await Promise.race([
      callBudgetWriterModel(input),
      new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), Number.isFinite(WRITER_TIMEOUT_MS) ? WRITER_TIMEOUT_MS : 2800);
      }),
    ]);
    if (!raw) return null;
    const validated = validateWriterOutput(input, raw);
    if (!validated) return null;
    return { ...validated, model };
  } catch {
    return null;
  }
}

export function mapBudgetSourceToWriterTurn(source: string): BudgetWriterTurn {
  if (source.includes('init')) return 'init';
  if (source.includes('off_topic')) return 'off_topic';
  if (source.includes('update')) return 'confirmation';
  if (source.includes('suggestion') || source.includes('advice') || source.includes('add')) return 'suggestion';
  if (source.includes('education')) return 'education';
  if (source.includes('status')) return 'status';
  return 'follow_up';
}
