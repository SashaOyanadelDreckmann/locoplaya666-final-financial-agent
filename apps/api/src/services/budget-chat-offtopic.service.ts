import { resolveOffTopicBriefAnswer } from '@financial-agent/shared';
import { completeStructuredWithSchema } from './llm.service';

const OFFTOPIC_TIMEOUT_MS = Number(process.env.BUDGET_CHAT_OFFTOPIC_TIMEOUT_MS ?? 3500);
const OFFTOPIC_MAX_CHARS = 160;

type OffTopicModelOutput = {
  brief?: string;
};

function isOffTopicLlmEnabled(): boolean {
  if (process.env.BUDGET_CHAT_OFFTOPIC_ENABLED === 'false') return false;
  if (process.env.NODE_ENV === 'test') return false;
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key || key === 'test-key' || key === 'test-openai-key') return false;
  return true;
}

function resolveOffTopicModel(): string {
  return (
    process.env.BUDGET_CHAT_OFFTOPIC_MODEL?.trim() ||
    process.env.BUDGET_CHAT_WRITER_MODEL?.trim() ||
    process.env.OPENAI_MODEL_FAST?.trim() ||
    'gpt-4o-mini'
  );
}

function sanitizeBrief(text: string): string | null {
  const compact = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, OFFTOPIC_MAX_CHARS);
  if (!compact || compact.length < 12) return null;
  if (/^(perfecto|claro|listo|entendido|genial|excelente|dale|ok)\b/i.test(compact)) return null;
  return compact;
}

async function callOffTopicModel(userAnswer: string): Promise<string | null> {
  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      brief: { type: 'string' },
    },
    required: ['brief'],
  } as const;

  const response = await completeStructuredWithSchema<OffTopicModelOutput>({
    name: 'budget_chat_offtopic',
    description: 'Respuesta breve a pregunta fuera del presupuesto.',
    model: resolveOffTopicModel(),
    temperature: 0.25,
    maxOutputTokens: 120,
    instructions: [
      'Eres un asistente de presupuesto que recibe una pregunta FUERA de tema.',
      'Responde en UNA sola frase breve (máximo 140 caracteres), en español chileno.',
      'Debes responder directamente lo que preguntaron, con tono natural y modesto.',
      'Si no conoces un dato exacto, da contexto general sin inventar cifras ni fechas.',
      'PROHIBIDO hablar de finanzas personales, montos del usuario o recomendaciones de inversión.',
      'PROHIBIDO empezar con Perfecto, Claro, Listo, Entendido, Genial.',
      'Devuelve JSON estricto con key brief.',
    ].join('\n'),
    input: [{ role: 'user', content: `USER_QUESTION=${JSON.stringify(userAnswer.trim().slice(0, 280))}` }],
    schema,
  });

  return sanitizeBrief(response?.brief ?? '');
}

export async function generateOffTopicBriefAnswer(userAnswer: string): Promise<string> {
  const fallback = resolveOffTopicBriefAnswer(userAnswer);
  if (!isOffTopicLlmEnabled()) return fallback;

  try {
    const llmBrief = await Promise.race([
      callOffTopicModel(userAnswer),
      new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), Number.isFinite(OFFTOPIC_TIMEOUT_MS) ? OFFTOPIC_TIMEOUT_MS : 3500);
      }),
    ]);
    return llmBrief ?? fallback;
  } catch {
    return fallback;
  }
}
