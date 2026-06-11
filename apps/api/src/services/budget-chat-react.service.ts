import type OpenAI from 'openai';
import { getOpenAIClient, withCompatibleTemperature } from './llm.service';
import {
  BUDGET_TABLE_COLUMN_HELP,
  buildBudgetTableSnapshot,
  buildBudgetWriterDigest,
  compactBudgetChatAnswers,
  computeBudgetTotals,
} from '@financial-agent/shared';
import type { BudgetAgentInput } from './budget-chat-agent.service';
import {
  BUDGET_REACT_OPENAI_TOOLS,
  budgetReactToolFromSanitized,
  executeBudgetReactTool,
  type BudgetReactCompleteTurn,
} from './budget-chat-react.tools';

const MAX_ITERATIONS = Number(process.env.BUDGET_CHAT_REACT_MAX_ITERATIONS ?? 2);
const REACT_TIMEOUT_MS = Number(process.env.BUDGET_CHAT_REACT_TIMEOUT_MS ?? 12_000);

export type BudgetReactTraceStep = {
  iteration: number;
  tool: string;
  result: string;
};

export type BudgetReactLoopResult = {
  complete: BudgetReactCompleteTurn;
  trace: BudgetReactTraceStep[];
};

function safeJsonParse(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function buildReactSystemPrompt(): string {
  return [
    'Eres el agente de presupuesto (Chile) en un loop ReAct MUY BÁSICO.',
    'Flujo: observa contexto → si necesitas datos llama herramientas de lectura/análisis → cierra SIEMPRE con budget__complete_turn.',
    '',
    'Herramientas:',
    '- budget__table_snapshot: filas y totales actuales',
    '- budget__analyze_health: score y completion local',
    '- finance__budget_analyzer: análisis 50/30/20 vía MCP (solo si el usuario pide diagnóstico/consejo)',
    '- budget__complete_turn: respuesta final + actions de tabla (add/update/delete)',
    '',
    BUDGET_TABLE_COLUMN_HELP,
    '',
    'Reglas:',
    '- Máximo 1 herramienta de análisis por turno si hace falta; luego complete_turn.',
    '- Mutaciones solo en budget__complete_turn.actions.',
    '- Montos solo con evidencia del usuario o contexto.',
    '- requires_confirmation=true si delete, ≥4 actions o cambio masivo.',
    '- next_question: una pregunta con signo de interrogación.',
    '- Español Chile, breve.',
  ].join('\n');
}

function buildReactUserPrompt(input: BudgetAgentInput): string {
  const totals = computeBudgetTotals(input.rows);
  const digest = buildBudgetWriterDigest(input.context, input.focusRow, input.userAnswer);
  return [
    `MODE=${input.mode}`,
    `CURRENT_QUESTION=${JSON.stringify(input.currentQuestion)}`,
    `USER_ANSWER=${JSON.stringify(input.userAnswer)}`,
    `TABLE_ROWS=${JSON.stringify(buildBudgetTableSnapshot(input.rows))}`,
    `TABLE_TOTALS=${JSON.stringify(totals)}`,
    `CONTEXT=${JSON.stringify(digest)}`,
    `RECENT_CHAT=${JSON.stringify(compactBudgetChatAnswers(input.chatAnswers))}`,
  ].join('\n');
}

function resolveReactModel(): string {
  return (
    process.env.BUDGET_CHAT_AGENT_MODEL?.trim() ||
    process.env.BUDGET_CHAT_PLANNER_MODEL?.trim() ||
    process.env.OPENAI_MODEL_FAST?.trim() ||
    'gpt-4o-mini'
  );
}

export function isBudgetReactEnabled(): boolean {
  if (process.env.BUDGET_CHAT_REACT_ENABLED === 'false') return false;
  if (process.env.BUDGET_CHAT_AGENT_ENABLED === 'false') return false;
  if (process.env.NODE_ENV === 'test') return process.env.BUDGET_CHAT_REACT_ENABLED === 'true';
  return true;
}

export async function runBudgetChatReactLoop(
  input: BudgetAgentInput,
  userId: string,
): Promise<BudgetReactLoopResult | null> {
  const client = getOpenAIClient();
  const model = resolveReactModel();
  const turnId = `budget-react-${Date.now()}`;
  const start = Date.now();
  const trace: BudgetReactTraceStep[] = [];

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: buildReactSystemPrompt() },
    { role: 'user', content: buildReactUserPrompt(input) },
  ];

  const iterationBudget = Math.max(1, Math.min(4, MAX_ITERATIONS));

  for (let iteration = 1; iteration <= iterationBudget; iteration += 1) {
    if (Date.now() - start > REACT_TIMEOUT_MS) break;

    const isLastIteration = iteration === iterationBudget;
    const response = await client.chat.completions.create(
      withCompatibleTemperature(
        {
          model,
          max_completion_tokens: 2400,
          tools: BUDGET_REACT_OPENAI_TOOLS,
          tool_choice: isLastIteration
            ? { type: 'function', function: { name: 'budget__complete_turn' } }
            : 'auto',
          messages,
        },
        model,
        0.35,
      ) as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
    );

    const assistantMessage = response.choices?.[0]?.message;
    if (!assistantMessage) return null;

    const toolCalls = assistantMessage.tool_calls ?? [];
    if (toolCalls.length === 0) {
      if (assistantMessage.content) {
        messages.push({ role: 'assistant', content: assistantMessage.content });
      }
      continue;
    }

    messages.push({
      role: 'assistant',
      content: assistantMessage.content ?? null,
      tool_calls: toolCalls,
    });

    let completed: BudgetReactCompleteTurn | null = null;

    for (const toolCall of toolCalls) {
      const sanitized = toolCall.function.name;
      const canonical = budgetReactToolFromSanitized(sanitized);
      const args = safeJsonParse(toolCall.function.arguments ?? '{}');

      if (canonical === 'budget.complete_turn') {
        completed = {
          assistant_reply: String(args.assistant_reply ?? ''),
          next_question: String(args.next_question ?? ''),
          focus_row_id: (args.focus_row_id as string | null) ?? null,
          actions: Array.isArray(args.actions) ? (args.actions as BudgetReactCompleteTurn['actions']) : [],
          requires_confirmation: Boolean(args.requires_confirmation),
          pending_summary: (args.pending_summary as string | null) ?? null,
        };
        trace.push({ iteration, tool: sanitized, result: 'complete_turn' });
        continue;
      }

      if (!canonical) {
        trace.push({ iteration, tool: sanitized, result: 'unknown_tool' });
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify({ ok: false, error: 'unknown_tool' }),
        });
        continue;
      }

      const executed = await executeBudgetReactTool({
        tool: canonical,
        rows: input.rows,
        context: input.context,
        userId,
        turnId,
      });
      trace.push({
        iteration,
        tool: sanitized,
        result: executed.ok ? 'ok' : String(executed.error ?? 'error'),
      });
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(executed),
      });
    }

    if (completed) {
      return { complete: completed, trace };
    }
  }

  return null;
}
