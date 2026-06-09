// apps/api/src/services/llm.service.ts
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

export type LLMMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export function createMessage(role: LLMMessage['role'], content: string): LLMMessage {
  return { role, content };
}

let _client: Anthropic | null = null;
let _openaiClient: OpenAI | null = null;

export function getAnthropicClient(): Anthropic {
  if (_client) return _client;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY no está definido');

  _client = new Anthropic({ apiKey });
  return _client;
}

export function getOpenAIClient(): OpenAI {
  if (_openaiClient) return _openaiClient;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY no está definido');

  _openaiClient = new OpenAI({ apiKey });
  return _openaiClient;
}

type CompleteOptions = {
  systemPrompt?: string;
  temperature?: number;
  model?: string;
  maxCompletionTokens?: number;
  /** When false (default), Anthropic errors propagate instead of falling back to OpenAI. */
  allowOpenAIFallback?: boolean;
};

type LLMBudgetMode = 'balanced' | 'fast' | 'quality';

function getBudgetMode(): LLMBudgetMode {
  const raw = (process.env.AGENT_LLM_BUDGET_MODE ?? 'balanced').trim().toLowerCase();
  if (raw === 'fast' || raw === 'quality' || raw === 'balanced') return raw;
  return 'balanced';
}

function estimateInputChars(input: string | LLMMessage[]): number {
  if (typeof input === 'string') return input.length;
  return input.reduce((acc, msg) => acc + (msg.content?.length ?? 0), 0);
}

function resolveOpenAIModel(inputChars: number, explicitModel?: string): string {
  if (explicitModel && explicitModel.trim().length > 0) return explicitModel;

  const primary = (process.env.OPENAI_MODEL ?? 'gpt-5.2').trim();
  const fast = (process.env.OPENAI_MODEL_FAST ?? primary).trim();
  const quality = (process.env.OPENAI_MODEL_QUALITY ?? primary).trim();
  const mode = getBudgetMode();

  if (mode === 'quality') return quality || primary;
  if (mode === 'fast') return fast || primary;

  // balanced: prompts cortos van a fast model; prompts largos conservan calidad.
  if (inputChars <= 1400 && fast) return fast;
  return primary;
}

function resolveOpenAIMaxTokens(inputChars: number, explicitMax?: number, fallback = 2048): number {
  if (Number.isFinite(explicitMax) && (explicitMax as number) > 64) {
    return Math.max(128, Number(explicitMax));
  }
  const mode = getBudgetMode();
  if (mode === 'quality') return fallback;
  if (mode === 'fast') return Math.min(fallback, 700);

  if (inputChars <= 900) return Math.min(fallback, 700);
  if (inputChars <= 2200) return Math.min(fallback, 1000);
  return fallback;
}

export function supportsCustomTemperature(model: string): boolean {
  return !/^gpt-5(?:[.\-_]|$)/i.test(model);
}

export function withCompatibleTemperature<T extends Record<string, unknown>>(
  params: T,
  model: string,
  temperature: number | undefined,
): T & { temperature?: number } {
  if (typeof temperature === 'number' && supportsCustomTemperature(model)) {
    return { ...params, temperature };
  }
  return params;
}

// ✅ Overloads
export async function complete(input: string, options?: CompleteOptions): Promise<string>;
export async function complete(input: LLMMessage[], options?: CompleteOptions): Promise<string>;
export async function complete(
  input: string | LLMMessage[],
  options?: CompleteOptions
): Promise<string> {
  const client = getOpenAIClient();
  const inputChars = estimateInputChars(input);
  const model = resolveOpenAIModel(inputChars, options?.model);
  const envTemp = process.env.OPENAI_TEMPERATURE
    ? Number(process.env.OPENAI_TEMPERATURE)
    : undefined;
  const temperature = options?.temperature ?? (Number.isFinite(envTemp) ? envTemp : 0.6);

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

  if (typeof input === 'string') {
    messages.push({
      role: 'system',
      content: options?.systemPrompt ?? 'Eres un asistente profesional.',
    });
    messages.push({ role: 'user', content: input });
  } else {
    for (const m of input) {
      if (m.role === 'system') {
        messages.push({ role: 'system', content: m.content });
      } else {
        messages.push({ role: m.role, content: m.content });
      }
    }
  }

  const envMaxCompletionTokens = Number(process.env.OPENAI_MAX_COMPLETION_TOKENS || 2048);
  const maxCompletionTokens = resolveOpenAIMaxTokens(
    inputChars,
    options?.maxCompletionTokens,
    Number.isFinite(envMaxCompletionTokens) ? envMaxCompletionTokens : 2048,
  );
  const response = await client.chat.completions.create(
    withCompatibleTemperature(
      {
        model,
        max_completion_tokens: maxCompletionTokens,
        messages,
      },
      model,
      temperature,
    ) as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
  );

  return response.choices[0]?.message?.content?.trim() ?? '';
}

export async function completeStructured<T>(params: {
  system: string;
  user: string;
  temperature?: number;
  model?: string;
  maxCompletionTokens?: number;
}): Promise<T> {
  const client = getOpenAIClient();
  const inputChars = params.system.length + params.user.length;
  const model = resolveOpenAIModel(inputChars, params.model);
  const envStructuredMaxTokens = Number(process.env.OPENAI_STRUCTURED_MAX_COMPLETION_TOKENS || 1536);
  const structuredMaxTokens = resolveOpenAIMaxTokens(
    inputChars,
    params.maxCompletionTokens,
    Number.isFinite(envStructuredMaxTokens) ? envStructuredMaxTokens : 1536,
  );

  const response = await client.chat.completions.create(
    withCompatibleTemperature(
      {
        model,
        max_completion_tokens: structuredMaxTokens,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `${params.system}\n\nIMPORTANTE: Responde ÚNICAMENTE con JSON válido. Sin texto adicional, sin markdown, sin bloques de código.`,
          },
          { role: 'user', content: params.user },
        ],
      },
      model,
      params.temperature ?? 0,
    ) as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
  );

  const raw = response.choices[0]?.message?.content?.trim();
  if (!raw) throw new Error('Respuesta LLM vacía en completeStructured');

  // Extraer JSON de posible bloque markdown ```json ... ```
  const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = codeBlockMatch ? codeBlockMatch[1].trim() : raw;

  return JSON.parse(jsonStr) as T;
}

export function parseStructuredResponsePayload(
  response: Pick<OpenAI.Responses.Response, 'output' | 'output_text' | 'status'>,
): string {
  for (const item of response.output ?? []) {
    if (item.type !== 'message') continue;
    for (const part of item.content ?? []) {
      if (part.type === 'refusal') {
        const refusal = 'refusal' in part ? String(part.refusal ?? '').trim() : '';
        throw new Error(
          refusal ? `Modelo rechazó la solicitud: ${refusal}` : 'Modelo rechazó la solicitud por políticas de seguridad.',
        );
      }
    }
  }

  if (response.status === 'incomplete') {
    throw new Error('Respuesta LLM incompleta (límite de tokens o interrupción).');
  }

  const raw = response.output_text?.trim();
  if (!raw) throw new Error('Respuesta LLM vacía en completeStructuredWithSchema');
  const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  return codeBlockMatch ? codeBlockMatch[1].trim() : raw;
}

export async function completeStructuredWithSchema<T>(params: {
  instructions: string;
  input: string | OpenAI.Responses.ResponseInput;
  schema: Record<string, unknown>;
  name: string;
  description?: string;
  temperature?: number;
  model?: string;
  maxOutputTokens?: number;
}): Promise<T> {
  const client = getOpenAIClient();
  const inputChars = typeof params.input === 'string' ? params.input.length : JSON.stringify(params.input).length;
  const model = resolveOpenAIModel(inputChars + params.instructions.length, params.model);
  const envStructuredMaxTokens = Number(
    process.env.OPENAI_STRUCTURED_MAX_OUTPUT_TOKENS || process.env.OPENAI_STRUCTURED_MAX_COMPLETION_TOKENS || 1536,
  );
  const maxOutputTokens = resolveOpenAIMaxTokens(
    inputChars,
    params.maxOutputTokens,
    Number.isFinite(envStructuredMaxTokens) ? envStructuredMaxTokens : 1536,
  );

  const response = await client.responses.create({
    model,
    instructions: params.instructions,
    input: params.input,
    max_output_tokens: maxOutputTokens,
    store: false,
    temperature: params.temperature ?? 0,
    text: {
      format: {
        type: 'json_schema',
        name: params.name,
        schema: params.schema,
        strict: true,
        description: params.description,
      },
    },
  });

  const jsonStr = parseStructuredResponsePayload(response);
  return JSON.parse(jsonStr) as T;
}

function resolveAnthropicModel(inputChars: number, explicitModel?: string): string {
  if (explicitModel && explicitModel.trim().length > 0) return explicitModel.trim();

  const primaryModel = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6';
  const fastModel = process.env.ANTHROPIC_MODEL_FAST?.trim() || 'claude-haiku-4-5';
  const qualityModel = process.env.ANTHROPIC_MODEL_QUALITY?.trim();
  const mode = getBudgetMode();

  if (mode === 'quality') return qualityModel || primaryModel;
  if (mode === 'fast') return fastModel;
  return inputChars <= 1200 ? fastModel : primaryModel;
}

export async function completeStructuredWithClaude<T>(params: {
  system: string;
  user: string;
  temperature?: number;
  model?: string;
  maxCompletionTokens?: number;
}): Promise<T> {
  const inputChars = params.system.length + params.user.length;
  const model = resolveAnthropicModel(inputChars, params.model);
  const raw = await completeWithClaude(params.user, {
    systemPrompt: `${params.system}\n\nIMPORTANTE: Responde ÚNICAMENTE con JSON válido. Sin texto adicional, sin markdown, sin bloques de código.`,
    temperature: params.temperature ?? 0,
    model,
    maxCompletionTokens: params.maxCompletionTokens,
    allowOpenAIFallback: false,
  });

  const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = codeBlockMatch ? codeBlockMatch[1].trim() : raw;
  if (!jsonStr) throw new Error('Respuesta LLM vacía en completeStructuredWithClaude');
  return JSON.parse(jsonStr) as T;
}

export async function completeWithClaude(
  input: string,
  options?: CompleteOptions
): Promise<string> {
  const inputChars = input.length;
  const model = resolveAnthropicModel(inputChars, options?.model);
  const envTemp = process.env.ANTHROPIC_TEMPERATURE
    ? Number(process.env.ANTHROPIC_TEMPERATURE)
    : undefined;
  const temperature = options?.temperature ?? (Number.isFinite(envTemp) ? envTemp : 0.6);
  const envAnthropicMaxTokens = Number(process.env.ANTHROPIC_MAX_TOKENS || 2048);
  const anthropicMaxTokens = resolveOpenAIMaxTokens(
    inputChars,
    options?.maxCompletionTokens,
    Number.isFinite(envAnthropicMaxTokens) ? envAnthropicMaxTokens : 2048,
  );

  if (/^(gpt-|o\d|text-embedding|omni)/i.test(model)) {
    if (options?.allowOpenAIFallback === true) {
      return complete(input, {
        systemPrompt: options?.systemPrompt,
        temperature,
        model,
      });
    }
    throw new Error(`Modelo Anthropic inválido configurado: ${model}`);
  }

  const client = getAnthropicClient();
  const response = await client.messages.create({
    model,
    max_tokens: anthropicMaxTokens,
    temperature,
    system: options?.systemPrompt ?? 'Eres un asistente profesional.',
    messages: [{ role: 'user', content: input }],
  });

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
  return textBlock?.text?.trim() ?? '';
}

type StreamDeltaHandler = (delta: string) => void;

export async function completeStream(
  input: string,
  options: CompleteOptions | undefined,
  onDelta: StreamDeltaHandler,
): Promise<string> {
  const client = getOpenAIClient();
  const inputChars = input.length;
  const model = resolveOpenAIModel(inputChars, options?.model);
  const envTemp = process.env.OPENAI_TEMPERATURE
    ? Number(process.env.OPENAI_TEMPERATURE)
    : undefined;
  const temperature = options?.temperature ?? (Number.isFinite(envTemp) ? envTemp : 0.6);
  const envMaxCompletionTokens = Number(process.env.OPENAI_MAX_COMPLETION_TOKENS || 2048);
  const maxCompletionTokens = resolveOpenAIMaxTokens(
    inputChars,
    options?.maxCompletionTokens,
    Number.isFinite(envMaxCompletionTokens) ? envMaxCompletionTokens : 2048,
  );

  const stream = await client.chat.completions.create(
    withCompatibleTemperature(
      {
        model,
        max_completion_tokens: maxCompletionTokens,
        stream: true,
        messages: [
          {
            role: 'system',
            content: options?.systemPrompt ?? 'Eres un asistente profesional.',
          },
          { role: 'user', content: input },
        ],
      },
      model,
      temperature,
    ) as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming,
  );

  let full = '';
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content ?? '';
    if (!delta) continue;
    full += delta;
    onDelta(delta);
  }
  return full.trim();
}

export async function completeWithClaudeStream(
  input: string,
  options: CompleteOptions | undefined,
  onDelta: StreamDeltaHandler,
): Promise<string> {
  const inputChars = input.length;
  const model = resolveAnthropicModel(inputChars, options?.model);

  if (/^(gpt-|o\d|text-embedding|omni)/i.test(model)) {
    if (options?.allowOpenAIFallback === true) {
      return completeStream(input, options, onDelta);
    }
    throw new Error(`Modelo Anthropic inválido configurado: ${model}`);
  }

  const client = getAnthropicClient();
  const envTemp = process.env.ANTHROPIC_TEMPERATURE
    ? Number(process.env.ANTHROPIC_TEMPERATURE)
    : undefined;
  const temperature = options?.temperature ?? (Number.isFinite(envTemp) ? envTemp : 0.6);
  const envAnthropicMaxTokens = Number(process.env.ANTHROPIC_MAX_TOKENS || 2048);
  const anthropicMaxTokens = resolveOpenAIMaxTokens(
    inputChars,
    options?.maxCompletionTokens,
    Number.isFinite(envAnthropicMaxTokens) ? envAnthropicMaxTokens : 2048,
  );

  const stream = client.messages.stream({
    model,
    max_tokens: anthropicMaxTokens,
    temperature,
    system: options?.systemPrompt ?? 'Eres un asistente profesional.',
    messages: [{ role: 'user', content: input }],
  });

  let full = '';
  for await (const event of stream) {
    if (event.type !== 'content_block_delta') continue;
    if (event.delta.type !== 'text_delta') continue;
    const delta = event.delta.text ?? '';
    if (!delta) continue;
    full += delta;
    onDelta(delta);
  }
  return full.trim();
}
