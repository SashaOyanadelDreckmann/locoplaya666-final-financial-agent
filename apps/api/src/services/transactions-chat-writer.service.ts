import {
  collectRetrievalSignalsUsed,
  formatTxClp,
  type QuestionSignals,
} from '@financial-agent/shared';
import { completeStructuredWithSchema } from './llm.service';

const WRITER_MAX_REPLY_CHARS = 420;

export type TransactionsWriterPolishInput = {
  deterministicReply: string;
  question: string;
  retrievalMode: 'targeted' | 'overview';
  signals: QuestionSignals;
  matchedCount: number;
};

type WriterModelOutput = {
  reply?: string;
};

function isWriterEnabled(): boolean {
  if (process.env.TRANSACTIONS_CHAT_WRITER_ENABLED === 'false') return false;
  if (process.env.NODE_ENV === 'test') return false;
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key || key === 'test-key' || key === 'test-openai-key') return false;
  return true;
}

function resolveWriterModel(): string {
  return (
    process.env.TRANSACTIONS_CHAT_WRITER_MODEL?.trim() ||
    process.env.TRANSACTIONS_CHAT_MODEL?.trim() ||
    process.env.OPENAI_MODEL_FAST?.trim() ||
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

function validateWriterOutput(
  input: TransactionsWriterPolishInput,
  output: WriterModelOutput,
): string | null {
  const reply = compactCopy(output.reply ?? '', WRITER_MAX_REPLY_CHARS);
  if (!reply) return null;

  const allowedAmounts = new Set<number>([
    ...extractNumericTokens(input.deterministicReply),
    ...extractNumericTokens(input.question),
  ]);

  const polishedAmounts = extractNumericTokens(reply);
  for (const amount of polishedAmounts) {
    if (amount >= 1000 && !allowedAmounts.has(amount)) return null;
  }

  return reply;
}

async function callTransactionsWriterModel(
  input: TransactionsWriterPolishInput,
): Promise<WriterModelOutput | null> {
  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      reply: { type: 'string' },
    },
    required: ['reply'],
  } as const;

  const signalsUsed = collectRetrievalSignalsUsed(input.signals);
  const prompt = [
    `PREGUNTA=${JSON.stringify(input.question)}`,
    `BORRADOR=${JSON.stringify(input.deterministicReply)}`,
    `MODO_RECUPERACION=${input.retrievalMode}`,
    `COINCIDENCIAS=${input.matchedCount}`,
    `SENALES=${JSON.stringify(signalsUsed)}`,
  ].join('\n');

  const model = resolveWriterModel();
  const response = await completeStructuredWithSchema<WriterModelOutput>({
    name: 'transactions_chat_writer',
    description: 'Humaniza respuestas determinísticas de transacciones sin alterar cifras.',
    model,
    temperature: 0.42,
    maxOutputTokens: 220,
    instructions: [
      'Eres el copywriter del asistente de transacciones de Financieramente (Chile).',
      'Reescribe el BORRADOR en español chileno, tono profesional y cercano.',
      'Máximo 4 oraciones.',
      'NO cambies montos, fechas ni conteos: deben coincidir exactamente con el borrador.',
      `Montos permitidos del borrador: ${[...extractNumericTokens(input.deterministicReply)].map((value) => formatTxClp(value)).join(', ') || 'ninguno'}.`,
      'No inventes movimientos ni comercios que no estén en el borrador.',
      'Devuelve JSON estricto con reply.',
    ].join(' '),
    input: [{ role: 'user', content: prompt }],
    schema,
  });

  if (!response?.reply) return null;
  return response;
}

export async function polishTransactionsAssistantCopy(
  input: TransactionsWriterPolishInput,
): Promise<{ reply: string; model: string } | null> {
  if (!isWriterEnabled()) return null;
  try {
    const output = await callTransactionsWriterModel(input);
    if (!output) return null;
    const reply = validateWriterOutput(input, output);
    if (!reply) return null;
    return { reply, model: resolveWriterModel() };
  } catch {
    return null;
  }
}
