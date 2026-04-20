// apps/api/src/services/llm.service.ts
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

export type LLMMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

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
};

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
  const model = options?.model ?? process.env.OPENAI_MODEL ?? 'gpt-5.2';
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

  const maxCompletionTokens = Number(process.env.OPENAI_MAX_COMPLETION_TOKENS || 2048);
  const response = await client.chat.completions.create(
    withCompatibleTemperature(
      {
        model,
        max_completion_tokens: Number.isFinite(maxCompletionTokens) ? maxCompletionTokens : 2048,
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
}): Promise<T> {
  const client = getOpenAIClient();
  const model = params.model ?? process.env.OPENAI_MODEL ?? 'gpt-5.2';
  const structuredMaxTokens = Number(process.env.OPENAI_STRUCTURED_MAX_COMPLETION_TOKENS || 1536);

  const response = await client.chat.completions.create(
    withCompatibleTemperature(
      {
        model,
        max_completion_tokens: Number.isFinite(structuredMaxTokens) ? structuredMaxTokens : 1536,
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

export async function completeWithClaude(
  input: string,
  options?: CompleteOptions
): Promise<string> {
  const model = options?.model ?? process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6';
  const envTemp = process.env.ANTHROPIC_TEMPERATURE
    ? Number(process.env.ANTHROPIC_TEMPERATURE)
    : undefined;
  const temperature = options?.temperature ?? (Number.isFinite(envTemp) ? envTemp : 0.6);
  const anthropicMaxTokens = Number(process.env.ANTHROPIC_MAX_TOKENS || 2048);

  // Defensive fallback: if env accidentally points to an OpenAI model, avoid Anthropic call.
  if (/^(gpt-|o\d|text-embedding|omni)/i.test(model)) {
    return complete(input, {
      systemPrompt: options?.systemPrompt,
      temperature,
      model,
    });
  }

  try {
    const client = getAnthropicClient();
    const response = await client.messages.create({
      model,
      max_tokens: Number.isFinite(anthropicMaxTokens) ? anthropicMaxTokens : 2048,
      temperature,
      system: options?.systemPrompt ?? 'Eres un asistente profesional.',
      messages: [{ role: 'user', content: input }],
    });

    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
    return textBlock?.text?.trim() ?? '';
  } catch {
    // Non-blocking fallback to OpenAI brain to keep /api/agent responsive.
    return complete(input, {
      systemPrompt: options?.systemPrompt,
      temperature,
    });
  }
}
