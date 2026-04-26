/**
 * plan-execute.phase.ts
 *
 * PHASE 2-3: Planning + Execution (ReAct Loop)
 * Decides which tools to call and executes them in a loop
 */

import { getOpenAIClient, withCompatibleTemperature } from '../../../services/llm.service';
import { buildOpenAITools, getOriginalToolName } from '../../../mcp/openai-bridge';
import { runMCPTool } from '../../../mcp/tools/runMCPTool';
import { CORE_TOOL_AGENT_SYSTEM } from '../system.prompts';
import { extractChartBlocksFromToolOutput } from '../helpers/chart-extraction.helpers';
import { isArtifactLike } from '../helpers/validation.helpers';
import type { ExecutionResult, PlanPhaseInput, PlanPhaseOutput } from '../agent-types';
import type { ToolCall, Citation, Artifact, AgentBlock } from '../chat.types';
import { getLogger } from '../../../logger';
import type OpenAI from 'openai';

const MAX_REACT_ITERATIONS = Number(process.env.AGENT_MAX_REACT_ITERATIONS || 4);
const REACT_TIMEOUT_MS = Number(process.env.AGENT_REACT_TIMEOUT_MS || 18000);

/**
 * Run ReAct loop: classify → identify tools → execute in loop until complete
 */
export async function runPlanExecutePhase(input: PlanPhaseInput): Promise<PlanPhaseOutput> {
  const logger = getLogger();
  const startTime = Date.now();

  try {
    const client = getOpenAIClient();

    // Build tool definitions for OpenAI
    const openaiTools = buildOpenAITools();

    // Initialize accumulators
    const tool_calls: ToolCall[] = [];
    const tool_outputs: Array<{ tool: string; data: any }> = [];
    const citations: Citation[] = [];
    const artifacts: Artifact[] = [];
    const agent_blocks: AgentBlock[] = [];
    const react_trace: Array<{ iteration: number; decision: string; result: string }> = [];

    // Build loop messages
    const loopMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: CORE_TOOL_AGENT_SYSTEM,
      },
      {
        role: 'user',
        content: buildExecutionPrompt(input),
      },
    ];

    // ReAct Loop
    let iterations = 0;
    let is_complete = false;

    while (iterations < MAX_REACT_ITERATIONS && !is_complete && Date.now() - startTime < REACT_TIMEOUT_MS) {
      iterations++;
      const planMaxTokens = Number(process.env.OPENAI_PLAN_MAX_COMPLETION_TOKENS || 1024);

      // Call OpenAI with tool calling
      const model = process.env.OPENAI_MODEL || 'gpt-5.1-codex';
      const response = await client.chat.completions.create(
        withCompatibleTemperature(
          {
            model,
            max_completion_tokens: Number.isFinite(planMaxTokens) ? planMaxTokens : 2048,
            tools: openaiTools,
            tool_choice: 'auto',
            messages: loopMessages,
          },
          model,
          0,
        ) as any,
      );

      const assistantMessage = response.choices[0]?.message;
      if (!assistantMessage) {
        is_complete = true;
        break;
      }

      const assistantText = typeof assistantMessage.content === 'string'
        ? assistantMessage.content
        : '';

      // Check if model is done without tool calls
      if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
        is_complete = true;
        if (assistantText) loopMessages.push({ role: 'assistant', content: assistantText });
        break;
      }

      // Add assistant message with requested tool calls
      loopMessages.push({
        role: 'assistant',
        content: assistantText || null,
        tool_calls: assistantMessage.tool_calls,
      });

      // Execute each tool
      for (const toolUse of assistantMessage.tool_calls) {
        const originalName = getOriginalToolName(toolUse.function.name);
        const parsedArgs = safeJsonParse(toolUse.function.arguments);

        react_trace.push({
          iteration: iterations,
          decision: `Use tool: ${originalName}`,
          result: 'pending',
        });

        try {
          let result: any;

          // Execute MCP tool with proper contract
          const toolResult = await runMCPTool({
            tool: originalName,
            args: parsedArgs,
            turn_id: input.turn_id || 'unknown',
            user_id: input.user_id || 'unknown',
          });

          if (toolResult.tool_call?.status === 'success' || !toolResult.tool_call?.status) {
            // Extract charts if present
            const charts = extractChartBlocksFromToolOutput(
              JSON.stringify(toolResult.data)
            );
            agent_blocks.push(...charts);

            // Extract citations if present (support both top-level and nested shapes)
            if (Array.isArray(toolResult.citations)) {
              citations.push(...toolResult.citations);
            }
            if (Array.isArray(toolResult.data?.citations)) {
              citations.push(...toolResult.data.citations);
            }

            // Extract artifact(s) if present (single or list)
            const data = toolResult.data;
            if (isArtifactLike(data)) {
              artifacts.push(data as Artifact);
            }
            if (Array.isArray(data?.artifacts)) {
              for (const a of data.artifacts) {
                if (isArtifactLike(a)) artifacts.push(a as Artifact);
              }
            }
            if (isArtifactLike(data?.artifact)) {
              artifacts.push(data.artifact as Artifact);
            }

            result = toolResult.data;
          } else {
            result = { error: toolResult.data?.error || 'Tool execution failed' };
          }

          tool_calls.push({
            id: toolUse.id,
            tool: originalName,
            args: parsedArgs,
            status: 'success',
          });

          tool_outputs.push({
            tool: originalName,
            data: result,
          });

          loopMessages.push({
            role: 'tool',
            tool_call_id: toolUse.id,
            content: JSON.stringify(result),
          });

          react_trace[react_trace.length - 1].result = 'success';
        } catch (err) {
          logger.warn({
            msg: '[Execute] Tool failed',
            tool: originalName,
            error: err,
          });

          tool_calls.push({
            id: toolUse.id,
            tool: originalName,
            args: parsedArgs,
            status: 'error',
          });

          loopMessages.push({
            role: 'tool',
            tool_call_id: toolUse.id,
            content: JSON.stringify({ error: String(err) }),
          });

          react_trace[react_trace.length - 1].result = 'failed';
        }
      }

    }

    // Fallback robusto: si el usuario pidió PDF y el modelo no llamó tools PDF,
    // intentamos generar un informe narrativo base para no cortar la experiencia.
    const userAskedPdf = /\b(pdf|reporte|informe|documento|descargable|archivo)\b/i.test(
      input.user_message || ''
    );
    if (userAskedPdf && artifacts.length === 0) {
      react_trace.push({
        iteration: iterations + 1,
        decision: 'Fallback PDF generation',
        result: 'pending',
      });
      try {
        const fallbackArgs = {
          title: 'Informe financiero personalizado',
          subtitle: 'Generado automáticamente desde la conversación',
          style: 'corporativo' as const,
          source: 'analysis' as const,
          sections: [
            {
              heading: 'Solicitud del usuario',
              body: String(input.user_message || '').slice(0, 2200),
            },
            {
              heading: 'Contexto disponible',
              body: JSON.stringify(input.context_summary || {}, null, 2).slice(0, 3800),
            },
            {
              heading: 'Próximos pasos sugeridos',
              body: 'Validar supuestos, completar datos faltantes y ejecutar una simulación con escenarios para tomar una decisión accionable.',
            },
          ],
        };

        const toolResult = await runMCPTool({
          tool: 'pdf.generate_report',
          args: fallbackArgs,
          turn_id: input.turn_id || 'unknown',
          user_id: input.user_id || 'unknown',
        });

        const resultData = toolResult.data;
        tool_calls.push({
          id: `${input.turn_id || 'unknown'}:pdf.generate_report:fallback`,
          tool: 'pdf.generate_report',
          args: fallbackArgs,
          status:
            toolResult.tool_call?.status === 'success' || !toolResult.tool_call?.status
              ? 'success'
              : 'error',
        });
        tool_outputs.push({
          tool: 'pdf.generate_report',
          data: resultData,
        });

        if (isArtifactLike(resultData)) {
          artifacts.push(resultData as Artifact);
        }
        if (Array.isArray(resultData?.artifacts)) {
          for (const a of resultData.artifacts) {
            if (isArtifactLike(a)) artifacts.push(a as Artifact);
          }
        }
        if (isArtifactLike(resultData?.artifact)) {
          artifacts.push(resultData.artifact as Artifact);
        }

        react_trace[react_trace.length - 1].result = 'success';
      } catch {
        react_trace[react_trace.length - 1].result = 'failed';
      }
    }

    const uniqueArtifacts = Array.from(
      new Map(artifacts.map((a) => [a.id, a])).values()
    );

    const execution_result: ExecutionResult = {
      tool_calls,
      tool_outputs,
      artifacts: uniqueArtifacts,
      agent_blocks,
      citations,
      react_trace,
      iterations_count: iterations,
    };

    logger.info({
      msg: '[Execute] ReAct loop complete',
      iterations,
      tool_calls_count: tool_calls.length,
      latency_ms: Date.now() - startTime,
    });

    return {
      execution_result,
      plan_objective: input.classification.intent,
    };
  } catch (err) {
    logger.error({
      msg: '[Execute] Phase failed',
      error: err,
      latency_ms: Date.now() - startTime,
    });
    throw err;
  }
}

function safeJsonParse(raw: string): Record<string, any> {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, any>;
    }
    return {};
  } catch {
    return {};
  }
}

/**
 * Build execution prompt for ReAct loop
 */
function buildExecutionPrompt(input: PlanPhaseInput): string {
  const productDirective =
    typeof input.context_summary?.product_directive === 'string'
      ? input.context_summary.product_directive
      : '';
  return `
User intent: ${input.classification.intent}
Mode: ${input.classification.mode}

Product directive:
${productDirective || 'No product-specific directive.'}

User context:
${JSON.stringify(input.context_summary, null, 2)}

Please use available tools to fulfill the user's request.
`;
}
