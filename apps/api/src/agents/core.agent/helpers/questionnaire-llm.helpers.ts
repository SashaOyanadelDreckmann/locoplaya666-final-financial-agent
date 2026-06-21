import { completeStructuredWithClaude } from '../../../services/llm.service';
import { resolveCoreAgentClaudeModel } from './model-policy.helpers';
import type { AgentBlock, QuestionnaireBlock } from '../chat.types';

type JsonRecord = Record<string, unknown>;

const MAX_SUGGESTIONS = 4;
const MAX_WORDS_PER_CHIP = 7;

export type QuestionnaireLLMQuestionInput = {
  id: string;
  question: string;
  existingChoices?: string[];
};

export type QuestionnaireLLMQuestionOutput = {
  id: string;
  response_mode: 'open_text' | 'choices';
  choices: string[];
  allow_free_text: boolean;
  free_text_placeholder?: string;
};

export type QuestionnaireLLMContext = {
  assistantMessage?: string;
  userMessage?: string;
  activeChatId?: string;
  funnelStage?: string;
  intake?: JsonRecord | null;
  profile?: JsonRecord | null;
};

export type InteractiveTurnLLMResult = {
  questions: QuestionnaireLLMQuestionOutput[];
  suggested_replies: string[];
};

export type InteractiveTurnArtifacts = {
  agentBlocks: AgentBlock[];
  suggestedReplies: string[];
};

const INTERACTIVE_TURN_LLM_SYSTEM = `
Eres el generador de UI interactiva de un asesor financiero premium para Chile.

En UNA sola respuesta debes configurar:
1) Como responde el usuario en el cuestionario (pastillas o texto libre).
2) Las SUGERENCIAS del composer (3-4 chips cortos) alineadas con la pregunta de cierre.

Reglas del cuestionario:
- response_mode "open_text": montos exactos, tasas, cifras multiples, confirmacion numerica o respuesta libre.
- response_mode "choices": solo si 2-4 respuestas cortas (max 7 palabras) contestan DIRECTAMENTE la pregunta.
- choices coherentes con la pregunta; prohibido tipo de deuda si piden monto/tasa.
- Si response_mode es "open_text", choices debe ser [].
- Maximo 4 choices por pregunta. Espanol chileno, directo, sin emojis.

Reglas de suggested_replies:
- Exactamente 3 o 4 chips (salvo open_text puro: 1 chip "Prefiero escribir la respuesta").
- Max 7 palabras por chip.
- Deben ser respuestas naturales a la MISMA pregunta de cierre, no acciones genericas del embudo.
- Si hay choices utiles, suggested_replies debe reflejar las mismas opciones (puedes acortar ligeramente).
- Chat-1: chips accionables de orientacion, simulacion o siguiente paso concreto segun la pregunta.
- Chat-2: chips alineados a convergencia/plan (prioridad, trade-off, validacion).
- Chat-3: chips pueden ser preguntas filosoficas breves si aplica.

Responde SOLO JSON valido:
{
  "questions": [
    {
      "id": "q_1",
      "response_mode": "choices",
      "choices": ["Opcion A", "Opcion B"],
      "allow_free_text": true,
      "free_text_placeholder": "Otro (escribe aqui)"
    }
  ],
  "suggested_replies": ["Opcion A", "Opcion B", "Depende del mes"]
}
`.trim();

function isObject(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function compactQuestionText(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

function clipSuggestion(text: string): string {
  const trimmed = String(text ?? '').trim().replace(/\s+/g, ' ');
  if (!trimmed) return '';
  const words = trimmed.split(' ');
  if (words.length <= MAX_WORDS_PER_CHIP) return trimmed;
  return words.slice(0, MAX_WORDS_PER_CHIP).join(' ');
}

function mergeUniqueSuggestions(candidates: string[], max: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const raw of candidates) {
    const clipped = clipSuggestion(raw);
    const key = clipped.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(clipped);
    if (out.length >= max) break;
  }

  return out;
}

function summarizeIntake(intake: JsonRecord | null | undefined): string {
  if (!intake) return 'Sin intake cargado.';
  const pick = (key: string) => (intake[key] !== undefined && intake[key] !== null ? intake[key] : null);
  return JSON.stringify(
    {
      hasDebt: pick('hasDebt'),
      exactMonthlyIncome: pick('exactMonthlyIncome'),
      incomeBand: pick('incomeBand'),
      hasSavingsOrInvestments: pick('hasSavingsOrInvestments'),
      exactSavingsAmount: pick('exactSavingsAmount'),
      financialGoal: pick('financialGoal'),
    },
    null,
    0,
  );
}

function normalizeLLMQuestion(raw: unknown, fallback: QuestionnaireLLMQuestionInput): QuestionnaireLLMQuestionOutput {
  const payload = isObject(raw) ? raw : {};
  const responseMode = payload.response_mode === 'choices' ? 'choices' : 'open_text';
  const rawChoices = Array.isArray(payload.choices)
    ? payload.choices.map((choice) => String(choice ?? '').trim()).filter(Boolean).slice(0, 4)
    : [];
  const choices = responseMode === 'choices' ? rawChoices : [];
  const allowFreeText = payload.allow_free_text !== false;
  const placeholder =
    typeof payload.free_text_placeholder === 'string'
      ? payload.free_text_placeholder.trim()
      : undefined;

  return {
    id: typeof payload.id === 'string' ? payload.id : fallback.id,
    response_mode: choices.length > 0 ? 'choices' : 'open_text',
    choices,
    allow_free_text: allowFreeText,
    free_text_placeholder: placeholder || (allowFreeText ? 'Otro (escribe aquí)' : undefined),
  };
}

function openTextFallback(input: QuestionnaireLLMQuestionInput): QuestionnaireLLMQuestionOutput {
  return {
    id: input.id,
    response_mode: 'open_text',
    choices: [],
    allow_free_text: true,
    free_text_placeholder: 'Escribe tu respuesta',
  };
}

function fallbackInteractiveTurn(questions: QuestionnaireLLMQuestionInput[]): InteractiveTurnLLMResult {
  const fields = questions.map(openTextFallback);
  return {
    questions: fields,
    suggested_replies: ['Prefiero escribir la respuesta'],
  };
}

function normalizeInteractiveTurnResult(
  parsed: unknown,
  questions: QuestionnaireLLMQuestionInput[],
): InteractiveTurnLLMResult {
  const payload = isObject(parsed) ? parsed : {};
  const byId = new Map<string, unknown>();

  for (const item of Array.isArray(payload.questions) ? payload.questions : []) {
    if (isObject(item) && typeof item.id === 'string') {
      byId.set(item.id, item);
    }
  }

  const normalizedQuestions = questions.map((question) =>
    normalizeLLMQuestion(byId.get(question.id), question),
  );

  const closingField = normalizedQuestions.at(-1);
  const choiceCandidates = closingField?.response_mode === 'choices' ? closingField.choices : [];
  const rawSuggestions = Array.isArray(payload.suggested_replies)
    ? payload.suggested_replies.map((item) => String(item ?? '').trim()).filter(Boolean)
    : [];

  const suggested_replies =
    choiceCandidates.length > 0
      ? mergeUniqueSuggestions([...choiceCandidates, ...rawSuggestions], MAX_SUGGESTIONS)
      : mergeUniqueSuggestions(
          rawSuggestions.length > 0 ? rawSuggestions : ['Prefiero escribir la respuesta'],
          MAX_SUGGESTIONS,
        );

  return {
    questions: normalizedQuestions,
    suggested_replies,
  };
}

export function extractClosingQuestionsFromText(text: string, activeChatId?: string): string[] {
  if (!text) return [];

  const normalized = text.replace(/\r\n/g, '\n');
  const matches = normalized.match(/¿[^?\n]+[?]/g) ?? [];
  const uniqueQuestions = Array.from(new Set(matches.map((match) => compactQuestionText(match))));
  if (uniqueQuestions.length === 0) return [];

  if (activeChatId === 'chat-1' || activeChatId === 'chat-2') {
    return uniqueQuestions.slice(-1);
  }

  return uniqueQuestions.slice(0, 3);
}

function collectQuestionInputs(
  agentBlocks: AgentBlock[],
  assistantMessage: string,
  activeChatId?: string,
): QuestionnaireLLMQuestionInput[] {
  const fromBlocks: QuestionnaireLLMQuestionInput[] = [];

  for (const block of agentBlocks) {
    if (block.type !== 'questionnaire') continue;
    for (const question of block.questionnaire.questions) {
      fromBlocks.push({
        id: question.id,
        question: question.question,
        existingChoices: question.choices,
      });
    }
  }

  if (fromBlocks.length > 0) return fromBlocks;

  return extractClosingQuestionsFromText(assistantMessage, activeChatId).map((question, index) => ({
    id: `q_${index + 1}`,
    question,
  }));
}

export async function resolveInteractiveTurnWithLLM(
  questions: QuestionnaireLLMQuestionInput[],
  context: QuestionnaireLLMContext = {},
): Promise<InteractiveTurnLLMResult> {
  if (questions.length === 0) {
    return { questions: [], suggested_replies: [] };
  }

  try {
    const parsed = await completeStructuredWithClaude<{
      questions?: unknown[];
      suggested_replies?: unknown[];
    }>({
      system: INTERACTIVE_TURN_LLM_SYSTEM,
      user: [
        `Chat activo: ${context.activeChatId ?? 'chat-1'}`,
        context.funnelStage ? `Etapa embudo: ${context.funnelStage}` : '',
        context.userMessage ? `Mensaje del usuario en este turno: ${context.userMessage}` : '',
        context.assistantMessage ? `Mensaje del asesor (contexto completo): ${context.assistantMessage}` : '',
        `Resumen intake: ${summarizeIntake(context.intake ?? null)}`,
        'Preguntas a configurar (cuestionario + chips del composer):',
        JSON.stringify(
          questions.map((question) => ({
            id: question.id,
            question: question.question,
            existingChoices: question.existingChoices ?? [],
          })),
          null,
          2,
        ),
      ]
        .filter(Boolean)
        .join('\n\n'),
      temperature: 0.1,
      model: resolveCoreAgentClaudeModel(),
      maxCompletionTokens: 900,
    });

    return normalizeInteractiveTurnResult(parsed, questions);
  } catch {
    return fallbackInteractiveTurn(questions);
  }
}

function applyFieldsToQuestionnaireBlock(
  block: QuestionnaireBlock,
  fields: QuestionnaireLLMQuestionOutput[],
): QuestionnaireBlock {
  const byId = new Map(fields.map((field) => [field.id, field]));

  return {
    type: 'questionnaire',
    questionnaire: {
      ...block.questionnaire,
      questions: block.questionnaire.questions.map((question) => {
        const field = byId.get(question.id) ?? openTextFallback({
          id: question.id,
          question: question.question,
          existingChoices: question.choices,
        });

        return {
          ...question,
          choices: field.choices,
          response_mode: field.response_mode,
          allow_free_text: field.allow_free_text,
          free_text_placeholder: field.free_text_placeholder ?? question.free_text_placeholder,
        };
      }),
    },
  };
}

function buildInferredQuestionnaireBlock(
  questions: QuestionnaireLLMQuestionInput[],
  fields: QuestionnaireLLMQuestionOutput[],
): QuestionnaireBlock {
  return {
    type: 'questionnaire',
    questionnaire: {
      id: `auto-${Date.now()}`,
      title: 'Responde para avanzar',
      submit_label: 'Enviar respuestas',
      questions: questions.map((input, index) => {
        const field = fields[index] ?? openTextFallback(input);
        return {
          id: input.id,
          question: input.question,
          choices: field.choices,
          response_mode: field.response_mode,
          allow_free_text: field.allow_free_text,
          free_text_placeholder: field.free_text_placeholder,
          required: true,
        };
      }),
    },
  };
}

export async function buildInteractiveTurnArtifacts(params: {
  agentBlocks: AgentBlock[];
  assistantMessage: string;
  context?: QuestionnaireLLMContext;
}): Promise<InteractiveTurnArtifacts> {
  const context = params.context ?? {};
  const questionInputs = collectQuestionInputs(
    params.agentBlocks,
    params.assistantMessage,
    context.activeChatId,
  );

  if (questionInputs.length === 0) {
    return {
      agentBlocks: params.agentBlocks,
      suggestedReplies: [],
    };
  }

  const resolved = await resolveInteractiveTurnWithLLM(questionInputs, {
    ...context,
    assistantMessage: params.assistantMessage,
  });

  const fieldsById = new Map(resolved.questions.map((field) => [field.id, field]));
  let hasQuestionnaireBlock = false;
  const agentBlocks = params.agentBlocks.map((block) => {
    if (block.type !== 'questionnaire') return block;
    hasQuestionnaireBlock = true;
    const fields = block.questionnaire.questions.map(
      (question) =>
        fieldsById.get(question.id) ??
        openTextFallback({
          id: question.id,
          question: question.question,
          existingChoices: question.choices,
        }),
    );
    return applyFieldsToQuestionnaireBlock(block, fields);
  });

  const finalBlocks = hasQuestionnaireBlock
    ? agentBlocks
    : [...agentBlocks, buildInferredQuestionnaireBlock(questionInputs, resolved.questions)];

  return {
    agentBlocks: finalBlocks,
    suggestedReplies: resolved.suggested_replies,
  };
}
